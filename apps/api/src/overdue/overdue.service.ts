import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type DrawOverdueResponse,
  type OverdueGroup,
  type OverdueSource,
  OVERDUE_DAYS_BACK,
  type ResultSource,
  drawDateOf,
  overdueFromLastDates,
  overdueGroups,
} from '@sysjb/contracts';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { OverdueApiError, fetchOverdue } from './overdue-client.js';
import { normalizeOverdue } from './overdue-normalizer.js';

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);

/** Cache lido do banco: '' no banco = nunca saiu. */
interface Snapshot {
  lastDates: Array<string | null>;
  fetchedAt: Date;
}

/**
 * Loterias > Atrasados: há quantos dias cada grupo não sai na cabeça de um sorteio da banca.
 *
 * Com a API de atrasados ligada (OVERDUE_API_TOKEN), o jogador lê do cache por loteria/extração do provedor; o cache
 * vence com resultado novo do sorteio ou depois de OVERDUE_CACHE_MINUTES, e só então a API busca de novo (uma busca por
 * vez por loteria/extração nesta instância: pedidos simultâneos esperam a mesma). Se a busca falhar, vale o cache antigo;
 * sem cache, 503. Loteria fora do plano do provedor (ou API desligada) usa os resultados guardados aqui.
 */
@Injectable()
export class OverdueService {
  private readonly logger = new Logger('Overdue');
  /** Buscas em andamento por loteria/extração. */
  private readonly inFlight = new Map<string, Promise<Array<string | null>>>();
  /** Loteria/extração recusada pelo provedor (fora do plano): não pergunta de novo até o prazo do cache. */
  private readonly unavailableUntil = new Map<string, number>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  /** Sorteio de outra banca, inativo, inexistente ou sem resultado ligado = 404, sem dizer qual dos casos. */
  async forDraw(tenant: ResolvedTenant, drawId: string): Promise<DrawOverdueResponse> {
    const draw = await this.db.withTenant(tenant.id, (tx) =>
      tx.draw.findFirst({
        where: { tenantId: tenant.id, id: drawId, active: true },
        select: { id: true, name: true, resultLottery: true, resultExtraction: true },
      }),
    );
    if (!draw || draw.resultLottery === null || draw.resultExtraction === null) {
      throw new AppError(404, 'NOT_FOUND', 'Sorteio não encontrado.');
    }
    const today = drawDateOf(new Date().toISOString(), 0);
    const { source, groups } = await this.groups(
      { lottery: draw.resultLottery, extraction: draw.resultExtraction },
      today,
    );
    return { drawId: draw.id, drawName: draw.name, date: today, source, groups };
  }

  private async groups(
    source: ResultSource,
    today: string,
  ): Promise<{ source: OverdueSource; groups: OverdueGroup[] }> {
    const fromHistory = async () => ({ source: 'history' as const, groups: await this.fromHistory(source, today) });
    const fromProvider = (lastDates: Array<string | null>) => ({
      source: 'provider' as const,
      groups: overdueFromLastDates(lastDates, today),
    });

    const api = this.config.overdue;
    const key = `${source.lottery}:${String(source.extraction).padStart(2, '0')}`;
    if (!api || (this.unavailableUntil.get(key) ?? 0) > Date.now()) return fromHistory();

    const snapshot = await this.readSnapshot(source);
    if (snapshot && (await this.isFresh(snapshot, source, api.cacheMinutes))) return fromProvider(snapshot.lastDates);

    try {
      return fromProvider(await this.refresh(key, source));
    } catch (error) {
      const known = error instanceof OverdueApiError ? error : null;
      if (known?.kind === 'unavailable') {
        this.logger.warn(`${key}: ${known.message}; usando os resultados guardados`);
        this.unavailableUntil.set(key, Date.now() + api.cacheMinutes * 60_000);
        return fromHistory();
      }
      const reason = known?.message ?? 'falha inesperada';
      if (snapshot) {
        this.logger.warn(`${key}: ${reason}; usando o cache de ${snapshot.fetchedAt.toISOString()}`);
        return fromProvider(snapshot.lastDates);
      }
      this.logger[known?.kind === 'fatal' ? 'error' : 'warn'](`${key}: ${reason}; sem cache`);
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Atrasados indisponíveis no momento. Tente novamente.');
    }
  }

