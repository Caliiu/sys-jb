import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type AdminUserDetail, type LoginResponse, type PublicUser, drawDateOf } from '@sysjb/contracts';
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
  settleAll,
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

const TOMORROW = drawDateOf(new Date().toISOString(), 1);
let nextNumber = 0;

/** Jogador que se cadastra pelo convite de `referrer` (ou sem convite), com R$ 100 de saldo. */
async function bettor(referrer: PublicUser | null) {
  const person = await createUser(app, 'aurora', referrer ? { inviteCode: String(referrer.displayId) } : {});
  await asTenant(migratorPool, auroraId, (c) =>
    c.query("SELECT wallet_manual_adjust($1, 10000, 0, 0, 'fundos de teste')", [person.id]),
  );
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}
type Bettor = Awaited<ReturnType<typeof bettor>>;

/** Aposta na Fazendinha: `totalCents` em números de R$ 1 (cada número só é vendido uma vez por cartela). */
async function bet({ http }: Bettor, totalCents: number) {
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
}

const walletOf = async (session: Session, userId: string) =>
  ((await session.http.get(`/v1/admin/users/${userId}`)).body as AdminUserDetail).wallet;

const commissionsOf = (userId: string) =>
  asTenant(migratorPool, auroraId, (c) =>
    c.query(
      `SELECT wagered_cents::int, referral_rate_bps, promoter_rate_bps, referral_cents::int, promoter_cents::int,
              credited_at IS NOT NULL AS paid
       FROM bet_commissions WHERE user_id = $1 ORDER BY created_at, wagered_cents`,
      [userId],
    ),
  ).then((r) => r.rows);

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

  it('paga na apuração do pule: indicação X%, promotor X%+Y%; bloqueado e quem veio sem convite não geram', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 });
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 700 });
    const regular = await createUser(app, 'aurora');
    const blocked = await createUser(app, 'aurora');

    const byPromoter = await bettor(promoter);
    const byRegular = await bettor(regular);
    const byBlocked = await bettor(blocked);
    const alone = await bettor(null);
    await session.http.patch(`/v1/admin/users/${blocked.id}/status`, { status: 'BLOCKED' });

    await bet(byPromoter, 1000);
    // Na aposta, a comissão fica pendente: nada entra no Saldo de quem indicou ainda.
    expect((await walletOf(session, promoter.id)).balanceJb).toBe(0);
    await bet(byPromoter, 2000);
    await bet(byRegular, 500);
    await bet(byBlocked, 200);
    await bet(alone, 700);
    expect((await commissionsOf(promoter.id)).map((row) => row.paid)).toEqual([false, false]);

    // O resultado chega e os pules são apurados: a comissão entra (3% + 7%).
    await settleAll(app, 'aurora');
    expect((await walletOf(session, promoter.id)).balanceJb).toBe(300);
    expect((await walletOf(session, regular.id)).balanceJb).toBe(15);
    expect((await walletOf(session, blocked.id)).balanceJb).toBe(0);
    expect(await commissionsOf(promoter.id)).toEqual([
      {
        wagered_cents: 1000,
        referral_rate_bps: 300,
        promoter_rate_bps: 700,
        referral_cents: 30,
        promoter_cents: 70,
        paid: true,
      },
      {
        wagered_cents: 2000,
        referral_rate_bps: 300,
        promoter_rate_bps: 700,
        referral_cents: 60,
        promoter_cents: 140,
        paid: true,
      },
    ]);
    expect(await commissionsOf(regular.id)).toEqual([
      {
        wagered_cents: 500,
        referral_rate_bps: 300,
        promoter_rate_bps: 0,
        referral_cents: 15,
        promoter_cents: 0,
        paid: true,
      },
    ]);

    const entries = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `SELECT user_id, balance_jb_delta::int AS delta, note FROM wallet_entries
         WHERE kind = 'COMMISSION' ORDER BY created_at`,
      ),
    );
    expect(entries.rows).toEqual([
      { user_id: promoter.id, delta: 100, note: 'Comissão de aposta' },
      { user_id: promoter.id, delta: 200, note: 'Comissão de aposta' },
      { user_id: regular.id, delta: 15, note: 'Comissão de aposta' },
    ]);
  });

  it('cada parte arredonda para baixo; a % é a do momento da aposta; 0% não gera registro', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1 });
    const player = await bettor(promoter);

    // 0% de indicação e 0,01% de R$ 1 (0,01 centavo) = nada a pagar: nenhum registro.
    await bet(player, 100);
    expect(await commissionsOf(promoter.id)).toEqual([]);

    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 333 });
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1250 });
    await bet(player, 300);
    // Mudar a % depois não altera o que já foi pago.
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 5000 });
    await settleAll(app, 'aurora');
    // 3,33% de R$ 3 = 9,99 centavos -> 9; 12,5% de R$ 3 = 37,5 -> 37.
    expect(await commissionsOf(promoter.id)).toEqual([
      {
        wagered_cents: 300,
        referral_rate_bps: 333,
        promoter_rate_bps: 1250,
        referral_cents: 9,
        promoter_cents: 37,
        paid: true,
      },
    ]);
    expect((await walletOf(session, promoter.id)).balanceJb).toBe(46);
  });

  it('bloqueado entre a aposta e a apuração não recebe; apurar de novo não paga duas vezes', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 1000 });
    const kept = await createUser(app, 'aurora');
    const lost = await createUser(app, 'aurora');
    await bet(await bettor(kept), 1000);
    await bet(await bettor(lost), 1000);
    await session.http.patch(`/v1/admin/users/${lost.id}/status`, { status: 'BLOCKED' });

    await settleAll(app, 'aurora');
    await settleAll(app, 'aurora');
    expect((await walletOf(session, kept.id)).balanceJb).toBe(100);
    expect((await walletOf(session, lost.id)).balanceJb).toBe(0);
    const rows = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `SELECT user_id, credited_at IS NOT NULL AS paid, forfeited_at IS NOT NULL AS lost FROM bet_commissions
         ORDER BY created_at`,
      ),
    );
    expect(rows.rows).toEqual([
      { user_id: kept.id, paid: true, lost: false },
      { user_id: lost.id, paid: false, lost: true },
    ]);
    const entries = await asTenant(migratorPool, auroraId, (c) =>
      c.query(`SELECT count(*)::int AS n FROM wallet_entries WHERE kind = 'COMMISSION'`),
    );
    expect(entries.rows[0]).toEqual({ n: 1 });
  });

  it('Financeiro só consulta; Suporte não vê; a API não grava comissões nem chama o crédito', async () => {
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.get('/v1/admin/commissions/settings')).status).toBe(200);
    expect((await finance.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 1 })).status).toBe(403);

    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get('/v1/admin/commissions/settings')).status).toBe(403);

    // O fechamento mensal de Loterias/Fazendinha não existe mais.
    expect((await finance.http.get('/v1/admin/commissions/months/2026-01')).status).toBe(404);

    const user = await createUser(app, 'aurora');
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query('SELECT bet_commission_credit($1, $2, 1000, NULL, NULL)', [auroraId, user.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query(
          `INSERT INTO bet_commissions (tenant_id, user_id, bettor_id, wagered_cents, referral_rate_bps,
             promoter_rate_bps, referral_cents, promoter_cents)
           VALUES ($1, $2, $2, 100, 0, 0, 1, 0)`,
          [auroraId, user.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
