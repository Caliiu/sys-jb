import { Inject, Injectable } from '@nestjs/common';
import type { AdminPlayerStatement, AdminStatementEntry, StatementKind } from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { PlayerStatementQuery } from './admin.schemas.js';

const DAY_MS = 86_400_000;

/** Carteira de apostas de um lançamento: saldo + bônus + prêmios (o que o banco concilia com a carteira). */
const JB = Prisma.raw('(e."balance_jb_delta" + e."bonus_jb_delta" + e."prizes_jb_delta")');

interface EntryRow {
  id: string;
  created_at: Date;
  kind: StatementKind;
  note: string | null;
  operator_name: string | null;
  pule_number: number | null;
  balance_jb_delta: bigint;
  bonus_jb_delta: bigint;
  prizes_jb_delta: bigint;
  balance_games_delta: bigint;
  total: bigint;
  balance_after: bigint;
}

const toEntry = (row: EntryRow): AdminStatementEntry => ({
  id: row.id,
  createdAt: row.created_at.toISOString(),
  kind: row.kind,
  puleNumber: row.pule_number,
  note: row.note,
  operatorName: row.operator_name,
  balanceCents: Number(row.balance_jb_delta),
  bonusCents: Number(row.bonus_jb_delta),
  prizesCents: Number(row.prizes_jb_delta),
  gamesCents: Number(row.balance_games_delta),
  totalCents: Number(row.total),
  balanceAfterCents: Number(row.balance_after),
});

/**
 * Extrato do apostador: os lançamentos da carteira no período, mais recentes primeiro, com a carteira de apostas
 * (saldo + bônus + prêmios) depois de cada um. O banco mantém essa carteira igual à soma dos lançamentos, então o saldo
 * de cada linha = o que havia antes do período + os lançamentos até ela (na ordem de criação). Só leitura; toda consulta
 * filtra pela banca, além do RLS da transação, e o SQL é sempre parametrizado.
 */
@Injectable()
export class PlayerStatementService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  statement(tenant: ResolvedTenant, userId: string, query: PlayerStatementQuery): Promise<AdminPlayerStatement> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const player = await tx.user.findFirst({
        where: { tenantId: tenant.id, id: userId },
        select: { id: true, displayId: true, name: true },
      });
      if (!player) throw new AppError(404, 'NOT_FOUND', 'Apostador não encontrado.');

      // Dias de Brasília (sempre -03:00, sem horário de verão), fim exclusivo.
      const start = new Date(`${query.from}T00:00:00-03:00`);
      const end = new Date(new Date(`${query.to}T00:00:00-03:00`).getTime() + DAY_MS);
      const mine = Prisma.sql`e."tenant_id" = ${tenant.id}::uuid AND e."user_id" = ${userId}::uuid`;
      const inPeriod = Prisma.sql`e."created_at" >= ${start} AND e."created_at" < ${end}`;

      const [stats] = await tx.$queryRaw<
        Array<{
          opening: bigint | null;
          total: bigint;
          net: bigint | null;
          credits: bigint | null;
          debits: bigint | null;
        }>
      >`
        SELECT
          (SELECT sum(${JB}) FROM "wallet_entries" e WHERE ${mine} AND e."created_at" < ${start}) AS opening,
          count(*) AS total,
          sum(${JB}) AS net,
          sum(greatest(${JB}, 0)) AS credits,
          sum(least(${JB}, 0)) AS debits
        FROM "wallet_entries" e
        WHERE ${mine} AND ${inPeriod}`;

      const openingCents = Number(stats?.opening ?? 0n);
      const total = Number(stats?.total ?? 0n);
      const base = {
        from: query.from,
        to: query.to,
        player,
        openingCents,
        closingCents: openingCents + Number(stats?.net ?? 0n),
        creditsCents: Number(stats?.credits ?? 0n),
        debitsCents: Number(stats?.debits ?? 0n),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      };
      if (total === 0) return { ...base, items: [] };

      // O saldo acumulado é calculado sobre o período inteiro antes da paginação.
      const rows = await tx.$queryRaw<EntryRow[]>`
        WITH p AS (
          SELECT e."id", e."created_at", e."kind", e."note", e."operator_id", e."lottery_ticket_id",
                 e."fazendinha_bet_id", e."bet_commission_id", e."balance_jb_delta", e."bonus_jb_delta", e."prizes_jb_delta",
                 e."balance_games_delta", ${JB} AS total,
                 ${openingCents}::bigint + sum(${JB}) OVER (ORDER BY e."created_at", e."id") AS balance_after
          FROM "wallet_entries" e
          WHERE ${mine} AND ${inPeriod}
        )
        SELECT p."id", p."created_at", p."kind", p."note", o."name" AS operator_name,
               COALESCE(t."pule_number", b."pule_number", ct."pule_number", cb."pule_number") AS pule_number,
               p."balance_jb_delta", p."bonus_jb_delta", p."prizes_jb_delta", p."balance_games_delta",
               p.total, p.balance_after
        FROM p
        LEFT JOIN "lottery_tickets" t ON t."tenant_id" = ${tenant.id}::uuid AND t."id" = p."lottery_ticket_id"
        LEFT JOIN "fazendinha_bets" b ON b."tenant_id" = ${tenant.id}::uuid AND b."id" = p."fazendinha_bet_id"
        -- Comissão da aposta (e o estorno dela): o pule do indicado que gerou a comissão.
        LEFT JOIN "bet_commissions" c ON c."tenant_id" = ${tenant.id}::uuid AND c."id" = p."bet_commission_id"
        LEFT JOIN "lottery_tickets" ct ON ct."tenant_id" = ${tenant.id}::uuid AND ct."id" = c."lottery_ticket_id"
        LEFT JOIN "fazendinha_bets" cb ON cb."tenant_id" = ${tenant.id}::uuid AND cb."id" = c."fazendinha_bet_id"
        LEFT JOIN "operators" o ON o."tenant_id" = ${tenant.id}::uuid AND o."id" = p."operator_id"
        ORDER BY p."created_at" DESC, p."id" DESC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;

      return { ...base, items: rows.map(toEntry) };
    });
  }
}