  /** Uma busca por vez por loteria/extração: quem chega durante a busca espera a mesma resposta. */
  private refresh(key: string, source: ResultSource): Promise<Array<string | null>> {
    const running = this.inFlight.get(key);
    if (running) return running;
    const promise = this.fetchAndStore(key, source).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async fetchAndStore(key: string, source: ResultSource): Promise<Array<string | null>> {
    const api = this.config.overdue!;
    // Início da busca pelo relógio do banco: resultado que chegar durante a busca deixa o cache vencido.
    const [{ startedAt }] = await this.db.client.$queryRaw<[{ startedAt: Date }]>`
      SELECT clock_timestamp() AS "startedAt"`;
    const body = await fetchOverdue(api, source);
    const normalized = normalizeOverdue(body, source);
    if (!normalized) throw new OverdueApiError('resposta dos atrasados em formato inesperado', 'fatal');

    const lastDates = normalized.lastDates.map((date) => date ?? '');
    // Não troca um cache de busca mais nova (outra instância) por este.
    await this.db.client.$executeRaw`
      INSERT INTO overdue_snapshots (lottery, extraction, last_dates, reference_date, fetched_at)
      VALUES (${source.lottery}, ${source.extraction}, ${lastDates}::text[], ${normalized.referenceDate}::date,
              ${startedAt})
      ON CONFLICT (lottery, extraction) DO UPDATE
        SET last_dates = EXCLUDED.last_dates, reference_date = EXCLUDED.reference_date, fetched_at = EXCLUDED.fetched_at
        WHERE overdue_snapshots.fetched_at <= EXCLUDED.fetched_at`;
    this.logger.log(`${key}: atrasados atualizados (referência ${normalized.referenceDate})`);
    return normalized.lastDates;
  }

  private async readSnapshot(source: ResultSource): Promise<Snapshot | null> {
    const row = await this.db.client.overdueSnapshot.findUnique({
      where: { lottery_extraction: { lottery: source.lottery, extraction: source.extraction } },
      select: { lastDates: true, fetchedAt: true },
    });
    return row ? { lastDates: row.lastDates.map((date) => date || null), fetchedAt: row.fetchedAt } : null;
  }

  /** Dentro do prazo e buscado depois do último resultado (ou correção) do sorteio. */
  private async isFresh(snapshot: Snapshot, source: ResultSource, cacheMinutes: number): Promise<boolean> {
    if (Date.now() - snapshot.fetchedAt.getTime() >= cacheMinutes * 60_000) return false;
    const latest = await this.db.client.lotteryResult.findFirst({
      where: { lottery: source.lottery, extraction: source.extraction },
      orderBy: { drawDate: 'desc' },
      select: { updatedAt: true },
    });
    return !latest || latest.updatedAt < snapshot.fetchedAt;
  }

  /** Pelos resultados guardados aqui (o último ano). No máximo um resultado por dia (índice único). */
  private async fromHistory(source: ResultSource, today: string): Promise<OverdueGroup[]> {
    const since = drawDateOf(`${today}T12:00:00Z`, -OVERDUE_DAYS_BACK);
    const rows = await this.db.client.lotteryResult.findMany({
      where: {
        lottery: source.lottery,
        extraction: source.extraction,
        drawDate: { gte: toDate(since), lte: toDate(today) },
      },
      select: { drawDate: true, prizes: true },
      orderBy: { drawDate: 'desc' },
    });
    return overdueGroups(
      rows.map((row) => ({ date: fromDate(row.drawDate), prizes: row.prizes })),
      today,
    );
  }
}
