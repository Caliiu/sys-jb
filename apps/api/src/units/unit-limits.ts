import { AppError } from '../common/app-error.js';
import type { DatabaseService, TenantTx } from '../database/database.service.js';

/** Limite diário da unidade estourado (unit_daily_limit_check, nos débitos de Loterias e Fazendinha). */
export const DAILY_LIMIT_SQLSTATE = 'SJ022';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBrl = (cents: number) => brl.format(cents / 100);

/** Apostado hoje (Brasília) pelo jogador: Loterias sem cancelados + Fazendinha (mesma conta do limite no banco). */
export async function todaySpentCents(tx: TenantTx, userId: string): Promise<number> {
  const [row] = await tx.$queryRaw<Array<{ spent: bigint }>>`SELECT "unit_today_spent"(${userId}::uuid) AS spent`;
  return Number(row?.spent ?? 0n);
}

/**
 * Erro do limite diário com o quanto ainda dá para apostar hoje (lido depois do rollback da compra recusada; a
 * conferência que vale é a do banco, com a carteira travada).
 */
export async function dailyLimitExceeded(db: DatabaseService, tenantId: string, userId: string): Promise<AppError> {
  const remaining = await db.withTenant(tenantId, async (tx) => {
    const user = await tx.user.findFirst({ where: { tenantId, id: userId }, select: { dailyLimitCents: true } });
    return Math.max(0, (user?.dailyLimitCents ?? 0) - (await todaySpentCents(tx, userId)));
  });
  const message =
    remaining > 0
      ? `Limite diário de apostas atingido. Hoje você ainda pode apostar ${formatBrl(remaining)}.`
      : 'Limite diário de apostas atingido. Você não pode mais apostar hoje.';
  return new AppError(409, 'DAILY_LIMIT_EXCEEDED', message, [{ field: 'remainingCents', message: String(remaining) }]);
}
