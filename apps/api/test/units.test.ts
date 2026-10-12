import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminUserDetail,
  type AdminUserListItem,
  type LoginResponse,
  type Page,
  type PublicUser,
  defaultQuotes,
  drawDateOf,
  findLotteryModality,
  lotteryQuoteCents,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  asTenant,
  createUser,
  defaultQuoteTableId,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  settleAll,
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
beforeEach(async () => {
  await resetUsers();
  nextNumber = 0;
});

type Session = Awaited<ReturnType<typeof loginOperator>>;

const TOMORROW = drawDateOf(new Date().toISOString(), 1);
let nextNumber = 0;

/** Unidade (jogador) com R$ 100 de Saldo; com `referrer`, cadastrada pelo convite dele. */
async function unit(referrer: PublicUser | null = null, balanceCents = 10_000) {
  const person = await createUser(app, 'aurora', referrer ? { inviteCode: String(referrer.displayId) } : {});
  await asTenant(migratorPool, auroraId, (c) =>
    c.query("SELECT wallet_manual_adjust($1, $2, 0, 0, 'fundos de teste')", [person.id, balanceCents]),
  );
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}
type Unit = Awaited<ReturnType<typeof unit>>;

const settings = (session: Session, userId: string, body: Record<string, unknown>) =>
  session.http.patch(`/v1/admin/users/${userId}/settings`, body);

/** Fazendinha: `totalCents` em números de R$ 1 (cada número só é vendido uma vez por cartela). */
const bet = ({ http }: Unit, totalCents: number) =>
  http.post('/v1/fazendinha/bets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    lottery: 'LT BAHIA 10HS',
    hour: 10,
    mode: 'centena',
    stakeCents: 100,
    prizeCents: 88_000,
    numbers: Array.from({ length: totalCents / 100 }, () => nextNumber++),
  });

/** Loterias: milhar na 1ª, `amountCents` por extração. */
const ticket = ({ http }: Unit, amountCents: number, draws = [{ name: 'LT PT RIO 14HS', hour: 14 }]) =>
  http.post('/v1/lotteries/tickets', {
    idempotencyKey: randomUUID(),
    game: 'tradicional',
    drawDate: TOMORROW,
    draws,
    items: [
      {
        modality: 'milhar',
        placement: 'p1',
        guesses: ['3452'],
        amountCents,
        split: 'total',
        quoteCents: lotteryQuoteCents(findLotteryModality('milhar')!, defaultQuotes()),
      },
    ],
  });

const detailOf = async (session: Session, userId: string) =>
  (await session.http.get(`/v1/admin/users/${userId}`)).body as AdminUserDetail;

const commissions = () =>
  asTenant(migratorPool, auroraId, (c) =>
    c.query(
      `SELECT user_id, bettor_id, beneficiary, wagered_cents::int AS wagered, unit_rate_bps,
              (referral_cents + promoter_cents + unit_cents)::int AS cents, credited_at IS NOT NULL AS paid,
              forfeited_at IS NOT NULL AS lost, reversed_cents::int AS reversed
         FROM bet_commissions ORDER BY created_at, beneficiary DESC`,
    ),
  ).then((r) => r.rows);

// ---------------------------------------------------------------------------------------------------------------
// Configurações da unidade pelo painel
// ---------------------------------------------------------------------------------------------------------------

