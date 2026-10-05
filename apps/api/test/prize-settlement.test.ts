import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminPlayerStatement,
  type AdminPrizeList,
  type BalanceReport,
  type FazendinhaModeId,
  type LoginResponse,
  type PlaceLotteryTicketsResponse,
  type PrizesReport,
  type PublicUser,
  type PushPayload,
  defaultQuotes,
  drawDateOf,
  fazendinhaPrizeFrom,
  findLotteryModality,
  lotteryQuoteCents,
} from '@sysjb/contracts';
import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrizeSettlementService } from '../src/prizes/prize-settlement.service.js';
import { PushService } from '../src/push/push.service.js';
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

type Slug = 'aurora' | 'boreal';

let app: INestApplication;
let pushApp: INestApplication;
const ids: Record<Slug, string> = { aurora: '', boreal: '' };

const VAPID = webpush.generateVAPIDKeys();
let sent: Array<{ endpoint: string; payload: PushPayload }> = [];

beforeAll(async () => {
  app = await startApp();
  pushApp = await startApp({
    push: { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: 'mailto:suporte@exemplo.com' },
  });
  pushApp.get(PushService).sender = async (subscription, body) => {
    sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(body) as PushPayload });
  };
  ids.aurora = await tenantId('aurora');
  ids.boreal = await tenantId('boreal');
});
afterAll(async () => {
  await Promise.all([app.close(), pushApp.close()]);
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(async () => {
  await resetUsers();
  sent = [];
});

const NOW = new Date().toISOString();
const day = (offset: number) => drawDateOf(NOW, offset);
const TODAY = day(0);
const YESTERDAY = day(-1);
const TOMORROW = day(1);
/** Ligado ao resultado rj 09 no cadastro padrão. */
const RIO_09 = { name: 'LT PT RIO 09HS', hour: 9 };
/** Sem resultado ligado no cadastro padrão. */
const CAPITAL_10 = { name: 'LT CAPITAL 10HS', hour: 10 };

/** Rodada de apuração com o relógio `minutes` minutos à frente (a carência dos testes é de 30 minutos). */
const sweep = (minutes = 31, target = app) =>
  target.get(PrizeSettlementService).sweep(new Date(Date.now() + minutes * 60_000));

async function player(tenant: Slug = 'aurora', target = app) {
  const person = await createUser(target, tenant);
  await asTenant(migratorPool, ids[tenant], (c) =>
    c.query("SELECT wallet_manual_adjust($1, 100000, 0, 0, 'fundos de teste')", [person.id]),
  );
  const login = await api(target, tenant).post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  const token = (login.body as LoginResponse).token;
  return { person, tenant, http: api(target, tenant, KEYS[tenant], { 'X-Session-Token': token }) };
}
type Player = Awaited<ReturnType<typeof player>>;

const lotteryItem = (modality: string, placement: string, guesses: string[], amountCents = 100) => ({
  modality,
  placement,
  guesses,
  amountCents,
  split: 'total' as const,
  quoteCents: lotteryQuoteCents(findLotteryModality(modality)!, defaultQuotes()),
});

/** Compra um pule de Loterias para amanhã; devolve o número. */
async function buyLottery(p: Player, items: Array<ReturnType<typeof lotteryItem>>, draw = RIO_09): Promise<number> {
  const res = await p.http.post('/v1/lotteries/tickets', {
    idempotencyKey: randomUUID(),
    game: 'tradicional',
    drawDate: TOMORROW,
    draws: [draw],
    items,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as PlaceLotteryTicketsResponse).tickets[0]!.puleNumber;
}

/** Compra palpites da Fazendinha para amanhã; devolve o número do pule. */
async function buyFazendinha(p: Player, mode: FazendinhaModeId, numbers: number[], draw = RIO_09): Promise<number> {
  const res = await p.http.post('/v1/fazendinha/bets', {
    idempotencyKey: randomUUID(),
    drawDate: TOMORROW,
    lottery: draw.name,
    hour: draw.hour,
    mode,
    stakeCents: 100,
    prizeCents: fazendinhaPrizeFrom(defaultQuotes(), mode, 100),
    numbers,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { bet: { puleNumber: number } }).bet.puleNumber;
}

/** Leva pules (vendidos para amanhã) para outra data, como se a extração já tivesse corrido (só a dona pode). */
async function moveTo(tenant: Slug, date: string, pules: { lotteries?: number[]; fazendinha?: number[] }) {
  await asTenant(migratorPool, ids[tenant], async (c) => {
    await c.query(
      `UPDATE lottery_tickets SET draw_date = $2::date,
         closes_at = ($2::date + time '09:00') AT TIME ZONE 'America/Sao_Paulo'
       WHERE pule_number = ANY($1::int[])`,
      [pules.lotteries ?? [], date],
    );
    await c.query('UPDATE fazendinha_bets SET draw_date = $2::date WHERE pule_number = ANY($1::int[])', [
      pules.fazendinha ?? [],
      date,
    ]);
  });
}

/** Grava (ou corrige) um resultado do provedor; devolve o id e a revisão. */
async function result(
  date: string,
  prizes: string[],
  { lottery = 'rj', extraction = 9, sum = null as string | null } = {},
): Promise<{ id: string; revision: number }> {
  const { rows } = await migratorPool.query<{ id: string; revision: number }>(
    `INSERT INTO lottery_results (draw_date, lottery, extraction, prizes, sum_value, source)
     VALUES ($1, $2, $3, $4, $5, 'WEBHOOK')
     ON CONFLICT (draw_date, lottery, extraction)
       DO UPDATE SET prizes = EXCLUDED.prizes, sum_value = EXCLUDED.sum_value
     RETURNING id, revision`,
    [date, lottery, extraction, prizes, sum],
  );
  return rows[0]!;
}

const FIVE = (head: string) => [head, '1111', '2222', '3333', '4444'];

const query = <T extends object>(tenant: Slug, sql: string, params: unknown[] = []) =>
  asTenant(migratorPool, ids[tenant], (c) => c.query<T>(sql, params)).then((r) => r.rows);
/** Uma linha (a consulta tem de achar). */
const queryOne = async <T extends object>(tenant: Slug, sql: string, params: unknown[] = []) => {
  const [row] = await query<T>(tenant, sql, params);
  if (!row) throw new Error(`nenhuma linha: ${sql}`);
  return row;
};

const walletOf = async (p: Player) => ((await p.http.get('/v1/me')).body as PublicUser).wallet;

describe('apuração: pagamento depois da carência', () => {
  it('paga o premiado na bolsa de prêmios, uma vez só; o não premiado fica apurado sem prêmio', async () => {
    const p = await player();
    // Item 1 ganha (milhar na cabeça); item 2 não (grupo 01 não sai). Outro pule não ganha nada.
    const winner = await buyLottery(p, [
      lotteryItem('milhar', 'p1', ['3452']),
      lotteryItem('grupo', 'p1_5', ['01'], 500),
    ]);
    const loser = await buyLottery(p, [lotteryItem('milhar', 'p1', ['7777'])]);
    await moveTo('aurora', YESTERDAY, { lotteries: [winner, loser] });
    await result(YESTERDAY, FIVE('3452'));
    const before = await walletOf(p);

    // Dentro da carência: nada é pago.
    expect(await sweep(29)).toMatchObject({ settled: 0, awarded: 0 });
    expect((await walletOf(p)).prizesJb).toBe(before.prizesJb);

    expect(await sweep(31)).toMatchObject({ settled: 2, awarded: 1, prizeCents: 800_000 });
    const after = await walletOf(p);
    expect(after.prizesJb).toBe(before.prizesJb + 800_000);
    expect(after.balanceJb).toBe(before.balanceJb);

    expect(
      await query(
        'aurora',
        'SELECT pule_number, prize_cents::int AS prize, settled_revision FROM pule_settlements ORDER BY pule_number',
      ),
    ).toEqual([
      { pule_number: winner, prize: 800_000, settled_revision: 1 },
      { pule_number: loser, prize: 0, settled_revision: 1 },
    ]);
    expect(await query('aurora', 'SELECT pule_number, prize_cents::int AS prize, items FROM pule_prizes')).toEqual([
      { pule_number: winner, prize: 800_000, items: [{ position: 1, guesses: ['3452'], prizeCents: 800_000 }] },
    ]);
    expect(
      await query('aurora', "SELECT prizes_jb_delta::int AS prizes FROM wallet_entries WHERE kind = 'PRIZE'"),
    ).toEqual([{ prizes: 800_000 }]);

    // Outra rodada (ou outra instância) não paga de novo.
    expect(await sweep(31)).toMatchObject({ settled: 0 });
    const { id: ticketId } = await queryOne<{ id: string }>(
      'aurora',
      'SELECT id FROM lottery_tickets WHERE pule_number = $1',
      [winner],
    );
    const { result_id: resultId } = await queryOne<{ result_id: string }>(
      'aurora',
      'SELECT result_id FROM pule_settlements LIMIT 1',
    );
    const again = await asTenant(runtimePool, ids.aurora, (c) =>
      c.query('SELECT lottery_settle($1, $2, 1, 800000, $3::jsonb) AS settled', [
        ticketId,
        resultId,
        JSON.stringify([{ position: 1, guesses: ['3452'], prizeCents: 800_000 }]),
      ]),
    );
    expect(again.rows).toEqual([{ settled: false }]);
    expect((await walletOf(p)).prizesJb).toBe(before.prizesJb + 800_000);
  });

  it('rodadas simultâneas pagam uma vez', async () => {
    const p = await player();
    const pule = await buyLottery(p, [lotteryItem('dezena', 'p1', ['52'])]);
    await moveTo('aurora', YESTERDAY, { lotteries: [pule] });
    await result(YESTERDAY, FIVE('3452'));
    const other = await startApp();
    try {
      const summaries = await Promise.all([sweep(31), sweep(31, other)]);
      expect(summaries.reduce((sum, s) => sum + s.settled, 0)).toBe(1);
    } finally {
      await other.close();
    }
    expect(await query('aurora', "SELECT count(*)::int AS n FROM wallet_entries WHERE kind = 'PRIZE'")).toEqual([
      { n: 1 },
    ]);
    expect((await walletOf(p)).prizesJb).toBe(8_000);
  });

  it('Fazendinha: vale só a cabeça, pelo prêmio gravado na compra', async () => {
    const p = await player();
    // 3452: grupo 13, dezena 52, centena 452.
    const grupo = await buyFazendinha(p, 'grupo', [13, 14]);
    const dezena = await buyFazendinha(p, 'dezena', [11]);
    await moveTo('aurora', YESTERDAY, { fazendinha: [grupo, dezena] });
    await result(YESTERDAY, FIVE('3452'));

    expect(await sweep(31)).toMatchObject({ settled: 2, awarded: 1, prizeCents: 2_200 });
    const report = (await p.http.get(`/v1/me/prizes?date=${YESTERDAY}`)).body as PrizesReport;
    expect(report.tickets).toEqual([
      {
        puleNumber: grupo,
        lottery: RIO_09.name,
        hour: 9,
        items: [{ label: 'FZG1 1/1', amountCents: 100, prizeCents: 2_200, guesses: ['13'] }],
        prizeCents: 2_200,
      },
    ]);
  });

  it('MILHAR E CENTENA grava a cotação da centena e paga só a centena pela metade dela', async () => {
    const p = await player();
    const pule = await buyLottery(p, [lotteryItem('milhar_centena', 'p1', ['9452'], 200)]);
    expect(await query('aurora', 'SELECT quote_cents, centena_quote_cents FROM lottery_ticket_items')).toEqual([
      { quote_cents: 880_000, centena_quote_cents: 80_000 },
    ]);
    await moveTo('aurora', YESTERDAY, { lotteries: [pule] });
    await result(YESTERDAY, FIVE('3452'));
    // R$ 2,00: R$ 1,00 na centena (cotação 800) = R$ 800,00.
    expect(await sweep(31)).toMatchObject({ prizeCents: 80_000 });
  });

  it('pule cancelado não é apurado', async () => {
    const p = await player();
    const canceled = await buyLottery(p, [lotteryItem('milhar', 'p1', ['3452'])]);
    expect((await p.http.post(`/v1/me/pules/${canceled}/cancel`, {})).status).toBe(200);
    // Resultado de amanhã já gravado (só para o teste): a rodada de amanhã não paga o cancelado.
    const { id } = await result(TOMORROW, FIVE('3452'));
    expect(await sweep(24 * 60 + 31)).toMatchObject({ settled: 0 });
    const { id: ticketId } = await queryOne<{ id: string }>('aurora', 'SELECT id FROM lottery_tickets');
    await expect(
      asTenant(runtimePool, ids.aurora, (c) => c.query('SELECT lottery_settle($1, $2, 1, 0, NULL)', [ticketId, id])),
    ).rejects.toMatchObject({ code: 'SJ008' });
  });
});

describe('o que o jogador e o painel veem', () => {
  it('Consultar premiadas, Reclame, Consultar saldo, extrato e Prêmios no painel', async () => {
    const p = await player();
    const other = await player();
    const pule = await buyLottery(p, [
      lotteryItem('milhar', 'p1', ['3452']),
      lotteryItem('centena', 'p1_5', ['111'], 500),
    ]);
    const lost = await buyLottery(p, [lotteryItem('milhar', 'p1', ['7777'])]);
    await moveTo('aurora', YESTERDAY, { lotteries: [pule, lost] });
    await result(YESTERDAY, FIVE('3452'));
    await sweep(31);

    // Centena 111 sai no 2º prêmio (1111): R$ 5,00 × 800 ÷ 5.
    const report = (await p.http.get(`/v1/me/prizes?date=${YESTERDAY}`)).body as PrizesReport;
    expect(report).toEqual({
      date: YESTERDAY,
      tickets: [
        {
          puleNumber: pule,
          lottery: RIO_09.name,
          hour: 9,
          items: [
            { label: 'MILHAR 1 PRÊMIO', amountCents: 100, prizeCents: 800_000, guesses: ['3452'] },
            { label: 'CENTENA 1/5 PRÊMIO', amountCents: 500, prizeCents: 80_000, guesses: ['111'] },
          ],
          prizeCents: 880_000,
        },
      ],
      totalPrizeCents: 880_000,
    });
    // Outro jogador não vê as premiadas nem o prêmio de quem ganhou.
    expect(((await other.http.get(`/v1/me/prizes?date=${YESTERDAY}`)).body as PrizesReport).tickets).toEqual([]);

    expect((await p.http.get(`/v1/me/prizes/claim?pule=${pule}`)).body).toEqual({ status: 'paid', paidOn: TODAY });
    for (const [who, code] of [
      [p, lost],
      [other, pule],
      [p, 999_999_999_999],
    ] as const) {
      expect((await who.http.get(`/v1/me/prizes/claim?pule=${code}`)).body).toEqual({ status: 'not_found' });
    }

    const balance = (await p.http.get(`/v1/me/reports/balance?date=${TODAY}`)).body as BalanceReport;
    expect(balance.prizes).toEqual([{ puleNumber: pule, amountCents: 880_000 }]);
    const wallet = await walletOf(p);
    expect(balance.balanceCents).toBe(wallet.balanceJb + wallet.prizesJb + wallet.bonusJb);

    const session = await loginOperator(app, 'aurora');
    const statement = (await session.http.get(`/v1/admin/users/${p.person.id}/statement?from=${TODAY}&to=${TODAY}`))
      .body as AdminPlayerStatement;
    expect(statement.items[0]).toMatchObject({ kind: 'PRIZE', puleNumber: pule, prizesCents: 880_000 });

    const prizes = (await session.http.get(`/v1/admin/prizes?from=${YESTERDAY}&to=${YESTERDAY}`))
      .body as AdminPrizeList;
    expect(prizes).toMatchObject({ total: 1, totalPrizeCents: 880_000, reviews: [], reviewsTotal: 0, pendingCount: 0 });
    expect(prizes.items[0]).toMatchObject({ game: 'lotteries', puleNumber: pule, prizeCents: 880_000 });
  });

  it('avisa "Pule premiada" no app instalado de quem ganhou', async () => {
    const p = await player('aurora', pushApp);
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    const subscribed = await p.http.post('/v1/me/push-subscriptions', {
      endpoint,
      keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
    });
    expect(subscribed.status).toBe(204);
    const pule = await buyLottery(p, [lotteryItem('grupo', 'p1', ['13'])]);
    await moveTo('aurora', YESTERDAY, { lotteries: [pule] });
    await result(YESTERDAY, FIVE('3452'));

    await sweep(31, pushApp);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({
      title: 'Pule premiada!',
      url: `/premiadas/consultar/${YESTERDAY}`,
    });
    expect(sent[0]!.payload.body).toContain(`Pule #${pule}`);
  });
});

describe('correções do resultado', () => {
  it('dentro da carência: paga pelo resultado corrigido; depois do pagamento: não mexe no pago e vira aviso', async () => {
    const p = await player();
    const a = await buyLottery(p, [lotteryItem('milhar', 'p1', ['3452'])]);
    const b = await buyLottery(p, [lotteryItem('milhar', 'p1', ['7777'])]);
    await moveTo('aurora', YESTERDAY, { lotteries: [a, b] });
    await result(YESTERDAY, FIVE('3452'));
    // Correção antes de a carência passar: a revisão 2 é a que vale.
    await result(YESTERDAY, FIVE('7777'));
    const before = await walletOf(p);

    expect(await sweep(31)).toMatchObject({ settled: 2, awarded: 1, prizeCents: 800_000 });
    expect(
      await query(
        'aurora',
        'SELECT pule_number, prize_cents::int AS prize, settled_revision FROM pule_settlements ORDER BY pule_number',
      ),
    ).toEqual([
      { pule_number: a, prize: 0, settled_revision: 2 },
      { pule_number: b, prize: 800_000, settled_revision: 2 },
    ]);

    // Correção depois do pagamento: o pago não muda.
    await result(YESTERDAY, FIVE('3452'));
    expect(await sweep(31)).toMatchObject({ settled: 0, checked: 2, reviews: 2 });
    expect((await walletOf(p)).prizesJb).toBe(before.prizesJb + 800_000);
    expect(await sweep(31)).toMatchObject({ checked: 0 });

    const session = await loginOperator(app, 'aurora');
    const list = (await session.http.get(`/v1/admin/prizes?from=${YESTERDAY}&to=${YESTERDAY}`)).body as AdminPrizeList;
    expect(list.reviewsTotal).toBe(2);
    expect(list.reviews.map((r) => [r.puleNumber, r.paidCents, r.correctedCents]).sort()).toEqual(
      [
        [a, 0, 800_000],
        [b, 800_000, 0],
      ].sort(),
    );
    expect(list.reviews[0]).toMatchObject({ lottery: RIO_09.name, player: { id: p.person.id } });

    // Nova correção que volta ao que foi pago: sem aviso.
    await result(YESTERDAY, FIVE('7777'));
    expect(await sweep(31)).toMatchObject({ checked: 2, reviews: 0 });
    const cleared = (await session.http.get(`/v1/admin/prizes?from=${YESTERDAY}&to=${YESTERDAY}`))
      .body as AdminPrizeList;
    expect(cleared.reviewsTotal).toBe(0);
  });
});

describe('rodadas', () => {
  it('a rodada rápida só olha resultados das últimas horas; a completa pega o que ficou para trás', async () => {
    const p = await player();
    const pule = await buyLottery(p, [lotteryItem('milhar', 'p1', ['3452'])]);
    await moveTo('aurora', YESTERDAY, { lotteries: [pule] });
    await result(YESTERDAY, FIVE('3452'));
    const settlement = app.get(PrizeSettlementService);
    // 7 horas depois de o resultado chegar (ex.: API fora do ar esse tempo).
    const later = new Date(Date.now() + 7 * 60 * 60_000);
    expect(await settlement.sweep(later, { full: false })).toMatchObject({ settled: 0 });
    expect(await settlement.sweep(later, { full: true })).toMatchObject({ settled: 1, prizeCents: 800_000 });
  });
});

describe('pendentes', () => {
  it('aposta no 6º prêmio espera a soma; sorteio sem resultado ligado nunca é apurado', async () => {
    const p = await player();
    // 6º = soma dos 5 primeiros: 1000 + 2000 + 3000 + 4000 + 5000 = 15000 -> 5000.
    const sixth = await buyLottery(p, [lotteryItem('milhar', 'p6', ['5000'])]);
    const unlinked = await buyLottery(p, [lotteryItem('milhar', 'p1', ['1000'])], CAPITAL_10);
    await moveTo('aurora', YESTERDAY, { lotteries: [sixth, unlinked] });
    const prizes = ['1000', '2000', '3000', '4000', '5000'];
    await result(YESTERDAY, prizes);

    expect(await sweep(31)).toMatchObject({ settled: 0, waiting: 1 });
    const session = await loginOperator(app, 'aurora');
    const pending = (await session.http.get(`/v1/admin/prizes?from=${YESTERDAY}&to=${YESTERDAY}`))
      .body as AdminPrizeList;
    expect(pending.pendingCount).toBe(2);

    // O provedor completa o resultado (nova revisão): a carência recomeça e então o pule é apurado.
    await result(YESTERDAY, prizes, { sum: '15000' });
    expect(await sweep(31)).toMatchObject({ settled: 1, prizeCents: 800_000 });
    const after = (await session.http.get(`/v1/admin/prizes?from=${YESTERDAY}&to=${YESTERDAY}`)).body as AdminPrizeList;
    expect(after.pendingCount).toBe(1);
  });

  it('cada banca apura pelo resultado ligado ao SEU sorteio', async () => {
    const aurora = await player('aurora');
    const boreal = await player('boreal');
    const a = await buyLottery(aurora, [lotteryItem('milhar', 'p1', ['3452'])]);
    const b = await buyLottery(boreal, [lotteryItem('milhar', 'p1', ['3452'])]);
    await moveTo('aurora', YESTERDAY, { lotteries: [a] });
    await moveTo('boreal', YESTERDAY, { lotteries: [b] });
    // Na Boreal, o mesmo sorteio usa o resultado das 11h do provedor.
    await asTenant(migratorPool, ids.boreal, (c) =>
      c.query('UPDATE draws SET result_extraction = 11 WHERE name = $1', [RIO_09.name]),
    );
    await result(YESTERDAY, FIVE('3452'));
    await result(YESTERDAY, FIVE('9999'), { extraction: 11 });

    expect(await sweep(31)).toMatchObject({ settled: 2, awarded: 1 });
    expect((await walletOf(aurora)).prizesJb).toBe(800_000);
    expect((await walletOf(boreal)).prizesJb).toBe(0);
    expect(await query('boreal', 'SELECT pule_number, prize_cents::int AS prize FROM pule_settlements')).toEqual([
      { pule_number: b, prize: 0 },
    ]);
    // A banca de um operador não enxerga a apuração da outra.
    expect(await query('aurora', 'SELECT pule_number FROM pule_settlements')).toEqual([{ pule_number: a }]);
  });
});

describe('o banco confere tudo de novo', () => {
  it('venda recusada depois de o resultado do sorteio chegar', async () => {
    const p = await player();
    await result(TOMORROW, FIVE('3452'));
    const res = await p.http.post('/v1/lotteries/tickets', {
      idempotencyKey: randomUUID(),
      game: 'tradicional',
      drawDate: TOMORROW,
      draws: [RIO_09],
      items: [lotteryItem('milhar', 'p1', ['3452'])],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DRAW_CLOSED');
    const bet = await p.http.post('/v1/fazendinha/bets', {
      idempotencyKey: randomUUID(),
      drawDate: TOMORROW,
      lottery: RIO_09.name,
      hour: 9,
      mode: 'grupo',
      stakeCents: 100,
      prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
      numbers: [13],
    });
    expect(bet.status).toBe(409);
  });

  it('recusa prêmio fora dos limites do pule, resultado de outro sorteio, revisão velha e pule vendido depois', async () => {
    const p = await player();
    const pule = await buyLottery(p, [lotteryItem('milhar', 'p1', ['3452'])]);
    const fz = await buyFazendinha(p, 'grupo', [13]);
    await moveTo('aurora', YESTERDAY, { lotteries: [pule], fazendinha: [fz] });
    const rio9 = await result(YESTERDAY, FIVE('3452'));
    const rio11 = await result(YESTERDAY, FIVE('3452'), { extraction: 11 });
    const { id: ticketId } = await queryOne<{ id: string }>('aurora', 'SELECT id FROM lottery_tickets');
    const { id: betId } = await queryOne<{ id: string }>('aurora', 'SELECT id FROM fazendinha_bets');
    const settle = (prize: number, items: unknown, resultId = rio9.id, revision = 1) =>
      asTenant(runtimePool, ids.aurora, (c) =>
        c.query('SELECT lottery_settle($1, $2, $3, $4, $5::jsonb)', [
          ticketId,
          resultId,
          revision,
          prize,
          items === null ? null : JSON.stringify(items),
        ]),
      );

    const ok = [{ position: 1, guesses: ['3452'], prizeCents: 800_000 }];
    // Acima do possível prêmio do item; palpite que não é do pule; item inexistente; soma diferente do total.
    await expect(settle(800_001, [{ ...ok[0], prizeCents: 800_001 }])).rejects.toMatchObject({ code: '23514' });
    await expect(settle(800_000, [{ ...ok[0], guesses: ['9999'] }])).rejects.toMatchObject({ code: '23514' });
    await expect(settle(800_000, [{ ...ok[0], position: 2 }])).rejects.toMatchObject({ code: '23514' });
    await expect(settle(1, ok)).rejects.toMatchObject({ code: '23514' });
    await expect(settle(800_000, null)).rejects.toMatchObject({ code: '23514' });
    // Resultado de outro sorteio; revisão que não é a atual.
    await expect(settle(800_000, ok, rio11.id)).rejects.toMatchObject({ code: 'SJ008' });
    await expect(settle(800_000, ok, rio9.id, 2)).rejects.toMatchObject({ code: 'SJ007' });
    // Fazendinha: o prêmio tem de ser exatamente o do 1º prêmio.
    await expect(
      asTenant(runtimePool, ids.aurora, (c) => c.query('SELECT fazendinha_settle($1, $2, 1, 0)', [betId, rio9.id])),
    ).rejects.toMatchObject({ code: '23514' });
    // Pule "vendido" depois de o resultado chegar não é apurado.
    await asTenant(migratorPool, ids.aurora, (c) =>
      c.query("UPDATE lottery_tickets SET created_at = now() + interval '1 hour'"),
    );
    await expect(settle(800_000, ok)).rejects.toMatchObject({ code: 'SJ008' });
    expect(await query('aurora', 'SELECT count(*)::int AS n FROM pule_settlements')).toEqual([{ n: 0 }]);
  });

  it('a API só lê a apuração; prêmio pago, apuração e movimentação não mudam nem para a dona', async () => {
    const p = await player();
    const pule = await buyLottery(p, [lotteryItem('milhar', 'p1', ['3452'])]);
    await moveTo('aurora', YESTERDAY, { lotteries: [pule] });
    await result(YESTERDAY, FIVE('3452'));
    await sweep(31);

    for (const sql of [
      'UPDATE pule_settlements SET prize_cents = 1',
      'DELETE FROM pule_settlements',
      'UPDATE pule_prizes SET prize_cents = 1',
      `INSERT INTO pule_prizes (tenant_id, user_id, game, pule_number, draw_date, lottery, draw_hour, stake_cents, prize_cents)
       SELECT tenant_id, id, 'lotteries', 1, CURRENT_DATE, 'LT PT RIO 09HS', 9, 1, 1 FROM users LIMIT 1`,
    ]) {
      await expect(
        asTenant(runtimePool, ids.aurora, (c) => c.query(sql)),
        sql,
      ).rejects.toMatchObject({ code: '42501' });
    }
    for (const sql of [
      'UPDATE pule_settlements SET prize_cents = 1',
      'DELETE FROM pule_settlements',
      'UPDATE pule_prizes SET prize_cents = 1',
      'DELETE FROM pule_prizes',
    ]) {
      await expect(
        asTenant(migratorPool, ids.aurora, (c) => c.query(sql)),
        sql,
      ).rejects.toMatchObject({ code: '23514' });
    }
    // Movimentação de prêmio sem a pule premiada (ou de outro tipo de bolsa) é recusada pelo banco.
    await expect(
      asTenant(migratorPool, ids.aurora, (c) =>
        c.query(
          `INSERT INTO wallet_entries (tenant_id, user_id, kind, balance_jb_delta, prizes_jb_delta)
           VALUES ($1, $2, 'PRIZE', 0, 100)`,
          [ids.aurora, p.person.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
