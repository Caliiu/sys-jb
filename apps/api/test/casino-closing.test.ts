import type { INestApplication } from '@nestjs/common';
import {
  type AdminCasinoClosing,
  type CasinoClosingPayResult,
  type OperatorRole,
  casinoClosingMonths,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  asTenant,
  consoleApi,
  createUser,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  tenantId,
} from './helpers.js';

let app: INestApplication;

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

type Tenant = 'aurora' | 'boreal';
type Session = Awaited<ReturnType<typeof loginOperator>>;

const { previous, current } = casinoClosingMonths(new Date().toISOString());
const ZERO = { turnoverCents: 0, payoutCents: 0, ggrCents: 0, commissionCents: 0 };
const NOTHING = { paidCents: 0, pendingCents: 0, pendingCount: 0 };
const URL = '/v1/admin/reports/casino/closing';

let txnSeq = 0;
/**
 * Rodada sintética do cassino no meio de um mês (Brasília). Gravada direto pela credencial de migração: o relatório só
 * soma as rodadas (a carteira de quem jogou não entra no fechamento).
 */
async function round(userId: string, month: string, betCents: number, winCents: number, tenant: Tenant = 'aurora') {
  txnSeq += 1;
  const id = await tenantId(tenant);
  await asTenant(migratorPool, id, (c) =>
    c.query(
      `INSERT INTO casino_transactions (tenant_id, user_id, txn_id, provider, game_code, txn_type, bet_cents,
                                        win_cents, balance_after, created_at)
       VALUES ($1, $2, $3, 'PGSOFT', 'fortune-tiger', 'debit_credit', $4, $5, 0, $6::timestamptz)`,
      [id, userId, `closing-${Date.now()}-${txnSeq}`, betCents, winCents, `${month}-15T12:00:00-03:00`],
    ),
  );
}

async function promoter(session: Session, name: string, casinoCommissionBps: number) {
  const user = await createUser(app, 'aurora', { name });
  const res = await session.http.put(`/v1/admin/promoters/${user.id}`, { commissionBps: 500, casinoCommissionBps });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return user;
}

const referral = (inviteCode: string, name: string) => createUser(app, 'aurora', { name, inviteCode });

async function closing(session: Session, month?: string) {
  const res = await session.http.get(month ? `${URL}?month=${month}` : URL);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as AdminCasinoClosing;
}

async function walletOf(userId: string) {
  const id = await tenantId('aurora');
  return asTenant(migratorPool, id, async (c) => {
    const wallet = await c.query<{ balance_jb: string; prizes_jb: string }>(
      `SELECT balance_jb, prizes_jb FROM wallets WHERE user_id = $1`,
      [userId],
    );
    const entries = await c.query<{ kind: string; balance_jb_delta: string; prizes_jb_delta: string; note: string }>(
      `SELECT kind, balance_jb_delta, prizes_jb_delta, note FROM wallet_entries WHERE user_id = $1 AND kind = 'CASINO_COMMISSION'`,
      [userId],
    );
    return {
      balanceCents: Number(wallet.rows[0]!.balance_jb),
      prizesCents: Number(wallet.rows[0]!.prizes_jb),
      entries: entries.rows,
    };
  });
}

