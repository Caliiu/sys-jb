import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import {
  CASINO_LIMITS,
  type CasinoGameCard,
  type CasinoGamesPage,
  type CasinoLaunchResponse,
  type CasinoLobby,
  maskPlayerName,
} from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import type { UserSession } from '../auth/session.types.js';
import { AppError, Errors } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { filterByWallets, normalizeCatalog, normalizeProviders, storeCatalog } from './casino-catalog.js';
import { walletKey } from './casino.config.js';
import { casinoUserCode } from './casino-user-code.js';
import type { CasinoGamesQuery } from './casino.schemas.js';
import { PlayFiversError, fetchCasinoGames, fetchCasinoProviders, launchCasinoGame } from './playfivers-client.js';

const unavailable = () => new AppError(503, 'SERVICE_UNAVAILABLE', 'Cassino indisponível no momento.');
const gameNotFound = () => new AppError(404, 'NOT_FOUND', 'Jogo não encontrado.');

interface GameRow {
  id: number;
  name: string;
  provider: string;
  image_url: string | null;
}

const toCard = (row: GameRow): CasinoGameCard => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  imageUrl: row.image_url,
});

/** `%`, `_` e `\` digitados viram literais no ILIKE. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Cassino do jogador (PlayFivers): lobby (jogos por provedor e "Top ganhos" da banca), lista paginada com busca e o
 * lançamento do jogo. O catálogo é sincronizado aqui, de tempos em tempos, a partir do provedor (o jogador nunca chama
 * o provedor). O saldo do cassino é o Disponível Games; as rodadas chegam pelo webhook (CasinoWebhookService).
 */
