import { Inject, Injectable } from '@nestjs/common';
import type { AdminOperationSummary, OperationGameTotals } from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { OperationSummaryQuery } from './admin.schemas.js';

const DAY_MS = 86_400_000;

interface SummaryRow {
  signups: bigint;
  wagered: bigint | null;
  prizes: bigint | null;
  commission: bigint | null;
  credited: bigint | null;
  bonus_credited: bigint | null;
  wallets: bigint | null;
}

const cents = (value: bigint | null) => Number(value ?? 0n);
const game = (turnoverCents: number, payoutCents: number): OperationGameTotals => ({
  turnoverCents,
  payoutCents,
  netCents: turnoverCents - payoutCents,
});

/**
 * Resumo da operação da banca do operador no período. Só leitura, numa consulta: toda subconsulta filtra pela banca,
 * além do RLS da transação; o SQL é sempre parametrizado. Com promotor, vale para os jogadores indicados por ele (a
 * comissão é a que ele recebeu).
 *
 * Origem de cada número:
 * - cadastros: usuários criados no período;
 * - jogado: pules de Loterias e Fazendinha vendidos no período (data da venda);
 * - prêmios: pules premiadas apuradas no período (pule_prizes; vazio até a apuração existir);
 * - comissão: pagamentos de comissão creditados no período (lançamentos COMMISSION);
 * - creditado / bônus creditado: créditos pelo painel e ajustes manuais do período (só a parte positiva);
 * - saldo total: soma das carteiras agora.
 * Depósitos, saques, primeiro depósito e cassino ainda não existem no sistema: vêm zerados e listados em `unavailable`.
 */
@Injectable()
export class OperationSummaryService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  summary(tenant: ResolvedTenant, query: OperationSummaryQuery): Promise<AdminOperationSummary> {
    return this.db.withTenant(tenant.id, async (tx) => {
      let promoter: AdminOperationSummary['promoter'] = null;
      if (query.promoterId) {
        const row = await tx.user.findFirst({
          where: { tenantId: tenant.id, id: query.promoterId, promoterCommissionBps: { not: null } },
          select: { id: true, displayId: true, name: true },
        });
        if (!row) throw new AppError(404, 'NOT_FOUND', 'Promotor não encontrado.');
        promoter = row;
      }

      // Dias de Brasília (sempre -03:00, sem horário de verão), fim exclusivo.
      const start = new Date(`${query.from}T00:00:00-03:00`);
      const end = new Date(new Date(`${query.to}T00:00:00-03:00`).getTime() + DAY_MS);
      const inPeriod = (column: Prisma.Sql) => Prisma.sql`${column} >= ${start} AND ${column} < ${end}`;
      // Jogadores do filtro: todos ou os indicados do promotor.
      const player = (column: Prisma.Sql) =>
        promoter
          ? Prisma.sql`AND ${column} IN (
              SELECT u."id" FROM "users" u
              WHERE u."tenant_id" = ${tenant.id}::uuid AND u."referred_by_user_id" = ${promoter.id}::uuid)`
          : Prisma.empty;
      const tenantId = Prisma.sql`${tenant.id}::uuid`;

      const [row] = await tx.$queryRaw<SummaryRow[]>`
        SELECT
          (SELECT count(*) FROM "users" u
            WHERE u."tenant_id" = ${tenantId} AND ${inPeriod(Prisma.sql`u."created_at"`)}
            ${promoter ? Prisma.sql`AND u."referred_by_user_id" = ${promoter.id}::uuid` : Prisma.empty}
          ) AS signups,
          (SELECT sum(x."total_cents") FROM (
             SELECT t."total_cents" FROM "lottery_tickets" t
             WHERE t."tenant_id" = ${tenantId} AND ${inPeriod(Prisma.sql`t."created_at"`)} ${player(Prisma.sql`t."user_id"`)}
             UNION ALL
             SELECT b."total_cents" FROM "fazendinha_bets" b
             WHERE b."tenant_id" = ${tenantId} AND ${inPeriod(Prisma.sql`b."created_at"`)} ${player(Prisma.sql`b."user_id"`)}
           ) x) AS wagered,
          (SELECT sum(p."prize_cents") FROM "pule_prizes" p
            WHERE p."tenant_id" = ${tenantId} AND ${inPeriod(Prisma.sql`p."settled_at"`)} ${player(Prisma.sql`p."user_id"`)}
          ) AS prizes,
          (SELECT sum(e."balance_jb_delta" + e."prizes_jb_delta" + e."bonus_jb_delta" + e."balance_games_delta")
            FROM "wallet_entries" e
            WHERE e."tenant_id" = ${tenantId} AND e."kind" = 'COMMISSION' AND ${inPeriod(Prisma.sql`e."created_at"`)}
            ${promoter ? Prisma.sql`AND e."user_id" = ${promoter.id}::uuid` : Prisma.empty}
          ) AS commission,
          (SELECT sum(greatest(e."balance_jb_delta", 0) + greatest(e."prizes_jb_delta", 0)
                      + greatest(e."balance_games_delta", 0))
            FROM "wallet_entries" e
            WHERE e."tenant_id" = ${tenantId} AND e."kind" IN ('OPERATOR_CREDIT', 'MANUAL_ADJUSTMENT')
              AND ${inPeriod(Prisma.sql`e."created_at"`)} ${player(Prisma.sql`e."user_id"`)}
          ) AS credited,
          (SELECT sum(greatest(e."bonus_jb_delta", 0)) FROM "wallet_entries" e
            WHERE e."tenant_id" = ${tenantId} AND e."kind" IN ('OPERATOR_CREDIT', 'MANUAL_ADJUSTMENT')
              AND ${inPeriod(Prisma.sql`e."created_at"`)} ${player(Prisma.sql`e."user_id"`)}
          ) AS bonus_credited,
          (SELECT sum(w."balance_jb" + w."bonus_jb" + w."prizes_jb" + w."balance_games" + w."bonus_games"
                      + w."prizes_games")
            FROM "wallets" w
            WHERE w."tenant_id" = ${tenantId} ${player(Prisma.sql`w."user_id"`)}
          ) AS wallets`;

      const wageredCents = cents(row?.wagered ?? null);
      const prizesCents = cents(row?.prizes ?? null);
      const commissionCents = cents(row?.commission ?? null);
      return {
        from: query.from,
        to: query.to,
        promoter,
        newUsers: {
          signups: Number(row?.signups ?? 0n),
          firstDeposits: 0,
          firstDepositRateBps: 0,
          firstDepositAverageCents: 0,
        },
        cashflow: { depositsCents: 0, withdrawalsCents: 0, netCents: 0 },
        balances: {
          // Sem regra de saque nesta fase (PublicWallet.withdrawable é sempre 0).
          withdrawableCents: 0,
          totalCents: cents(row?.wallets ?? null),
          creditedCents: cents(row?.credited ?? null),
          bonusCreditedCents: cents(row?.bonus_credited ?? null),
        },
        result: {
          wageredCents,
          prizesCents,
          grossCents: wageredCents - prizesCents,
          commissionCents,
          netCents: wageredCents - prizesCents - commissionCents,
        },
        lotteries: game(wageredCents, prizesCents),
        casino: game(0, 0),
        unavailable: ['deposits', 'withdrawals', 'casino'],
      };
    });
  }
}
