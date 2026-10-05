import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import {
  type FazendinhaModeId,
  type LotterySettlementItem,
  type TicketSettlement,
  SettlementRuleError,
  drawDateOf,
  prizesViewPath,
  resultFullPrizes,
  settleFazendinhaBet,
  settleLotteryTicket,
} from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { hasSqlState } from '../common/prisma-errors.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService } from '../database/database.service.js';
import { PushService } from '../push/push.service.js';

/** Dias para trás (além de hoje) que a rodada completa confere. Pule mais antigo sem apuração fica de fora. */
export const SETTLEMENT_DAYS_BACK = 31;
/** A rodada de cada minuto só olha resultados recebidos ou corrigidos nestas últimas horas (a completa olha todos). */
const RECENT_HOURS = 6;
/** Uma rodada completa a cada tantas rodadas (com a rodada a cada minuto: uma por hora), e sempre a primeira. */
const FULL_SWEEP_EVERY = 60;
/** Pules lidos por vez. */
const BATCH = 200;

/** Resultado que vale para um pule (o do sorteio ligado a ele), como lido do banco. */
interface ResultColumns {
  result_id: string;
  revision: number;
  result_lottery: string;
  extraction: number;
  prizes: string[];
  sum_value: string | null;
  multiplication: string | null;
}

/** Pule ainda não apurado, com o resultado do sorteio dele. */
interface Candidate extends ResultColumns {
  id: string;
  user_id: string;
  pule_number: number;
  draw_date: string;
  lottery: string;
}

/** Pule já apurado cujo resultado ganhou uma revisão nova. */
interface CorrectionRow extends ResultColumns {
  id: string;
  game: 'lotteries' | 'fazendinha';
  pule_number: number;
  lottery_ticket_id: string | null;
  fazendinha_bet_id: string | null;
  prize_cents: bigint;
}

interface Winner {
  userId: string;
  puleNumber: number;
  drawDate: string;
  lottery: string;
  prizeCents: number;
}

export interface SweepSummary {
  /** Pules apurados nesta rodada (premiados ou não). */
  settled: number;
  /** Desses, quantos premiados e a soma dos prêmios pagos. */
  awarded: number;
  prizeCents: number;
  /** Pules já apurados conferidos com um resultado corrigido, e quantos dariam outro prêmio (aviso no painel). */
  checked: number;
  reviews: number;
  /** Pules com resultado que ainda não dá para apurar (falta uma posição, regra, revisão nova chegando). */
  waiting: number;
  /** Falhas inesperadas (tentadas de novo na próxima rodada). */
  failed: number;
}

interface Window {
  from: string;
  to: string;
  /** Só resultados sem correção desde antes disto (a carência). */
  cutoff: Date;
  /** Rodada rápida: só resultados recebidos ou corrigidos depois disto; null = todos os da janela. */
  recentSince: Date | null;
}

/** Filtro da rodada rápida sobre o resultado (alias r). */
const recentOnly = (w: Window) => (w.recentSince ? Prisma.sql`AND r."updated_at" > ${w.recentSince}` : Prisma.empty);

interface ItemRow {
  ticketId: string;
  position: number;
  modality: string;
  placement: string;
  guesses: string[];
  amountCents: bigint;
  split: string;
  quoteCents: number;
  centenaQuoteCents: number | null;
}

interface BetRow {
  id: string;
  mode: 'GRUPO' | 'DEZENA' | 'CENTENA';
  prizeCents: number;
  numbers: Array<{ number: number }>;
}

const fullPrizes = (r: ResultColumns) =>
  resultFullPrizes({
    lottery: r.result_lottery,
    extraction: r.extraction,
    prizes: r.prizes,
    sum: r.sum_value,
    multiplication: r.multiplication,
  });

const toSettlementItem = (item: ItemRow): LotterySettlementItem => ({
  position: item.position,
  modality: item.modality,
  placement: item.placement,
  guesses: item.guesses,
  amountCents: Number(item.amountCents),
  split: item.split === 'each' ? 'each' : 'total',
  quoteCents: item.quoteCents,
  centenaQuoteCents: item.centenaQuoteCents,
});