@Injectable()
export class CasinoService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Casino');
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing: Promise<void> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  onApplicationBootstrap(): void {
    const casino = this.config.casino;
    if (!casino) {
      this.logger.log('cassino desligado (sem PLAYFIVERS_AGENT_TOKEN/PLAYFIVERS_SECRET_KEY)');
      return;
    }
    if (!casino.webhookTokenDigest) this.logger.warn('CASINO_WEBHOOK_TOKEN não configurado: o webhook recusa tudo');
    if (casino.catalogSyncMs === null) return;
    const tick = () => void this.syncCatalog();
    this.timer = setInterval(tick, casino.catalogSyncMs);
    this.timer.unref?.();
    tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Busca o catálogo no provedor e grava (uma sincronização por vez nesta instância). Não lança: só loga. */
  syncCatalog(): Promise<void> {
    this.syncing ??= this.runSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async runSync(): Promise<void> {
    const casino = this.config.casino;
    if (!casino) return;
    try {
      let games = normalizeCatalog(await fetchCasinoGames(casino));
      if (games.length === 0) {
        this.logger.warn('catálogo do cassino veio vazio ou ilegível: nada mudou');
        return;
      }
      // Só os provedores das carteiras escolhidas (PLAYFIVERS_WALLETS): a aposta consome o crédito da carteira do
      // provedor no PlayFivers. Nenhum provedor nelas = nome errado na configuração: nada muda e o log lista as que
      // existem.
      if (casino.wallets) {
        const providers = normalizeProviders(await fetchCasinoProviders(casino));
        const filtered = filterByWallets(games, providers, casino.wallets, walletKey);
        if (filtered.games.length === 0) {
          this.logger.warn(
            `catálogo do cassino: nenhum jogo nas carteiras de PLAYFIVERS_WALLETS; nada mudou. Carteiras do provedor: ${
              filtered.wallets.join(' | ') || '(nenhuma)'
            }`,
          );
          return;
        }
        games = filtered.games;
      }
      const { active, deactivated } = await storeCatalog(this.db.client, games);
      this.logger.log(
        `catálogo do cassino: ${active} jogo(s) ativo(s)${deactivated ? `, ${deactivated} desativado(s)` : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `catálogo do cassino: ${error instanceof PlayFiversError ? error.message : 'falha inesperada'}`,
      );
    }
  }

  /** Lobby: os primeiros jogos de cada provedor (do que mais tem para o que menos tem) e os maiores prêmios recentes. */
  async lobby(tenant: ResolvedTenant): Promise<CasinoLobby> {
    if (!this.config.casino) return { available: false, sections: [], topWins: [] };
    const since = new Date(Date.now() - CASINO_LIMITS.topWinsHours * 60 * 60 * 1000);

    const [games, wins] = await Promise.all([
      this.db.client.$queryRaw<Array<GameRow & { total: bigint }>>`
        SELECT "id", "name", "provider", "image_url", "total" FROM (
          SELECT g."id", g."name", g."provider", g."image_url",
                 row_number() OVER (PARTITION BY g."provider" ORDER BY g."id") AS rn,
                 count(*) OVER (PARTITION BY g."provider") AS total
          FROM "casino_games" g WHERE g."active"
        ) x
        WHERE rn <= ${CASINO_LIMITS.sectionSize}
        ORDER BY total DESC, "provider", "id"`,
      this.db.withTenant(
        tenant.id,
        (tx) =>
          tx.$queryRaw<Array<GameRow & { win_cents: bigint; user_name: string; display_id: number }>>`
          SELECT g."id", g."name", g."provider", g."image_url", t."win_cents", u."name" AS user_name,
                 u."display_id"
          FROM "casino_transactions" t
          JOIN "users" u ON u."tenant_id" = t."tenant_id" AND u."id" = t."user_id"
          -- O código do provedor na rodada pode não ser o nome do catálogo: o mesmo provedor tem preferência.
          CROSS JOIN LATERAL (
            SELECT c."id", c."name", c."provider", c."image_url" FROM "casino_games" c
            WHERE c."game_code" = t."game_code" AND c."active"
            ORDER BY (lower(c."provider") = lower(t."provider")) DESC, c."id"
            LIMIT 1
          ) g
          WHERE t."tenant_id" = ${tenant.id}::uuid AND t."created_at" >= ${since} AND t."win_cents" > 0
          ORDER BY t."win_cents" DESC, t."created_at" DESC
          LIMIT ${CASINO_LIMITS.topWins}`,
      ),
    ]);

    const sections = new Map<string, CasinoLobby['sections'][number]>();
    for (const row of games) {
      const section = sections.get(row.provider) ?? { provider: row.provider, total: Number(row.total), games: [] };
      section.games.push(toCard(row));
      sections.set(row.provider, section);
    }
    return {
      available: true,
      sections: [...sections.values()],
      topWins: wins.map((row) => ({
        playerLabel: maskPlayerName(row.user_name, row.display_id),
        game: toCard(row),
        winCents: Number(row.win_cents),
      })),
    };
  }

  /** "Ver todos" de um provedor e a busca por jogo ou provedor, paginados. */
  async games(query: CasinoGamesQuery): Promise<CasinoGamesPage> {
    const { page } = query;
    const pageSize = CASINO_LIMITS.pageSize;
    const empty = { items: [], page, pageSize, total: 0, totalPages: 1 };
    if (!this.config.casino) return empty;

    const where = Prisma.sql`g."active"
      ${query.provider ? Prisma.sql`AND g."provider" = ${query.provider}` : Prisma.empty}
      ${
        query.search
          ? Prisma.sql`AND (g."name" ILIKE ${likePattern(query.search)} OR g."provider" ILIKE ${likePattern(query.search)})`
          : Prisma.empty
      }`;
    const [counted] = await this.db.client.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*) AS total FROM "casino_games" g WHERE ${where}`;
    const total = Number(counted?.total ?? 0n);
    if (total === 0) return empty;
    const rows = await this.db.client.$queryRaw<GameRow[]>`
      SELECT g."id", g."name", g."provider", g."image_url" FROM "casino_games" g
      WHERE ${where}
      ORDER BY ${query.search ? Prisma.sql`g."name", g."id"` : Prisma.sql`g."id"`}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    return { items: rows.map(toCard), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /**
   * Abre o jogo para o jogador da sessão: o provedor recebe o jogador ("10000 Carlos - Trevo da Sorte") e o saldo gastável, e
   * devolve o endereço do jogo. As apostas e prêmios voltam pelo webhook.
   */
  async launch(tenant: ResolvedTenant, session: UserSession, gameId: number): Promise<CasinoLaunchResponse> {
    const casino = this.config.casino;
    if (!casino) throw unavailable();
    const [game, player] = await Promise.all([
      this.db.client.casinoGame.findFirst({
        where: { id: gameId, active: true },
        select: { id: true, name: true, provider: true, imageUrl: true, gameCode: true, original: true },
      }),
      this.db.withTenant(tenant.id, (tx) =>
        tx.user.findFirst({
          where: { tenantId: tenant.id, id: session.userId },
          select: { displayId: true, name: true, wallet: { select: { balanceGames: true, prizesGames: true } } },
        }),
      ),
    ]);
    if (!game) throw gameNotFound();
    const wallet = player?.wallet;
    if (!player || !wallet) throw Errors.sessionInvalid();

    try {
      const launchUrl = await launchCasinoGame(casino, {
        userCode: casinoUserCode(player.displayId, player.name, tenant.name),
        gameCode: game.gameCode,
        provider: game.provider,
        original: game.original,
        // Gastável: o bônus de games não se movimenta (a rodada não poderia usá-lo).
        balanceCents: Number(wallet.balanceGames + wallet.prizesGames),
      });
      return {
        game: { id: game.id, name: game.name, provider: game.provider, imageUrl: game.imageUrl },
        launchUrl,
      };
    } catch (error) {
      this.logger.warn(
        `jogo ${game.provider}/${game.gameCode} não abriu: ${error instanceof PlayFiversError ? error.message : 'falha inesperada'}`,
      );
      throw unavailable();
    }
  }
}