describe('GET /v1/admin/reports/casino/closing', () => {
  it('exige operation.read; sem mês: os cards do mês anterior (encerrado) e do atual, sem detalhamento', async () => {
    expect((await consoleApi(app).get(URL)).status).toBe(401);
    const allowed: Record<OperatorRole, number> = { MANAGER: 200, FINANCE: 200, SUPPORT: 403 };
    for (const [role, status] of Object.entries(allowed) as Array<[OperatorRole, number]>) {
      const session = await loginOperator(app, 'aurora', { role });
      const res = await session.http.get(URL);
      expect(res.status, role).toBe(status);
      if (status === 200) {
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toEqual({
          months: [
            { month: previous, ended: true, totals: ZERO, promotersWithCommission: 0, ...NOTHING },
            { month: current, ended: false, totals: ZERO, promotersWithCommission: 0, ...NOTHING },
          ],
          detail: null,
        });
      }
    }
  });

  it('GGR dos indicados de cada promotor no mês e a % de cassino dele; GGR negativo paga 0', async () => {
    const session = await loginOperator(app, 'aurora');
    const bia = await promoter(session, 'Bia Promotora', 2500);
    const ana = await promoter(session, 'Ana Promotora', 1000);
    const caio = await promoter(session, 'Caio Promotor', 3000);
    const rita = await referral(bia.inviteCode, 'Rita Indicada');
    const lia = await referral(bia.inviteCode, 'Lia Indicada');
    const tom = await referral(caio.inviteCode, 'Tom Indicado');
    // Indicado por jogador comum e jogador sem indicação: fora do fechamento.
    const common = await createUser(app, 'aurora', { name: 'Comum' });
    const commonReferral = await referral(common.inviteCode, 'Indicado do Comum');
    const loose = await createUser(app, 'aurora', { name: 'Solto' });

    await round(rita.id, previous, 10_000, 2_000);
    await round(lia.id, previous, 5_000, 0);
    await round(lia.id, previous, 1_001, 0);
    await round(tom.id, previous, 1_000, 4_000); // GGR negativo
    await round(commonReferral.id, previous, 9_999, 0);
    await round(loose.id, previous, 9_999, 0);
    await round(rita.id, current, 3_000, 1_000); // mês atual: não entra no anterior
    // Outra banca: não aparece.
    const boreal = await loginOperator(app, 'boreal');
    const foreign = await createUser(app, 'boreal');
    await boreal.http.put(`/v1/admin/promoters/${foreign.id}`, { commissionBps: 100, casinoCommissionBps: 5000 });
    const foreignReferral = await createUser(app, 'boreal', { inviteCode: foreign.inviteCode });
    await round(foreignReferral.id, previous, 50_000, 0, 'boreal');

    const body = await closing(session, previous);
    // Bia: GGR 16.001 − 2.000 = 14.001 x 25% = 3.500,25 → 3.500 (para baixo no centavo).
    expect(body.detail).toEqual({
      month: previous,
      ended: true,
      rows: [
        {
          promoter: { id: ana.id, displayId: ana.displayId, name: 'Ana Promotora' },
          casinoCommissionBps: 1000,
          referralsCount: 0,
          ...ZERO,
          status: 'none',
          paidAt: null,
        },
        {
          promoter: { id: bia.id, displayId: bia.displayId, name: 'Bia Promotora' },
          casinoCommissionBps: 2500,
          referralsCount: 2,
          turnoverCents: 16_001,
          payoutCents: 2_000,
          ggrCents: 14_001,
          commissionCents: 3_500,
          status: 'pending',
          paidAt: null,
        },
        {
          promoter: { id: caio.id, displayId: caio.displayId, name: 'Caio Promotor' },
          casinoCommissionBps: 3000,
          referralsCount: 1,
          turnoverCents: 1_000,
          payoutCents: 4_000,
          ggrCents: -3_000,
          commissionCents: 0,
          status: 'none',
          paidAt: null,
        },
      ],
      totals: { turnoverCents: 17_001, payoutCents: 6_000, ggrCents: 11_001, commissionCents: 3_500 },
      paidCents: 0,
      pendingCents: 3_500,
      pendingCount: 1,
    });
    expect(body.months[0]).toEqual({
      month: previous,
      ended: true,
      totals: body.detail!.totals,
      promotersWithCommission: 1,
      paidCents: 0,
      pendingCents: 3_500,
      pendingCount: 1,
    });
    // Mês em andamento: parcial, sem nada a pagar.
    expect(body.months[1]).toMatchObject({
      month: current,
      ended: false,
      totals: { turnoverCents: 3_000, payoutCents: 1_000, ggrCents: 2_000, commissionCents: 500 },
      promotersWithCommission: 1,
      ...NOTHING,
    });
    const now = await closing(session, current);
    expect(now.detail!.rows.map((row) => row.status)).toEqual(['open', 'open', 'open']);
  });

  it.each([
    ['mês inválido', 'month=2026-13'],
    ['formato errado', 'month=2026-1'],
    ['mês futuro', 'month=2099-01'],
    ['parâmetro desconhecido', `month=${current}&x=1`],
  ])('recusa %s (400)', async (_label, query) => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get(`${URL}?${query}`)).status).toBe(400);
  });
});