const groupBy = <T, K>(rows: readonly T[], key: (row: T) => K) => {
  const groups = new Map<K, T[]>();
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  return groups;
};

const lotteryOutcome = (items: readonly ItemRow[] | undefined, result: ResultColumns): TicketSettlement =>
  settleLotteryTicket((items ?? []).map(toSettlementItem), fullPrizes(result));

const fazendinhaOutcome = (bet: BetRow | undefined, result: ResultColumns): TicketSettlement => {
  if (!bet) throw new SettlementRuleError('pule da Fazendinha não encontrado');
  return settleFazendinhaBet(
    {
      mode: bet.mode.toLowerCase() as FazendinhaModeId,
      numbers: bet.numbers.map((n) => n.number),
      prizeCents: bet.prizeCents,
    },
    fullPrizes(result),
  );
};

/** Itens premiados para a função de apuração (null = sem prêmio). */
const itemsJson = (outcome: Extract<TicketSettlement, { status: 'settled' }>) =>
  outcome.prizeCents > 0 ? JSON.stringify(outcome.items) : null;

/** SQLSTATE/código do erro, para o log (a mensagem do banco não vai para o log). */
const errorCode = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta as { code?: unknown } | undefined;
    return typeof meta?.code === 'string' ? `${error.code}/${meta.code}` : error.code;
  }
  return error instanceof Error ? error.name : 'desconhecido';
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** "2026-10-01" -> "01/10". */
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * Apuração de prêmios: a cada rodada, em cada banca, confere os pules (Loterias e Fazendinha) dos sorteios cujo
 * resultado já passou da carência (sem correção há PRIZES_GRACE_MINUTES) e paga os premiados na bolsa de prêmios. Cada
 * pule é apurado numa transação própria, pelas funções do banco (lottery_settle / fazendinha_settle), que conferem tudo
 * de novo e gravam uma vez só: rodadas simultâneas (várias instâncias da API) não pagam duas vezes.
 *
 * Correção do resultado depois da apuração não muda o que foi pago: o pule é conferido com a revisão nova
 * (pule_settlement_check) e, se o prêmio seria outro, vira aviso no painel (Operação > Prêmios).
 *
 * Pule que o resultado ainda não deixa apurar (falta o 6º prêmio, por exemplo) fica pendente e só é conferido de novo
 * quando o resultado mudar. Pule de sorteio sem resultado ligado nunca entra (aparece como pendente no painel).
 *
 * Custo: a rodada de cada minuto só olha os resultados recebidos ou corrigidos nas últimas RECENT_HOURS horas; uma vez
 * por hora (e ao subir a API) a rodada é completa, nos últimos SETTLEMENT_DAYS_BACK dias, e pega o que ficou para trás
 * (API fora do ar, sorteio ligado a um resultado depois).
 */