describe('configurações da unidade (painel)', () => {
  it('lista e detalhe trazem as configurações e a tabela que vale; o Gerente altera com auditoria antes/depois', async () => {
    const manager = await loginOperator(app, 'aurora');
    const { person } = await unit();
    const defaultId = await defaultQuoteTableId(auroraId);
    const vip = await manager.http.post('/v1/admin/quote-tables', { name: 'VIP' });
    await manager.http.put(`/v1/admin/quote-tables/${vip.body.id}/tradicional`, {
      quotes: [{ modality: 'milhar', prizeCents: 900_000 }],
    });

    const before = await detailOf(manager, person.id);
    expect(before).toMatchObject({
      region: null,
      unitCommissionBps: 0,
      quoteTable: { id: defaultId, name: '800/1/8000', label: '800/1/8000', isDefault: true, own: false },
      giftMilharEnabled: false,
      retainPrizes: false,
      dailyLimitEnabled: false,
      dailyLimitCents: null,
      todaySpentCents: 0,
      // Campos de antes continuam.
      id: person.id,
      displayId: person.displayId,
      wallet: expect.objectContaining({ balanceJb: 10_000 }),
    });

    const res = await settings(manager, person.id, {
      region: 'SP',
      unitCommissionBps: 250,
      quoteTableId: vip.body.id,
      giftMilharEnabled: true,
      retainPrizes: true,
      dailyLimitEnabled: true,
      dailyLimitCents: 5_000,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      region: 'SP',
      unitCommissionBps: 250,
      quoteTable: { id: vip.body.id, name: 'VIP', label: '800/1/9000', isDefault: false, own: true },
      giftMilharEnabled: true,
      retainPrizes: true,
      dailyLimitEnabled: true,
      dailyLimitCents: 5_000,
    });

    const list = (await manager.http.get('/v1/admin/users')).body as Page<AdminUserListItem>;
    expect(list.items.find((u) => u.id === person.id)).toMatchObject({
      region: 'SP',
      unitCommissionBps: 250,
      quoteTable: { name: 'VIP', own: true },
      dailyLimitCents: 5_000,
    });

    // Repetir os mesmos valores não grava nem audita; desligar o limite mantém o valor; null volta à padrão.
    await settings(manager, person.id, { region: 'SP', unitCommissionBps: 250 });
    const off = await settings(manager, person.id, { dailyLimitEnabled: false, quoteTableId: null, region: null });
    expect(off.body).toMatchObject({
      dailyLimitEnabled: false,
      dailyLimitCents: 5_000,
      region: null,
      quoteTable: { id: defaultId, own: false, isDefault: true },
    });

    const audit = (await manager.http.get(`/v1/admin/audit?action=user.unit&userId=${person.id}`)).body.items;
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({
      targetType: 'user',
      target: { id: person.id },
      details: {
        fields: [
          'region',
          'unitCommissionBps',
          'quoteTableId',
          'giftMilharEnabled',
          'retainPrizes',
          'dailyLimitEnabled',
          'dailyLimitCents',
        ],
        changes: [
          { field: 'region', from: null, to: 'SP' },
          { field: 'unitCommissionBps', from: 0, to: 250 },
          { field: 'quoteTableId', from: null, to: 'VIP' },
          { field: 'giftMilharEnabled', from: false, to: true },
          { field: 'retainPrizes', from: false, to: true },
          { field: 'dailyLimitEnabled', from: false, to: true },
          { field: 'dailyLimitCents', from: null, to: 5_000 },
        ],
      },
    });
    expect(audit[0].details.changes).toEqual([
      { field: 'region', from: 'SP', to: null },
      { field: 'quoteTableId', from: 'VIP', to: null },
      { field: 'dailyLimitEnabled', from: true, to: false },
    ]);
  });

  it('validação: UF, comissão 0–100%, limite positivo e obrigatório para ligar, tabela da banca, corpo vazio', async () => {
    const manager = await loginOperator(app, 'aurora');
    const { person } = await unit();
    const bad = [
      {},
      { region: 'XX' },
      { region: 'sp' },
      { unitCommissionBps: -1 },
      { unitCommissionBps: 10_001 },
      { unitCommissionBps: 2.5 },
      { dailyLimitCents: 0 },
      { dailyLimitCents: 100_000_001 },
      { dailyLimitEnabled: true },
      { dailyLimitEnabled: true, dailyLimitCents: null },
      { quoteTableId: 'nao-e-uuid' },
      { quoteTableId: randomUUID() },
      { giftMilharEnabled: 'sim' },
      { outro: true },
    ];
    for (const body of bad) {
      const res = await settings(manager, person.id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    // Tabela de outra banca também é "não encontrada".
    const boreal = await loginOperator(app, 'boreal');
    const foreign = (await boreal.http.post('/v1/admin/quote-tables', { name: 'Fora' })).body;
    expect((await settings(manager, person.id, { quoteTableId: foreign.id })).status).toBe(400);
    expect((await settings(manager, randomUUID(), { region: 'SP' })).status).toBe(404);
    // Usuário de outra banca: 404.
    const other = await createUser(app, 'boreal');
    expect((await settings(manager, other.id, { region: 'SP' })).status).toBe(404);

    expect((await settings(manager, person.id, { dailyLimitEnabled: true, dailyLimitCents: 100 })).status).toBe(200);
    // Com limite gravado, ligar/desligar sem mandar o valor funciona.
    expect((await settings(manager, person.id, { dailyLimitEnabled: false })).status).toBe(200);
    expect((await settings(manager, person.id, { dailyLimitEnabled: true })).status).toBe(200);
    // Apagar o limite com ele ligado não pode.
    expect((await settings(manager, person.id, { dailyLimitCents: null })).status).toBe(400);
    expect((await manager.http.get('/v1/admin/audit?action=user.unit')).body.items).toHaveLength(3);
  });

  it('só o Gerente (units.manage); Financeiro e Suporte consultam as configurações mas não alteram', async () => {
    const { person } = await unit();
    for (const role of ['FINANCE', 'SUPPORT'] as const) {
      const operator = await loginOperator(app, 'aurora', { role });
      expect((await settings(operator, person.id, { region: 'SP' })).status).toBe(403);
      expect((await detailOf(operator, person.id)).unitCommissionBps).toBe(0);
    }
    expect(operatorPermissions(await loginOperator(app, 'aurora'))).toContain('units.manage');
    expect(operatorPermissions(await loginOperator(app, 'aurora', { role: 'FINANCE' }))).not.toContain('units.manage');
  });
});

const operatorPermissions = (session: Session) => session.operator.permissions;

// ---------------------------------------------------------------------------------------------------------------
// Comissão da unidade
// ---------------------------------------------------------------------------------------------------------------

describe('comissão da unidade', () => {
  it('pendente na aposta, paga na apuração no Saldo da própria unidade; convive com a de quem indicou', async () => {
    const manager = await loginOperator(app, 'aurora');
    await manager.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 300 });
    const referrer = await createUser(app, 'aurora');
    const me = await unit(referrer);
    await settings(manager, me.person.id, { unitCommissionBps: 500 });

    expect((await bet(me, 1000)).status).toBe(201);
    expect((await ticket(me, 2000)).status).toBe(201);
    // Na aposta, tudo pendente: só o débito.
    expect((await detailOf(manager, me.person.id)).wallet.balanceJb).toBe(7_000);
    expect(await commissions()).toEqual([
      expect.objectContaining({
        beneficiary: 'UNIT',
        user_id: me.person.id,
        unit_rate_bps: 500,
        cents: 50,
        paid: false,
      }),
      expect.objectContaining({ beneficiary: 'REFERRER', user_id: referrer.id, cents: 30, paid: false }),
      expect.objectContaining({ beneficiary: 'UNIT', user_id: me.person.id, cents: 100, paid: false }),
      expect.objectContaining({ beneficiary: 'REFERRER', user_id: referrer.id, cents: 60, paid: false }),
    ]);

    await settleAll(app, 'aurora');
    await settleAll(app, 'aurora');
    // 5% de R$ 30 para a unidade; 3% para quem indicou; uma vez só.
    expect((await detailOf(manager, me.person.id)).wallet.balanceJb).toBe(7_150);
    expect((await detailOf(manager, referrer.id)).wallet.balanceJb).toBe(90);
    expect((await commissions()).every((row) => row.paid)).toBe(true);
    const entries = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `SELECT user_id, balance_jb_delta::int AS delta, note FROM wallet_entries WHERE kind = 'COMMISSION'
          ORDER BY delta`,
      ),
    );
    expect(entries.rows).toHaveLength(4);
    expect(entries.rows.filter((row) => row.user_id === me.person.id)).toEqual([
      { user_id: me.person.id, delta: 50, note: 'Comissão da unidade' },
      { user_id: me.person.id, delta: 100, note: 'Comissão da unidade' },
    ]);
  });

  it('só sobre o que foi pago com dinheiro (bônus não); 0% não gera; pule cancelado anula; bloqueado perde', async () => {
    const manager = await loginOperator(app, 'aurora');
    const withBonus = await unit();
    const canceled = await unit();
    const blocked = await unit();
    const none = await unit();
    for (const who of [withBonus, canceled, blocked]) {
      await settings(manager, who.person.id, { unitCommissionBps: 1000 });
    }
    // R$ 5 de bônus: a aposta de R$ 10 sai metade do bônus; comissão só sobre os R$ 5 de Saldo.
    await manager.http.post(`/v1/admin/users/${withBonus.person.id}/wallet/credits`, {
      idempotencyKey: randomUUID(),
      bucket: 'bonus',
      amountCents: 500,
      note: 'Bônus de teste',
    });
    expect((await bet(withBonus, 1000)).status).toBe(201);
    // Tudo no bônus: nada de comissão.
    await manager.http.post(`/v1/admin/users/${withBonus.person.id}/wallet/credits`, {
      idempotencyKey: randomUUID(),
      bucket: 'bonus',
      amountCents: 300,
      note: 'Bônus de teste',
    });
    expect((await bet(withBonus, 300)).status).toBe(201);

    const toCancel = await ticket(canceled, 800);
    expect(toCancel.status).toBe(201);
    const cancel = await canceled.http.post(`/v1/me/pules/${toCancel.body.tickets[0].puleNumber}/cancel`, {});
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);

    expect((await bet(blocked, 400)).status).toBe(201);
    await manager.http.patch(`/v1/admin/users/${blocked.person.id}/status`, { status: 'BLOCKED' });
    expect((await bet(none, 400)).status).toBe(201);

    await settleAll(app, 'aurora');
    const rows = await commissions();
    expect(rows.map((row) => [row.user_id, row.wagered, row.cents, row.paid, row.lost, row.reversed])).toEqual([
      [withBonus.person.id, 500, 50, true, false, null],
      [canceled.person.id, 800, 80, false, false, 0],
      [blocked.person.id, 400, 40, false, true, null],
    ]);
    expect((await detailOf(manager, withBonus.person.id)).wallet.balanceJb).toBe(10_000 - 500 + 50);
    expect((await detailOf(manager, canceled.person.id)).wallet.balanceJb).toBe(10_000);
    expect((await detailOf(manager, blocked.person.id)).wallet.balanceJb).toBe(10_000 - 400);
  });

  it('o banco recusa comissão de unidade para outra pessoa e de indicação para si mesmo', async () => {
    const a = await createUser(app, 'aurora');
    const b = await createUser(app, 'aurora');
    const insert = (beneficiary: string, userId: string, unitCents: number, referralCents: number) =>
      asTenant(migratorPool, auroraId, async (c) => {
        const t = await c.query('SELECT id FROM fazendinha_bets LIMIT 1');
        return c.query(
          `INSERT INTO bet_commissions (tenant_id, user_id, bettor_id, fazendinha_bet_id, beneficiary, wagered_cents,
             referral_rate_bps, promoter_rate_bps, referral_cents, promoter_cents, unit_rate_bps, unit_cents)
           VALUES ($1, $2, $3, $4, $5, 100, 0, 0, $6, 0, 0, $7)`,
          [auroraId, userId, a.id, t.rows[0]?.id ?? null, beneficiary, referralCents, unitCents],
        );
      });
    const me = await unit();
    expect((await bet(me, 100)).status).toBe(201);
    await expect(insert('UNIT', b.id, 1, 0)).rejects.toMatchObject({ code: '23514' });
    await expect(insert('REFERRER', a.id, 0, 1)).rejects.toMatchObject({ code: '23514' });
    await expect(insert('UNIT', a.id, 0, 1)).rejects.toMatchObject({ code: '23514' });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Limite diário
// ---------------------------------------------------------------------------------------------------------------

describe('limite diário da unidade', () => {
  it('Loterias + Fazendinha do dia até o limite; acima recusa dizendo quanto ainda dá; cancelado libera', async () => {
    const manager = await loginOperator(app, 'aurora');
    const me = await unit();
    await settings(manager, me.person.id, { dailyLimitEnabled: true, dailyLimitCents: 1_500 });

    expect((await bet(me, 1000)).status).toBe(201);
    const over = await ticket(me, 600);
    expect(over.status).toBe(409);
    expect(over.body).toMatchObject({
      code: 'DAILY_LIMIT_EXCEEDED',
      details: [{ field: 'remainingCents', message: '500' }],
    });
    expect(over.body.message).toMatch(/^Limite diário de apostas atingido\. Hoje você ainda pode apostar R\$\s5,00\.$/);
    // Duas extrações de R$ 3 = R$ 6: também passa (o total da compra conta).
    const twoDraws = await ticket(me, 300, [
      { name: 'LT PT RIO 16HS', hour: 16 },
      { name: 'LT BAHIA 15HS', hour: 15 },
    ]);
    expect(twoDraws.body.code).toBe('DAILY_LIMIT_EXCEEDED');
    // Recusado não debita nada.
    expect((await detailOf(manager, me.person.id)).wallet.balanceJb).toBe(9_000);

    const exact = await ticket(me, 500);
    expect(exact.status).toBe(201);
    expect((await detailOf(manager, me.person.id)).todaySpentCents).toBe(1_500);
    const none = await bet(me, 100);
    expect(none.body).toMatchObject({
      code: 'DAILY_LIMIT_EXCEEDED',
      message: 'Limite diário de apostas atingido. Você não pode mais apostar hoje.',
    });

    // Pule cancelado não conta mais.
    const puleNumber = exact.body.tickets[0].puleNumber;
    expect((await me.http.post(`/v1/me/pules/${puleNumber}/cancel`, {})).status).toBe(200);
    expect((await detailOf(manager, me.person.id)).todaySpentCents).toBe(1_000);
    expect((await bet(me, 500)).status).toBe(201);

    // Repetir pule passa pela mesma conferência.
    const repeat = await me.http.post('/v1/lotteries/tickets/repeat', {
      idempotencyKey: randomUUID(),
      puleNumber,
      game: 'tradicional',
      drawDate: TOMORROW,
      draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
    });
    expect(repeat.body.code).toBe('DAILY_LIMIT_EXCEEDED');

    // Desligado: sem limite.
    await settings(manager, me.person.id, { dailyLimitEnabled: false });
    expect((await ticket(me, 2_000)).status).toBe(201);
  });

  it('o dia é o de Brasília: aposta de ontem às 23:59:59 não conta; de hoje à 00:00 conta', async () => {
    const manager = await loginOperator(app, 'aurora');
    const me = await unit();
    await settings(manager, me.person.id, { dailyLimitEnabled: true, dailyLimitCents: 1_000 });
    expect((await bet(me, 1000)).status).toBe(201);
    expect((await bet(me, 100)).body.code).toBe('DAILY_LIMIT_EXCEEDED');

    const today = drawDateOf(new Date().toISOString(), 0);
    const move = (at: string) =>
      asTenant(migratorPool, auroraId, (c) => c.query('UPDATE fazendinha_bets SET created_at = $1::timestamptz', [at]));
    const yesterday = drawDateOf(new Date().toISOString(), -1);
    await move(`${yesterday}T23:59:59.999-03:00`);
    expect((await detailOf(manager, me.person.id)).todaySpentCents).toBe(0);
    await move(`${today}T00:00:00.000-03:00`);
    expect((await detailOf(manager, me.person.id)).todaySpentCents).toBe(1_000);
    expect((await bet(me, 100)).body.code).toBe('DAILY_LIMIT_EXCEEDED');
    await move(`${yesterday}T23:59:59.999-03:00`);
    expect((await bet(me, 1000)).status).toBe(201);
  });

  it('apostas simultâneas da mesma unidade não passam juntas do limite', async () => {
    const manager = await loginOperator(app, 'aurora');
    const me = await unit();
    await settings(manager, me.person.id, { dailyLimitEnabled: true, dailyLimitCents: 1_000 });
    const results = await Promise.all([
      bet(me, 300),
      bet(me, 300),
      bet(me, 300),
      ticket(me, 300),
      ticket(me, 300),
      bet(me, 300),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 409, 409, 409]);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === 'DAILY_LIMIT_EXCEEDED')).toBe(true);
    expect((await detailOf(manager, me.person.id)).todaySpentCents).toBe(900);
    expect((await detailOf(manager, me.person.id)).wallet.balanceJb).toBe(9_100);
  });
});