describe('POST /v1/admin/reports/casino/closing/pay', () => {
  it('só o Gerente paga, só mês encerrado; corpo conferido', async () => {
    const session = await loginOperator(app, 'aurora');
    for (const role of ['FINANCE', 'SUPPORT'] as const) {
      const other = await loginOperator(app, 'aurora', { role });
      expect((await other.http.post(`${URL}/pay`, { month: previous })).status, role).toBe(403);
    }
    for (const body of [
      { month: current },
      { month: '2099-01' },
      { month: '2026-1' },
      { month: previous, promoterId: 'x' },
      { month: previous, extra: 1 },
      {},
    ]) {
      expect((await session.http.post(`${URL}/pay`, body)).status, JSON.stringify(body)).toBe(400);
    }
    // Sem nada a pagar.
    expect((await session.http.post(`${URL}/pay`, { month: previous })).status).toBe(409);
  });

  it('paga um promotor no Saldo (movimentação + auditoria); repetir = 409; o valor pago não muda depois', async () => {
    const session = await loginOperator(app, 'aurora');
    const bia = await promoter(session, 'Bia Promotora', 2500);
    const ana = await promoter(session, 'Ana Promotora', 1000);
    await round((await referral(bia.inviteCode, 'Rita')).id, previous, 10_000, 2_000);
    await round((await referral(ana.inviteCode, 'Lia')).id, previous, 5_000, 0);
    const before = await walletOf(bia.id);

    const res = await session.http.post(`${URL}/pay`, { month: previous, promoterId: bia.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body as CasinoClosingPayResult).toEqual({ paidCount: 1, paidCents: 2_000 });

    const after = await walletOf(bia.id);
    // Vai para o saldo de saque (prêmios das loterias), não para o Saldo de apostas.
    expect(after.prizesCents - before.prizesCents).toBe(2_000);
    expect(after.balanceCents).toBe(before.balanceCents);
    const [year, month] = previous.split('-');
    expect(after.entries).toEqual([
      {
        kind: 'CASINO_COMMISSION',
        balance_jb_delta: '0',
        prizes_jb_delta: '2000',
        note: `Comissão de cassino ${month}/${year}`,
      },
    ]);
    const audit = await session.http.get('/v1/admin/audit?action=casino.commission.pay');
    expect(audit.status).toBe(200);
    expect(audit.body.items).toHaveLength(1);
    expect(audit.body.items[0]).toMatchObject({
      action: 'casino.commission.pay',
      target: { id: bia.id },
      details: { fields: ['casinoCommission'], amount: 2_000, month: previous },
    });

    expect((await session.http.post(`${URL}/pay`, { month: previous, promoterId: bia.id })).status).toBe(409);

    // A % muda depois do pagamento: o mês pago mostra o que foi pago.
    await session.http.put(`/v1/admin/promoters/${bia.id}`, { commissionBps: 500, casinoCommissionBps: 5000 });
    const body = await closing(session, previous);
    const row = body.detail!.rows.find((item) => item.promoter.id === bia.id)!;
    expect(row).toMatchObject({ status: 'paid', casinoCommissionBps: 2500, commissionCents: 2_000 });
    expect(Date.parse(row.paidAt!)).not.toBeNaN();
    expect(body.detail).toMatchObject({ paidCents: 2_000, pendingCents: 500, pendingCount: 1 });
    expect(body.months[0]).toMatchObject({ paidCents: 2_000, pendingCents: 500, pendingCount: 1 });
  });

  it('pagar todos: só os pendentes; bloqueado não recebe; depois, nada a pagar', async () => {
    const session = await loginOperator(app, 'aurora');
    const bia = await promoter(session, 'Bia Promotora', 2500);
    const ana = await promoter(session, 'Ana Promotora', 1000);
    const beto = await promoter(session, 'Beto Bloqueado', 1000);
    await round((await referral(bia.inviteCode, 'Rita')).id, previous, 10_000, 2_000);
    await round((await referral(ana.inviteCode, 'Lia')).id, previous, 5_000, 0);
    await round((await referral(beto.inviteCode, 'Tom')).id, previous, 5_000, 0);
    await session.http.patch(`/v1/admin/users/${beto.id}/status`, { status: 'BLOCKED' });

    const before = await closing(session, previous);
    expect(before.detail!.rows.map((row) => [row.promoter.name, row.status])).toEqual([
      ['Ana Promotora', 'pending'],
      ['Beto Bloqueado', 'blocked'],
      ['Bia Promotora', 'pending'],
    ]);
    // O bloqueado fica fora do total a pagar.
    expect(before.detail!.totals.commissionCents).toBe(2_500);

    const res = await session.http.post(`${URL}/pay`, { month: previous });
    expect(res.body).toEqual({ paidCount: 2, paidCents: 2_500 });
    expect((await walletOf(beto.id)).entries).toEqual([]);
    expect((await session.http.post(`${URL}/pay`, { month: previous, promoterId: beto.id })).status).toBe(409);
    expect((await session.http.post(`${URL}/pay`, { month: previous })).status).toBe(409);
    expect((await closing(session, previous)).detail).toMatchObject({ paidCents: 2_500, pendingCount: 0 });
  });

  it('pedidos simultâneos pagam uma vez só', async () => {
    const session = await loginOperator(app, 'aurora');
    const bia = await promoter(session, 'Bia Promotora', 2500);
    await round((await referral(bia.inviteCode, 'Rita')).id, previous, 10_000, 2_000);

    const results = await Promise.all([
      session.http.post(`${URL}/pay`, { month: previous }),
      session.http.post(`${URL}/pay`, { month: previous, promoterId: bia.id }),
      session.http.post(`${URL}/pay`, { month: previous }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409, 409]);
    expect((await walletOf(bia.id)).entries).toHaveLength(1);
  });

  it('isolamento: promotor de outra banca não é pago', async () => {
    const session = await loginOperator(app, 'aurora');
    const boreal = await loginOperator(app, 'boreal');
    const foreign = await createUser(app, 'boreal');
    await boreal.http.put(`/v1/admin/promoters/${foreign.id}`, { commissionBps: 100, casinoCommissionBps: 5000 });
    await round((await createUser(app, 'boreal', { inviteCode: foreign.inviteCode })).id, previous, 9_000, 0, 'boreal');

    expect((await session.http.post(`${URL}/pay`, { month: previous, promoterId: foreign.id })).status).toBe(409);
    expect((await boreal.http.post(`${URL}/pay`, { month: previous })).body).toEqual({
      paidCount: 1,
      paidCents: 4_500,
    });
  });
});