@Injectable()
export class PrizeSettlementService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Prizes');
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private current: Promise<SweepSummary> | null = null;
  /**
   * Pule (ou conferência de correção, "check:<id>") -> revisão do resultado que não deixou apurar: só tenta de novo
   * com outra revisão, e o motivo vai para o log uma vez só.
   */
  private readonly blocked = new Map<string, string>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PushService) private readonly push: PushService,
  ) {}

  onApplicationBootstrap(): void {
    const { graceMinutes, sweepIntervalMs } = this.config.prizes;
    if (sweepIntervalMs === null) return;
    this.logger.log(`apuração a cada ${sweepIntervalMs / 1000}s, com carência de ${graceMinutes} min após o resultado`);
    const tick = () => {
      const full = this.ticks % FULL_SWEEP_EVERY === 0;
      this.ticks += 1;
      this.sweep(new Date(), { full }).catch((error: unknown) =>
        this.logger.error(`rodada de apuração falhou (${errorCode(error)})`),
      );
    };
    this.timer = setInterval(tick, sweepIntervalMs);
    this.timer.unref?.();
    tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Uma rodada (completa por padrão; `full: false` = só os resultados recentes). Uma por vez nesta instância: quem pede
   * durante uma rodada recebe a mesma.
   */
  sweep(now: Date = new Date(), options: { full?: boolean } = {}): Promise<SweepSummary> {
    this.current ??= this.run(now, options.full ?? true).finally(() => {
      this.current = null;
    });
    return this.current;
  }

  private async run(now: Date, full: boolean): Promise<SweepSummary> {
    const summary: SweepSummary = {
      settled: 0,
      awarded: 0,
      prizeCents: 0,
      checked: 0,
      reviews: 0,
      waiting: 0,
      failed: 0,
    };
    const nowIso = now.toISOString();
    const window: Window = {
      from: drawDateOf(nowIso, -SETTLEMENT_DAYS_BACK),
      to: drawDateOf(nowIso, 0),
      cutoff: new Date(now.getTime() - this.config.prizes.graceMinutes * 60_000),
      recentSince: full ? null : new Date(now.getTime() - RECENT_HOURS * 60 * 60_000),
    };
    // Todas as bancas, ativas ou não: prêmio devido continua devido.
    const tenants = await this.db.client.tenant.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
    const winners = new Map<string, Winner[]>();
    for (const { id: tenantId } of tenants) {
      const won: Winner[] = [];
      await this.settleLotteries(tenantId, window, summary, won);
      await this.settleFazendinha(tenantId, window, summary, won);
      await this.checkCorrections(tenantId, window, summary);
      if (won.length > 0) winners.set(tenantId, won);
    }
    // Avisos depois de apurar tudo: um serviço de push lento não atrasa a apuração das outras bancas.
    for (const [tenantId, won] of winners) await this.notify(tenantId, won);

    if (summary.settled > 0 || summary.checked > 0 || summary.failed > 0) {
      this.logger.log(
        `apuração: ${summary.settled} pule(s) apurado(s), ${summary.awarded} premiado(s) (${brl.format(summary.prizeCents / 100)})` +
          (summary.checked > 0 ? `; ${summary.checked} conferido(s) com resultado corrigido` : '') +
          (summary.failed > 0 ? `; ${summary.failed} falha(s)` : ''),
      );
    }
    return summary;
  }

  private async settleLotteries(tenantId: string, w: Window, summary: SweepSummary, won: Winner[]): Promise<void> {
    let cursor = { date: w.from, pule: 0 };
    for (;;) {
      const page = await this.db.withTenant(tenantId, async (tx) => {
        const candidates = await tx.$queryRaw<Candidate[]>`
          SELECT t."id", t."user_id", t."pule_number", t."draw_date"::text AS draw_date, t."lottery",
                 r."id" AS result_id, r."revision", r."lottery" AS result_lottery, r."extraction", r."prizes",
                 r."sum_value", r."multiplication"
          FROM "lottery_tickets" t
          JOIN "draws" d
            ON d."tenant_id" = t."tenant_id" AND d."name" = t."lottery" AND d."draw_minutes" / 60 = t."draw_hour"
          JOIN "lottery_results" r
            ON r."draw_date" = t."draw_date" AND r."lottery" = d."result_lottery"
           AND r."extraction" = d."result_extraction"
          WHERE t."tenant_id" = ${tenantId}::uuid AND t."canceled_at" IS NULL
            AND t."draw_date" BETWEEN ${w.from}::date AND ${w.to}::date
            AND (t."draw_date", t."pule_number") > (${cursor.date}::date, ${cursor.pule}::integer)
            AND r."updated_at" <= ${w.cutoff} ${recentOnly(w)}
            AND NOT EXISTS (
              SELECT 1 FROM "pule_settlements" s WHERE s."tenant_id" = t."tenant_id" AND s."lottery_ticket_id" = t."id")
          ORDER BY t."draw_date", t."pule_number"
          LIMIT ${BATCH}`;
        const items =
          candidates.length === 0
            ? []
            : await tx.lotteryTicketItem.findMany({
                where: { tenantId, ticketId: { in: candidates.map((c) => c.id) } },
                orderBy: { position: 'asc' },
              });
        return { candidates, items: groupBy(items, (item) => item.ticketId) };
      });

      for (const candidate of page.candidates) {
        await this.settleOne(
          tenantId,
          'lotteries',
          candidate,
          () => lotteryOutcome(page.items.get(candidate.id), candidate),
          summary,
          won,
        );
      }
      if (page.candidates.length < BATCH) return;
      const last = page.candidates.at(-1)!;
      cursor = { date: last.draw_date, pule: last.pule_number };
    }
  }

  private async settleFazendinha(tenantId: string, w: Window, summary: SweepSummary, won: Winner[]): Promise<void> {
    let cursor = { date: w.from, pule: 0 };
    for (;;) {
      const page = await this.db.withTenant(tenantId, async (tx) => {
        const candidates = await tx.$queryRaw<Candidate[]>`
          SELECT b."id", b."user_id", b."pule_number", b."draw_date"::text AS draw_date, b."lottery",
                 r."id" AS result_id, r."revision", r."lottery" AS result_lottery, r."extraction", r."prizes",
                 r."sum_value", r."multiplication"
          FROM "fazendinha_bets" b
          JOIN "draws" d
            ON d."tenant_id" = b."tenant_id" AND d."name" = b."lottery" AND d."draw_minutes" / 60 = b."draw_hour"
          JOIN "lottery_results" r
            ON r."draw_date" = b."draw_date" AND r."lottery" = d."result_lottery"
           AND r."extraction" = d."result_extraction"
          WHERE b."tenant_id" = ${tenantId}::uuid
            AND b."draw_date" BETWEEN ${w.from}::date AND ${w.to}::date
            AND (b."draw_date", b."pule_number") > (${cursor.date}::date, ${cursor.pule}::integer)
            AND r."updated_at" <= ${w.cutoff} ${recentOnly(w)}
            AND NOT EXISTS (
              SELECT 1 FROM "pule_settlements" s WHERE s."tenant_id" = b."tenant_id" AND s."fazendinha_bet_id" = b."id")
          ORDER BY b."draw_date", b."pule_number"
          LIMIT ${BATCH}`;
        const bets =
          candidates.length === 0
            ? []
            : await tx.fazendinhaBet.findMany({
                where: { tenantId, id: { in: candidates.map((c) => c.id) } },
                select: { id: true, mode: true, prizeCents: true, numbers: { select: { number: true } } },
              });
        return { candidates, bets: new Map(bets.map((bet) => [bet.id, bet as BetRow])) };
      });

      for (const candidate of page.candidates) {
        await this.settleOne(
          tenantId,
          'fazendinha',
          candidate,
          () => fazendinhaOutcome(page.bets.get(candidate.id), candidate),
          summary,
          won,
        );
      }
      if (page.candidates.length < BATCH) return;
      const last = page.candidates.at(-1)!;
      cursor = { date: last.draw_date, pule: last.pule_number };
    }
  }

  /** Apura um pule numa transação própria; falha de um pule não impede os outros. */
  private async settleOne(
    tenantId: string,
    game: 'lotteries' | 'fazendinha',
    candidate: Candidate,
    compute: () => TicketSettlement,
    summary: SweepSummary,
    won: Winner[],
  ): Promise<void> {
    const revisionKey = `${candidate.result_id}:${candidate.revision}`;
    if (this.blocked.get(candidate.id) === revisionKey) {
      summary.waiting += 1;
      return;
    }

    let outcome: TicketSettlement;
    try {
      outcome = compute();
    } catch (error) {
      if (!(error instanceof SettlementRuleError)) throw error;
      this.block(candidate, revisionKey, `pule ${candidate.pule_number} sem regra de apuração: ${error.message}`);
      summary.waiting += 1;
      return;
    }
    if (outcome.status === 'incomplete') {
      // Ex.: aposta no 6º prêmio e o resultado ainda sem a soma. Confere de novo quando o resultado mudar.
      this.blocked.set(candidate.id, revisionKey);
      summary.waiting += 1;
      return;
    }

    const settled = outcome;
    try {
      const rows = await this.db.withTenant(tenantId, (tx) =>
        game === 'lotteries'
          ? tx.$queryRaw<Array<{ settled: boolean }>>`
              SELECT "lottery_settle"(${candidate.id}::uuid, ${candidate.result_id}::uuid, ${candidate.revision}::integer,
                                      ${settled.prizeCents}::bigint, ${itemsJson(settled)}::jsonb) AS settled`
          : tx.$queryRaw<Array<{ settled: boolean }>>`
              SELECT "fazendinha_settle"(${candidate.id}::uuid, ${candidate.result_id}::uuid,
                                         ${candidate.revision}::integer, ${settled.prizeCents}::bigint) AS settled`,
      );
      this.blocked.delete(candidate.id);
      // false = outra rodada (outra instância) apurou antes.
      if (rows[0]?.settled !== true) return;
      summary.settled += 1;
      if (settled.prizeCents > 0) {
        summary.awarded += 1;
        summary.prizeCents += settled.prizeCents;
        won.push({
          userId: candidate.user_id,
          puleNumber: candidate.pule_number,
          drawDate: candidate.draw_date,
          lottery: candidate.lottery,
          prizeCents: settled.prizeCents,
        });
      }
    } catch (error) {
      // O resultado mudou entre a leitura e a gravação: a próxima rodada confere com a revisão nova.
      if (hasSqlState(error, 'SJ007')) {
        summary.waiting += 1;
        return;
      }
      // Pule que este resultado não pode apurar (ex.: vendido depois de o resultado chegar): fica para o operador.
      if (hasSqlState(error, 'SJ008')) {
        this.block(candidate, revisionKey, `pule ${candidate.pule_number} não pode ser apurado com este resultado`);
        summary.waiting += 1;
        return;
      }
      summary.failed += 1;
      // O banco recusou o prêmio calculado (fora dos limites do pule): não muda até o resultado mudar; loga uma vez.
      if (hasSqlState(error, '23514')) {
        this.block(candidate, revisionKey, `apuração do pule ${candidate.pule_number} recusada pelo banco`, 'error');
        return;
      }
      this.logger.error(`apuração do pule ${candidate.pule_number} falhou (${errorCode(error)})`);
    }
  }

  /**
   * Resultado corrigido depois da apuração: confere de novo, com a revisão nova (depois da carência dela), os pules já
   * apurados. O pago não muda; a diferença fica registrada e aparece como aviso no painel.
   */
  private async checkCorrections(tenantId: string, w: Window, summary: SweepSummary): Promise<void> {
    let after = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const page = await this.db.withTenant(tenantId, async (tx) => {
        const rows = await tx.$queryRaw<CorrectionRow[]>`
          SELECT s."id", s."game", s."pule_number", s."lottery_ticket_id", s."fazendinha_bet_id", s."prize_cents",
                 r."id" AS result_id, r."revision", r."lottery" AS result_lottery, r."extraction", r."prizes",
                 r."sum_value", r."multiplication"
          FROM "pule_settlements" s
          JOIN "lottery_results" r ON r."id" = s."result_id"
          WHERE s."tenant_id" = ${tenantId}::uuid AND s."draw_date" >= ${w.from}::date
            AND r."revision" > s."checked_revision" AND r."updated_at" <= ${w.cutoff} ${recentOnly(w)}
            AND s."id" > ${after}::uuid
          ORDER BY s."id"
          LIMIT ${BATCH}`;
        const ticketIds = rows.flatMap((row) => row.lottery_ticket_id ?? []);
        const betIds = rows.flatMap((row) => row.fazendinha_bet_id ?? []);
        const [items, bets] = await Promise.all([
          ticketIds.length === 0
            ? []
            : tx.lotteryTicketItem.findMany({
                where: { tenantId, ticketId: { in: ticketIds } },
                orderBy: { position: 'asc' },
              }),
          betIds.length === 0
            ? []
            : tx.fazendinhaBet.findMany({
                where: { tenantId, id: { in: betIds } },
                select: { id: true, mode: true, prizeCents: true, numbers: { select: { number: true } } },
              }),
        ]);
        return {
          rows,
          items: groupBy(items, (item) => item.ticketId),
          bets: new Map(bets.map((bet) => [bet.id, bet as BetRow])),
        };
      });

      for (const row of page.rows) {
        const blockKey = `check:${row.id}`;
        const revisionKey = `${row.result_id}:${row.revision}`;
        if (this.blocked.get(blockKey) === revisionKey) continue;
        let outcome: TicketSettlement;
        try {
          outcome =
            row.game === 'lotteries'
              ? lotteryOutcome(page.items.get(row.lottery_ticket_id!), row)
              : fazendinhaOutcome(page.bets.get(row.fazendinha_bet_id!), row);
        } catch (error) {
          if (!(error instanceof SettlementRuleError)) throw error;
          this.blocked.set(blockKey, revisionKey);
          continue;
        }
        if (outcome.status === 'incomplete') {
          this.blocked.set(blockKey, revisionKey);
          continue;
        }
        const checked = outcome;
        try {
          const rows = await this.db.withTenant(
            tenantId,
            (tx) =>
              tx.$queryRaw<Array<{ checked: boolean }>>`
              SELECT "pule_settlement_check"(${row.id}::uuid, ${row.revision}::integer, ${checked.prizeCents}::bigint,
                                             ${itemsJson(checked)}::jsonb) AS checked`,
          );
          if (rows[0]?.checked !== true) continue;
          summary.checked += 1;
          if (checked.prizeCents !== Number(row.prize_cents)) {
            summary.reviews += 1;
            this.logger.warn(
              `pule ${row.pule_number}: resultado corrigido depois da apuração; pago ${brl.format(Number(row.prize_cents) / 100)}, ` +
                `pelo resultado corrigido ${brl.format(checked.prizeCents / 100)} (ver Operação > Prêmios)`,
            );
          }
        } catch (error) {
          if (hasSqlState(error, 'SJ007')) continue;
          summary.failed += 1;
          const message = `conferência do pule ${row.pule_number} com o resultado corrigido falhou (${errorCode(error)})`;
          // Recusa do banco não muda até o resultado mudar: loga uma vez.
          if (hasSqlState(error, '23514')) {
            if (this.blocked.get(blockKey) !== revisionKey) this.logger.error(message);
            this.blocked.set(blockKey, revisionKey);
          } else {
            this.logger.error(message);
          }
        }
      }
      if (page.rows.length < BATCH) return;
      after = page.rows.at(-1)!.id;
    }
  }

  /** Deixa o pule de lado até o resultado mudar; o motivo vai para o log uma vez por revisão. */
  private block(candidate: Candidate, revisionKey: string, message: string, level: 'warn' | 'error' = 'warn'): void {
    if (this.blocked.get(candidate.id) !== revisionKey) this.logger[level](message);
    this.blocked.set(candidate.id, revisionKey);
  }

  /** "Pule premiada": um aviso por jogador e dia do jogo, que abre as premiadas do dia. Melhor esforço. */
  private async notify(tenantId: string, won: readonly Winner[]): Promise<void> {
    if (!this.push.enabled) return;
    for (const list of groupBy(won, (w) => `${w.userId}|${w.drawDate}`).values()) {
      const first = list[0]!;
      const total = list.reduce((sum, w) => sum + w.prizeCents, 0);
      const body =
        list.length === 1
          ? `Pule #${first.puleNumber} (${first.lottery}) ganhou ${brl.format(total / 100)}.`
          : `${list.length} pules premiadas de ${dayMonth(first.drawDate)}: ${brl.format(total / 100)}.`;
      try {
        await this.push.sendToUsers(tenantId, [first.userId], {
          title: 'Pule premiada!',
          body,
          url: prizesViewPath(first.drawDate),
          tag: `prize:${first.drawDate}:${list.map((w) => w.puleNumber).join(',')}`,
        });
      } catch (error) {
        this.logger.warn(`aviso de pule premiada não enviado (${errorCode(error)})`);
      }
    }
  }
}
