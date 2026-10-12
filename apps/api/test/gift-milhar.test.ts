import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminGiftMilharSettings,
  type AdminTicketDetail,
  type AdminUserDetail,
  type LoginResponse,
  type PlaceLotteryTicketsResponse,
  type PublicLotteryItem,
  GIFT_MILHAR_DEFAULTS,
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
beforeEach(resetUsers);

type Session = Awaited<ReturnType<typeof loginOperator>>;

const URL = '/v1/admin/quote-tables/gift-milhar';
const TODAY = drawDateOf(new Date().toISOString(), 0);
const TOMORROW = drawDateOf(new Date().toISOString(), 1);
const MILHAR_QUOTE = lotteryQuoteCents(findLotteryModality('milhar')!, defaultQuotes());
const GROUP_QUOTE = lotteryQuoteCents(findLotteryModality('grupo')!, defaultQuotes());
const RIO = { name: 'LT PT RIO 14HS', hour: 14 };

/** Banca com o brinde ligado: mínimo R$ 5,00, brinde R$ 0,10, 1º prêmio (a não ser que `extra` diga outra coisa). */
const enableBanca = async (manager: Session, extra: Partial<AdminGiftMilharSettings> = {}) => {
  const res = await manager.http.put(URL, {
    enabled: true,
    minPuleCents: 500,
    stakeCents: 10,
    placement: 'p1',
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
};

/** Unidade com R$ 100 de Saldo e sessão; `gift` liga o Milhar Brinde dela; `settings` vai junto ao painel. */
async function unit(manager: Session, gift = true, settings: Record<string, unknown> = {}) {
  const person = await createUser(app, 'aurora');
  await asTenant(migratorPool, auroraId, (c) =>
    c.query("SELECT wallet_manual_adjust($1, 10000, 0, 0, 'fundos de teste')", [person.id]),
  );
  const res = await manager.http.patch(`/v1/admin/users/${person.id}/settings`, {
    giftMilharEnabled: gift,
    ...settings,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return { person, http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }) };
}
type Unit = Awaited<ReturnType<typeof unit>>;

/** Grupo "cada" no 1/5: `count` palpites de `amountCents` (total = count × amount por extração). */
const groupItem = (amountCents: number, count = 1) => ({
  modality: 'grupo',
  placement: 'p1_5',
  guesses: Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0')),
  amountCents,
  split: 'each',
  quoteCents: GROUP_QUOTE,
});

const buy = (me: Unit, items: unknown[], draws = [RIO], idempotencyKey: string = randomUUID()) =>
  me.http.post('/v1/lotteries/tickets', { idempotencyKey, game: 'tradicional', drawDate: TOMORROW, draws, items });

const giftOf = (items: PublicLotteryItem[]) => items.filter((item) => item.isGift);
const detailOf = async (manager: Session, userId: string) =>
  (await manager.http.get(`/v1/admin/users/${userId}`)).body as AdminUserDetail;

// ---------------------------------------------------------------------------------------------------------------
// Configuração da banca
// ---------------------------------------------------------------------------------------------------------------

describe('configuração do Milhar Brinde (painel)', () => {
  it('padrão desligado; o Gerente grava com auditoria antes/depois; sem alteração não audita', async () => {
    const manager = await loginOperator(app, 'aurora');
    expect((await manager.http.get(URL)).body).toEqual(GIFT_MILHAR_DEFAULTS);

    const saved = await manager.http.put(URL, { enabled: true, minPuleCents: 2000, stakeCents: 25, placement: 'p1_5' });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ enabled: true, minPuleCents: 2000, stakeCents: 25, placement: 'p1_5' });
    expect((await manager.http.get(URL)).body).toEqual(saved.body);
    expect((await manager.http.put(URL, saved.body)).status).toBe(200);

    const audit = (await manager.http.get('/v1/admin/audit?action=gift.milhar.settings')).body.items;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      targetType: 'tenant',
      details: {
        fields: ['enabled', 'minPuleCents', 'stakeCents', 'placement'],
        changes: [
          { field: 'enabled', from: false, to: true },
          { field: 'minPuleCents', from: 1000, to: 2000 },
          { field: 'stakeCents', from: 10, to: 25 },
          { field: 'placement', from: 'p1', to: 'p1_5' },
        ],
      },
    });
    // Outra banca não vê.
    expect((await (await loginOperator(app, 'boreal')).http.get(URL)).body).toEqual(GIFT_MILHAR_DEFAULTS);
    // A comissão da banca (mesma linha de tenant_settings) continua gravável e não mexe no brinde.
    expect((await manager.http.put('/v1/admin/commissions/settings', { referralCommissionBps: 100 })).status).toBe(200);
    expect((await manager.http.get(URL)).body).toEqual(saved.body);
  });

  it('permissões: Financeiro só consulta (quotes.read); Suporte nada; jogador e anônimo nunca', async () => {
    const body = { enabled: true, minPuleCents: 500, stakeCents: 10, placement: 'p1' };
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.get(URL)).status).toBe(200);
    expect((await finance.http.put(URL, body)).status).toBe(403);
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get(URL)).status).toBe(403);
    expect((await support.http.put(URL, body)).status).toBe(403);
    const manager = await loginOperator(app, 'aurora');
    const me = await unit(manager);
    expect((await me.http.put(URL, body)).status).not.toBe(200);
    expect((await api(app, 'aurora').get(URL)).status).not.toBe(200);
    expect((await manager.http.get(URL)).body.enabled).toBe(false);
  });

  it('validação: valores inteiros nos limites, colocação dos dois jogos, sem campos extras; o banco confere de novo', async () => {
    const manager = await loginOperator(app, 'aurora');
    const ok = { enabled: true, minPuleCents: 500, stakeCents: 10, placement: 'p1' };
    for (const bad of [
      { ...ok, minPuleCents: 0 },
      { ...ok, minPuleCents: 10_000_001 },
      { ...ok, stakeCents: 0 },
      { ...ok, stakeCents: 10_001 },
      { ...ok, stakeCents: 1.5 },
      { ...ok, placement: 'p1_10' },
      { ...ok, placement: 'p7' },
      { ...ok, placement: 'x' },
      { ...ok, enabled: 'sim' },
      { ...ok, extra: 1 },
      { enabled: true },
    ]) {
      const res = await manager.http.put(URL, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect((await manager.http.put(URL, { ...ok, minPuleCents: 10_000_000, stakeCents: 10_000 })).status).toBe(200);
    expect((await manager.http.get('/v1/admin/audit?action=gift.milhar.settings')).body.items).toHaveLength(1);
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query("UPDATE tenant_settings SET gift_milhar_placement = 'p1_10' WHERE tenant_id = $1", [auroraId]),
      ),
    ).rejects.toThrow(/tenant_settings_gift_milhar/);
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query('UPDATE tenant_settings SET gift_milhar_stake_cents = 0 WHERE tenant_id = $1', [auroraId]),
      ),
    ).rejects.toThrow(/tenant_settings_gift_milhar/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Venda
// ---------------------------------------------------------------------------------------------------------------

describe('Milhar Brinde na venda', () => {
  it('só com banca e unidade ligadas e o pule no mínimo; um por pule, milhar de 4 dígitos, sem cobrar', async () => {
    const manager = await loginOperator(app, 'aurora');
    const me = await unit(manager);
    const without = await unit(manager, false);

    // Banca desligada: ninguém ganha.
    expect(giftOf((await buy(me, [groupItem(500)])).body.tickets[0].items)).toEqual([]);

    await enableBanca(manager);
    // Unidade sem o brinde e pule abaixo do mínimo: sem brinde.
    expect(giftOf((await buy(without, [groupItem(500)])).body.tickets[0].items)).toEqual([]);
    expect(giftOf((await buy(me, [groupItem(499)])).body.tickets[0].items)).toEqual([]);

    // No mínimo (2 × R$ 2,50 = R$ 5,00): o brinde vai depois das apostas.
    const res = await buy(me, [groupItem(250, 2)]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body as PlaceLotteryTicketsResponse;
    const [ticket] = body.tickets;
    expect(ticket!.items).toHaveLength(2);
    const gift = ticket!.items[1]!;
    expect(gift).toEqual({
      modality: 'milhar',
      modalityLabel: 'MILHAR BRINDE',
      placement: 'p1',
      placementLabel: '1 PRÊMIO',
      guesses: [expect.stringMatching(/^\d{4}$/)],
      amountCents: 10,
      split: 'total',
      totalCents: 0,
      quoteCents: MILHAR_QUOTE,
      possiblePrizeCents: (10 * MILHAR_QUOTE) / 100,
      isGift: true,
    });
    expect(ticket!.items[0]!.isGift).toBe(false);
    // Não cobrado: o total do pule e o débito são só das apostas.
    expect(ticket!.totalCents).toBe(500);
    expect(body.totalCents).toBe(500);
    expect(body.wallet.balanceJb).toBe(10_000 - 500 - 499 - 500);
    const rows = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `SELECT i.position, i.is_gift, i.total_cents::int AS total, i.amount_cents::int AS amount
           FROM lottery_ticket_items i JOIN lottery_tickets t ON t.id = i.ticket_id
          WHERE t.pule_number = $1 ORDER BY i.position`,
        [ticket!.puleNumber],
      ),
    );
    expect(rows.rows).toEqual([
      { position: 1, is_gift: false, total: 250 * 2, amount: 250 },
      { position: 2, is_gift: true, total: 0, amount: 10 },
    ]);
  });

  it('várias extrações: um brinde por pule (cada um com a sua milhar); o mínimo vale por pule', async () => {
    const manager = await loginOperator(app, 'aurora');
    await enableBanca(manager);
    const me = await unit(manager);
    const draws = [RIO, { name: 'LT PT RIO 16HS', hour: 16 }, { name: 'LT BAHIA 15HS', hour: 15 }];
    // R$ 5,00 por extração (R$ 15,00 na compra): cada pule chega ao mínimo.
    const res = await buy(me, [groupItem(500)], draws);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const gifts = (res.body as PlaceLotteryTicketsResponse).tickets.map((t) => giftOf(t.items));
    expect(gifts.map((g) => g.length)).toEqual([1, 1, 1]);
    expect(res.body.totalCents).toBe(1_500);
    // R$ 3,00 por extração (R$ 9,00 na compra): nenhum pule chega ao mínimo de R$ 5,00.
    const small = await buy(me, [groupItem(300)], draws);
    expect((small.body as PlaceLotteryTicketsResponse).tickets.flatMap((t) => giftOf(t.items))).toEqual([]);
  });

  it('sem comissão, sem limite diário e fora das vendas (bilhetes e vendas por extração)', async () => {
    const manager = await loginOperator(app, 'aurora');
    await enableBanca(manager);
    const me = await unit(manager, true, {
      unitCommissionBps: 1000,
      dailyLimitEnabled: true,
      dailyLimitCents: 500,
    });
    const res = await buy(me, [groupItem(500)]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(giftOf(res.body.tickets[0].items)).toHaveLength(1);
    // Comissão só sobre o que foi pago (R$ 5,00 × 10%).
    const commissions = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT wagered_cents::int AS wagered, unit_cents::int AS unit FROM bet_commissions'),
    );
    expect(commissions.rows).toEqual([{ wagered: 500, unit: 50 }]);
    // O limite (R$ 5,00) foi usado só pelas apostas; o brinde não conta.
    expect((await detailOf(manager, me.person.id)).todaySpentCents).toBe(500);
    // Bilhetes do dia e vendas por extração: só o valor pago.
    const tickets = await manager.http.get(`/v1/admin/tickets?date=${TODAY}`);
    expect(tickets.body).toMatchObject({ totalCents: 500, items: [{ totalCents: 500 }] });
    const sales = await manager.http.get(`/v1/admin/reports/sales-by-draw?from=${TOMORROW}&to=${TOMORROW}`);
    expect(sales.status, JSON.stringify(sales.body)).toBe(200);
    expect(sales.body.totals).toMatchObject({ lotteriesCents: 500, salesCents: 500 });
  });

  it('Fazendinha não tem brinde; cotação da milhar desligada na tabela do comprador também não', async () => {
    const manager = await loginOperator(app, 'aurora');
    await enableBanca(manager, { minPuleCents: 1 });
    const me = await unit(manager);
    const bet = await me.http.post('/v1/fazendinha/bets', {
      idempotencyKey: randomUUID(),
      drawDate: TOMORROW,
      lottery: 'LT BAHIA 10HS',
      hour: 10,
      mode: 'centena',
      stakeCents: 100,
      prizeCents: 88_000,
      numbers: [1, 2, 3, 4, 5, 6],
    });
    expect(bet.status, JSON.stringify(bet.body)).toBe(201);
    const items = await asTenant(migratorPool, auroraId, (c) => c.query('SELECT 1 FROM lottery_ticket_items'));
    expect(items.rowCount).toBe(0);

    const table = await defaultQuoteTableId(auroraId);
    const off = await manager.http.put(`/v1/admin/quote-tables/${table}/tradicional`, {
      quotes: [{ modality: 'milhar', prizeCents: 0 }],
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    const res = await buy(me, [groupItem(500)]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(giftOf(res.body.tickets[0].items)).toEqual([]);
  });

  it('pule de 20 apostas: o brinde é o 21º item; mesma chave devolve os mesmos pules (com o brinde)', async () => {
    const manager = await loginOperator(app, 'aurora');
    await enableBanca(manager);
    const me = await unit(manager);
    const items = Array.from({ length: 20 }, (_, i) => ({
      ...groupItem(25),
      guesses: [String(i + 1).padStart(2, '0')],
    }));
    const key = randomUUID();
    const res = await buy(me, items, [RIO], key);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.tickets[0].items).toHaveLength(21);
    expect(res.body.tickets[0].items[20].isGift).toBe(true);
    const again = await buy(me, items, [RIO], key);
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.tickets).toEqual(res.body.tickets);
    expect(again.body.wallet.balanceJb).toBe(10_000 - 500);
  });

  it('o banco recusa brinde fora da regra (banca desligada, valor ou colocação diferentes, dois no pule)', async () => {
    const manager = await loginOperator(app, 'aurora');
    const me = await unit(manager);
    const pule = (await buy(me, [groupItem(500)])).body.tickets[0].puleNumber;
    const insert = (amount: number, placement = 'p1', position = 2) =>
      asTenant(migratorPool, auroraId, async (c) => {
        const t = await c.query('SELECT id FROM lottery_tickets WHERE pule_number = $1', [pule]);
        return c.query(
          `INSERT INTO lottery_ticket_items (tenant_id, ticket_id, position, modality, placement, guesses, amount_cents,
             split, total_cents, quote_cents, possible_prize_cents, is_gift)
           VALUES ($1, $2, $3, 'milhar', $4, ARRAY['1234'], $5, 'total', 0, 800000, 0, true)`,
          [auroraId, t.rows[0].id, position, placement, amount],
        );
      });
    await expect(insert(10)).rejects.toThrow(/gift milhar not allowed/);
    await enableBanca(manager);
    await expect(insert(11)).rejects.toThrow(/gift milhar not allowed/);
    await expect(insert(10, 'p2')).rejects.toThrow(/gift milhar not allowed/);
    // Formato: só milhar de 4 dígitos, sem total.
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query("UPDATE lottery_ticket_items SET is_gift = true WHERE modality = 'grupo'"),
      ),
    ).rejects.toThrow(/lottery_ticket_items_(amounts|gift_shape)/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Apuração, cancelamento e repetir pule
// ---------------------------------------------------------------------------------------------------------------

describe('Milhar Brinde na apuração, no cancelamento e no repetir pule', () => {
  it('apuração paga o brinde como milhar comum na bolsa de prêmios (reter prêmios vale); painel e app marcam', async () => {
    const manager = await loginOperator(app, 'aurora');
    await enableBanca(manager);
    const me = await unit(manager, true, { retainPrizes: true });
    const res = await buy(me, [groupItem(500)]);
    const ticket = (res.body as PlaceLotteryTicketsResponse).tickets[0]!;
    const [gift] = giftOf(ticket.items);
    // Cabeça = a milhar do brinde (o grupo apostado pode ganhar junto: o total vem da pule premiada).
    const head = gift!.guesses[0]!;
    const before = (await detailOf(manager, me.person.id)).wallet;
    await settleAll(app, 'aurora', [head, '1111', '2222', '3333', '4444']);

    const prizes = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT prize_cents::int AS prize, items FROM pule_prizes WHERE pule_number = $1', [ticket.puleNumber]),
    );
    const giftPrize = (10 * MILHAR_QUOTE) / 100;
    const paidItems = prizes.rows[0].items as Array<{ position: number; prizeCents: number }>;
    expect(paidItems).toContainEqual({ position: 2, guesses: [head], prizeCents: giftPrize });
    const total = prizes.rows[0].prize as number;
    const after = (await detailOf(manager, me.person.id)).wallet;
    expect(after.prizesJb - before.prizesJb).toBe(total);
    expect(after.balanceJb).toBe(before.balanceJb);
    // Reter prêmios: o prêmio do brinde fica na bolsa de loterias, que não é sacável enquanto ligado.
    expect(after.prizesJb).toBeGreaterThanOrEqual(giftPrize);
    expect((await me.http.get('/v1/me')).body.wallet).toMatchObject({ prizesJb: after.prizesJb, withdrawable: 0 });

    // Painel: detalhe do bilhete e premiadas marcam o brinde com o valor do brinde.
    const detail = (await manager.http.get(`/v1/admin/tickets/lotteries/${ticket.puleNumber}`))
      .body as AdminTicketDetail;
    expect(detail.totalCents).toBe(500);
    expect(detail.items[1]).toMatchObject({
      isGift: true,
      modalityLabel: 'MILHAR BRINDE',
      stakeCents: 10,
      prizeCents: giftPrize,
      status: 'WON',
    });
    expect(detail.items[0]!.isGift).toBe(false);
    const yesterday = drawDateOf(new Date().toISOString(), -1);
    const list = await manager.http.get(`/v1/admin/prizes?from=${yesterday}&to=${yesterday}`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.items).toContainEqual(
      expect.objectContaining({ isGift: true, modalityLabel: 'MILHAR BRINDE', stakeCents: 10, prizeCents: giftPrize }),
    );
    // App: premiadas e consulta da pule.
    const mine = await me.http.get(`/v1/me/prizes?date=${yesterday}`);
    expect(mine.body.tickets[0].items).toContainEqual(
      expect.objectContaining({ label: 'MILHAR BRINDE 1 PRÊMIO', amountCents: 10, prizeCents: giftPrize }),
    );
    const pule = await me.http.get(`/v1/me/pules/${ticket.puleNumber}`);
    expect(pule.status, JSON.stringify(pule.body)).toBe(200);
    expect(JSON.stringify(pule.body)).toContain('"isGift":true');
  });

  it('cancelar o pule cancela o brinde: devolve só o pago e a apuração não paga nada', async () => {
    const manager = await loginOperator(app, 'aurora');
    await enableBanca(manager);
    const me = await unit(manager);
    const ticket = (await buy(me, [groupItem(500)])).body.tickets[0];
    const head = giftOf(ticket.items)[0]!.guesses[0]!;
    const canceled = await me.http.post(`/v1/me/pules/${ticket.puleNumber}/cancel`, {});
    expect(canceled.status, JSON.stringify(canceled.body)).toBe(200);
    expect((await detailOf(manager, me.person.id)).wallet.balanceJb).toBe(10_000);
    await settleAll(app, 'aurora', [head, '1111', '2222', '3333', '4444']);
    const prizes = await asTenant(migratorPool, auroraId, (c) => c.query('SELECT 1 FROM pule_prizes'));
    expect(prizes.rowCount).toBe(0);
    expect((await detailOf(manager, me.person.id)).wallet).toMatchObject({ balanceJb: 10_000, prizesJb: 0 });
  });

  it('repetir pule: só as apostas pagas voltam; o brinde é sorteado de novo se ainda tiver direito', async () => {
    const manager = await loginOperator(app, 'aurora');
    await enableBanca(manager);
    const me = await unit(manager);
    const original = (await buy(me, [groupItem(500)])).body.tickets[0];
    const repeat = (key: string) =>
      me.http.post('/v1/lotteries/tickets/repeat', {
        idempotencyKey: key,
        puleNumber: original.puleNumber,
        game: 'tradicional',
        drawDate: TOMORROW,
        draws: [{ name: 'LT PT RIO 16HS', hour: 16 }],
      });
    const key = randomUUID();
    const res = await repeat(key);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const items = res.body.tickets[0].items as PublicLotteryItem[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ modality: 'grupo', guesses: ['01'], isGift: false });
    expect(items[1]).toMatchObject({ modality: 'milhar', isGift: true, amountCents: 10, totalCents: 0 });
    expect(res.body.totalCents).toBe(500);
    // Mesma chave: os mesmos pules, sem cobrar de novo.
    const again = await repeat(key);
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.tickets).toEqual(res.body.tickets);
    expect(again.body.wallet.balanceJb).toBe(10_000 - 1_000);

    // Unidade sem o brinde agora: a repetição sai só com as apostas.
    await manager.http.patch(`/v1/admin/users/${me.person.id}/settings`, { giftMilharEnabled: false });
    const plain = await repeat(randomUUID());
    expect(plain.status, JSON.stringify(plain.body)).toBe(201);
    expect(plain.body.tickets[0].items.map((i: PublicLotteryItem) => i.isGift)).toEqual([false]);
  });
});
