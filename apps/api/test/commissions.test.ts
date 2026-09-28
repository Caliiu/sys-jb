import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminCommissionMonth,
  type AdminUserDetail,
  type LoginResponse,
  type PublicUser,
  brasiliaNow,
  drawDateOf,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  asTenant,
  createUser,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  tenantId,
} from './helpers.js';

let app: INestApplication;
let auroraId: string;

beforeAll(async () => {
  app = await startApp();
  auroraId = await tenantId('aurora');
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

type Session = Awaited<ReturnType<typeof loginOperator>>;

const now = () => brasiliaNow(new Date().toISOString());
const monthOf = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;
const CURRENT = (() => {
  const { year, month } = now();
  return monthOf(year, month);
})();
const LAST = (() => {
  const { year, month } = now();
  return month === 1 ? monthOf(year - 1, 12) : monthOf(year, month - 1);
})();
const TOMORROW = drawDateOf(new Date().toISOString(), 1);
let nextNumber = 0;

/** Jogador que se cadastra pelo convite de `referrer` (ou sem convite) e aposta `bets` (em centavos, R$ 1 cada número). */
async function bettor(referrer: PublicUser | null, totalCents: number) {
  const person = await createUser(app, 'aurora', referrer ? { inviteCode: String(referrer.displayId) } : {});
  await asTenant(migratorPool, auroraId, (c) =>
    c.query("SELECT wallet_manual_adjust($1, $2, 0, 0, 'fundos de teste')", [person.id, totalCents]),
  );
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  const http = api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
  // Cada número só é vendido uma vez por cartela: cada apostador usa números novos (centena: 0–999).
  const numbers = Array.from({ length: totalCents / 100 }, () => nextNumber++);
  const res = await http.post('/v1/fazendinha/bets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    lottery: 'LT BAHIA 10HS',
    hour: 10,
    mode: 'centena',
    stakeCents: 100,
    prizeCents: 88_000,
    numbers,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return person;
}

/** Leva todas as apostas para o meio do mês passado (a dona das tabelas pode; a API não). */
const moveBetsToLastMonth = () =>
  asTenant(migratorPool, auroraId, (c) =>
    c.query("UPDATE fazendinha_bets SET created_at = ($1 || '-15 12:00:00-03')::timestamptz", [LAST]),
  );

const walletOf = async (session: Session, userId: string) =>
  ((await session.http.get(`/v1/admin/users/${userId}`)).body as AdminUserDetail).wallet;

describe('indicação × promotor no cadastro', () => {
  it('jogador comum também indica; o painel mostra "indicado por" e, se for promotor, "promotor"', async () => {
    const session = await loginOperator(app, 'aurora');
    const regular = await createUser(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 700 });

    const byRegular = await createUser(app, 'aurora', { inviteCode: String(regular.displayId) });
    const byPromoter = await createUser(app, 'aurora', { inviteCode: String(promoter.displayId) });

    const detail = (id: string) => session.http.get(`/v1/admin/users/${id}`).then((r) => r.body as AdminUserDetail);
    expect((await detail(byRegular.id)).referredBy).toEqual({
      id: regular.id,
      displayId: regular.displayId,
      name: regular.name,
      promoterCommissionBps: null,
    });
    expect((await detail(byPromoter.id)).referredBy).toMatchObject({ id: promoter.id, promoterCommissionBps: 700 });

    const list = (await session.http.get('/v1/admin/users')).body.items as Array<{
      id: string;
      referredBy: { id: string } | null;
      promoter: { id: string } | null;
    }>;
    const row = (id: string) => list.find((u) => u.id === id)!;
    expect(row(byRegular.id)).toMatchObject({ referredBy: { id: regular.id }, promoter: null });
    expect(row(byPromoter.id)).toMatchObject({ referredBy: { id: promoter.id }, promoter: { id: promoter.id } });
  });
});

describe('comissões', () => {
  it('Gerente define a % de indicação (com auditoria); valores fora de 0–100% são recusados', async () => {
    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get('/v1/admin/commissions/settings')).body).toEqual({ referralCommissionBps: 0 });
    const res = await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ referralCommissionBps: 300 });
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 });

    const audit = (await session.http.get('/v1/admin/audit?action=commission.rate')).body.items;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      targetType: 'tenant',
      target: null,
      details: { fields: ['referralCommissionBps'], from: 0, to: 300 },
    });

    for (const bad of [-1, 10_001, 2.5, '300']) {
      expect((await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: bad })).status).toBe(
        400,
      );
    }
  });

  it('prévia e fechamento: indicação X%, promotor X%+Y%, bloqueado não recebe; crédito no Saldo', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 });
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 700 });
    const regular = await createUser(app, 'aurora');
    const blocked = await createUser(app, 'aurora');

    await bettor(promoter, 1000);
    await bettor(promoter, 2000);
    await bettor(regular, 500);
    await bettor(blocked, 200);
    await bettor(null, 700);
    await session.http.patch(`/v1/admin/users/${blocked.id}/status`, { status: 'BLOCKED' });

    // Apostas deste mês não entram no mês passado.
    const empty = (await session.http.get(`/v1/admin/commissions/months/${LAST}`)).body as AdminCommissionMonth;
    expect(empty.rows).toEqual([]);

    await moveBetsToLastMonth();
    const preview = (await session.http.get(`/v1/admin/commissions/months/${LAST}`)).body as AdminCommissionMonth;
    expect(preview).toMatchObject({ month: LAST, closed: null, canClose: true });
    expect(
      preview.rows.map((r) => [
        r.user.id,
        r.wageredCents,
        r.referralRateBps,
        r.promoterRateBps,
        r.amountCents,
        r.status,
      ]),
    ).toEqual([
      [promoter.id, 3000, 300, 700, 300, 'PAID'],
      [regular.id, 500, 300, 0, 15, 'PAID'],
      [blocked.id, 200, 300, 0, 6, 'BLOCKED'],
    ]);
    expect(preview.totals).toEqual({ wageredCents: 3700, paidCents: 315 });

    const closed = await session.http.post(`/v1/admin/commissions/months/${LAST}/close`, {});
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({
      closed: { totalPaidCents: 315, operatorName: session.operator.name },
      canClose: false,
      totals: { paidCents: 315 },
    });

    expect((await walletOf(session, promoter.id)).balanceJb).toBe(300);
    expect((await walletOf(session, regular.id)).balanceJb).toBe(15);
    expect((await walletOf(session, blocked.id)).balanceJb).toBe(0);

    const entries = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        "SELECT user_id, balance_jb_delta, note FROM wallet_entries WHERE kind = 'COMMISSION' ORDER BY balance_jb_delta DESC",
      ),
    );
    expect(entries.rows).toEqual([
      { user_id: promoter.id, balance_jb_delta: '300', note: `Comissão de ${LAST.slice(5)}/${LAST.slice(0, 4)}` },
      { user_id: regular.id, balance_jb_delta: '15', note: `Comissão de ${LAST.slice(5)}/${LAST.slice(0, 4)}` },
    ]);
    const audit = (await session.http.get('/v1/admin/audit?action=commission.close')).body.items;
    expect(audit[0]).toMatchObject({ targetType: 'tenant', details: { fields: ['month'], month: LAST, amount: 315 } });

    // Fechado, o mês fica congelado: mudar a % depois não altera o que foi pago.
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 1000 });
    const after = (await session.http.get(`/v1/admin/commissions/months/${LAST}`)).body as AdminCommissionMonth;
    expect(after.totals.paidCents).toBe(315);
    expect((await session.http.get('/v1/admin/commissions/closings')).body).toEqual([
      { month: LAST, closedAt: expect.any(String), operatorName: session.operator.name, totalPaidCents: 315 },
    ]);
  });

  it('não fecha duas vezes, nem o mês corrente; fechamentos simultâneos pagam uma vez só', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 1000 });
    const referrer = await createUser(app, 'aurora');
    await bettor(referrer, 1000);
    await moveBetsToLastMonth();

    const results = await Promise.all(
      [1, 2, 3].map(() => session.http.post(`/v1/admin/commissions/months/${LAST}/close`, {})),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    expect((await walletOf(session, referrer.id)).balanceJb).toBe(100);

    const again = await session.http.post(`/v1/admin/commissions/months/${LAST}/close`, {});
    expect(again.body).toMatchObject({ code: 'CONFLICT', message: 'Este mês já foi fechado.' });
    const current = await session.http.post(`/v1/admin/commissions/months/${CURRENT}/close`, {});
    expect(current.status).toBe(409);
    expect(current.body.message).toBe('O mês ainda não terminou.');
    expect((await session.http.get(`/v1/admin/commissions/months/${CURRENT}`)).body.canClose).toBe(false);
    expect((await session.http.get('/v1/admin/commissions/months/2026-13')).status).toBe(400);
  });

  it('Financeiro só consulta; Suporte não vê; a função recusa quem não é Gerente', async () => {
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.get('/v1/admin/commissions/settings')).status).toBe(200);
    expect((await finance.http.get(`/v1/admin/commissions/months/${LAST}`)).status).toBe(200);
    expect((await finance.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 1 })).status).toBe(403);
    expect((await finance.http.post(`/v1/admin/commissions/months/${LAST}/close`, {})).status).toBe(403);

    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get('/v1/admin/commissions/settings')).status).toBe(403);

    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query('SELECT commission_close_month($1::date, $2)', [`${LAST}-01`, finance.operator.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query(
          "INSERT INTO commission_closings (tenant_id, month, operator_id, referral_rate_bps, total_paid_cents) VALUES ($1, '2020-01-01', $2, 0, 0)",
          [auroraId, finance.operator.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
