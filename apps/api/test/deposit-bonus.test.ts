import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type DepositBonusSettings,
  type LoginResponse,
  type PublicDepositBonusOffers,
  type PublicDepositStatus,
  defaultQuotes,
  drawDateOf,
  findLotteryModality,
  lotteryQuoteCents,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  KEYS,
  SYNTHETIC_PASSWORD,
  api,
  asTenant,
  createUser,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
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
beforeEach(async () => {
  await resetUsers();
  // Sem Federal hoje, salvo quando o teste liga.
  await federalToday(false);
});

const SETTINGS_URL = '/v1/admin/deposit-bonus-settings';
const OFF = { enabled: false, bps: 0, maxCents: 30000 };
/** Regra ativa com % e teto. */
const on = (bps: number, maxCents: number) => ({ enabled: true, bps, maxCents });
const BASE: DepositBonusSettings = { minDepositCents: 1000, firstDeposit: OFF, daily: OFF, federal: OFF };
type Session = Awaited<ReturnType<typeof loginOperator>>;

/** Liga ou desliga o sorteio da Federal (LT FEDERAL, resultado "fd") hoje na banca, pelo cadastro de sorteios. */
async function federalToday(on: boolean) {
  await asTenant(migratorPool, auroraId, async (c) => {
    await c.query(`DELETE FROM draw_exceptions WHERE date = brasilia_today()`);
    await c.query(`UPDATE draws SET weekdays = $1::smallint[] WHERE result_lottery = 'fd'`, [
      on ? [0, 1, 2, 3, 4, 5, 6] : [0, 3],
    ]);
    if (!on) {
      await c.query(
        `INSERT INTO draw_exceptions (tenant_id, date, draw_id, kind)
         SELECT tenant_id, brasilia_today(), id, 'CANCEL' FROM draws WHERE result_lottery = 'fd'`,
      );
    }
  });
}

async function configure(session: Session, settings: Partial<DepositBonusSettings>) {
  const res = await session.http.put(SETTINGS_URL, { ...BASE, ...settings });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

async function player(extra: Record<string, unknown> = {}) {
  const person = await createUser(app, 'aurora', extra);
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return {
    person,
    http: api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token }),
  };
}

/**
 * Recarga paga pelo caminho real do banco: cobrança criada, pagador informado (o próprio jogador, salvo `payer`) e a
 * confirmação pela role de runtime (pix_deposit_confirm, que credita e concede o bônus).
 */
async function pay(
  person: { id: string; document: string },
  cents: number,
  { destination = 'LOTTERIES', payer }: { destination?: 'LOTTERIES' | 'GAMES'; payer?: string } = {},
) {
  const id = await asTenant(migratorPool, auroraId, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO pix_deposits (tenant_id, user_id, gateway, destination, amount_cents, expires_at)
       VALUES ($1, $2, 'MISTICPAY', $3, $4, now() + interval '15 minutes') RETURNING id`,
      [auroraId, person.id, destination, cents],
    );
    return rows[0]!.id;
  });
  const outcome = await asTenant(runtimePool, auroraId, async (c) => {
    await c.query('SELECT pix_deposit_set_payer($1, $2, $3)', [id, payer ?? person.document, 'Pagador Sintético']);
    const { rows } = await c.query<{ outcome: string }>('SELECT pix_deposit_confirm($1, $2) AS outcome', [id, cents]);
    return rows[0]!.outcome;
  });
  return { id, outcome };
}

async function walletOf(userId: string) {
  return asTenant(migratorPool, auroraId, async (c) => {
    const { rows } = await c.query<{ balance_jb: string; bonus_jb: string; prizes_jb: string }>(
      'SELECT balance_jb, bonus_jb, prizes_jb FROM wallets WHERE user_id = $1',
      [userId],
    );
    return {
      balance: Number(rows[0]!.balance_jb),
      bonus: Number(rows[0]!.bonus_jb),
      prizes: Number(rows[0]!.prizes_jb),
    };
  });
}

async function bonusesOf(userId: string) {
  return asTenant(migratorPool, auroraId, async (c) => {
    const { rows } = await c.query<{ rule: string; amount_cents: string; rate_bps: number }>(
      'SELECT rule, amount_cents, rate_bps FROM deposit_bonuses WHERE user_id = $1 ORDER BY created_at',
      [userId],
    );
    return rows.map((row) => ({ rule: row.rule, amount: Number(row.amount_cents), bps: row.rate_bps }));
  });
}

describe('Configurações > Pagamentos > Bônus de recarga', () => {
  it('padrão desligado; Gerente altera (auditado); Financeiro só consulta; limites conferidos', async () => {
    const manager = await loginOperator(app, 'aurora');
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await manager.http.get(SETTINGS_URL)).body).toEqual(BASE);
    expect((await support.http.get(SETTINGS_URL)).status).toBe(403);

    const next = { ...BASE, firstDeposit: on(10000, 30000), daily: on(1000, 5000) };
    expect((await finance.http.put(SETTINGS_URL, next)).status).toBe(403);
    const saved = await manager.http.put(SETTINGS_URL, next);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(next);
    expect((await finance.http.get(SETTINGS_URL)).body).toEqual(next);
    const audit = await manager.http.get('/v1/admin/audit?action=deposit.bonus.settings');
    expect(audit.body.items).toHaveLength(1);

    for (const bad of [
      { ...BASE, daily: on(1000, 0) },
      { ...BASE, daily: on(0, 100) },
      { ...BASE, daily: on(10001, 100) },
      { ...BASE, minDepositCents: 50 },
      { ...BASE, federal: on(1, 10_000_001) },
      { ...BASE, extra: true },
      { ...BASE, daily: on(1.5, 100) },
      { ...BASE, daily: { bps: 100, maxCents: 100 } },
    ]) {
      expect((await manager.http.put(SETTINGS_URL, bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });
});

describe('Concessão do bônus na recarga', () => {
  it('regra pausada mantém % e teto gravados, mas não é oferecida nem concedida', async () => {
    const manager = await loginOperator(app, 'aurora');
    const paused = { enabled: false, bps: 2500, maxCents: 8000 };
    await configure(manager, { daily: paused });
    expect((await manager.http.get(SETTINGS_URL)).body.daily).toEqual(paused);
    const { person, http } = await player();
    expect(((await http.get('/v1/payments/deposit-bonus')).body as PublicDepositBonusOffers).offers).toEqual([]);
    await pay(person, 10000);
    expect(await bonusesOf(person.id)).toEqual([]);

    // Reativada, vale de novo (para quem ainda não recarregou hoje).
    await configure(manager, { daily: { ...paused, enabled: true } });
    const other = await player();
    await pay(other.person, 10000);
    expect(await bonusesOf(other.person.id)).toEqual([{ rule: 'DAILY', amount: 2500, bps: 2500 }]);
  });

  it('primeira recarga da conta: % com teto; a segunda do mesmo dia não ganha; status mostra o bônus', async () => {
    const manager = await loginOperator(app, 'aurora');
    await configure(manager, { firstDeposit: on(10000, 30000), daily: on(1000, 5000) });
    const { person, http } = await player();

    const first = await pay(person, 50000);
    expect(first.outcome).toBe('applied');
    expect(await walletOf(person.id)).toEqual({ balance: 50000, bonus: 30000, prizes: 0 });
    const status = (await http.get(`/v1/payments/deposits/${first.id}`)).body as PublicDepositStatus;
    expect(status.bonusCents).toBe(30000);
    expect(status.wallet).toMatchObject({ bonusJb: 30000, withdrawable: 0 });

    await pay(person, 20000);
    expect(await bonusesOf(person.id)).toEqual([{ rule: 'FIRST_DEPOSIT', amount: 30000, bps: 10000 }]);
    // Bônus nunca é sacável.
    expect((await http.get('/v1/me')).body.wallet.withdrawable).toBe(0);
  });

  it('só o maior: na primeira recarga, a regra do dia vence quando o teto da primeira é menor', async () => {
    const manager = await loginOperator(app, 'aurora');
    await configure(manager, { firstDeposit: on(1000, 500), daily: on(5000, 10000) });
    const { person } = await player();
    await pay(person, 100000);
    expect(await bonusesOf(person.id)).toEqual([{ rule: 'DAILY', amount: 10000, bps: 5000 }]);
  });

  it('dia de Federal: primeira do dia ganha a % da Federal se for maior que a diária', async () => {
    await federalToday(true);
    const manager = await loginOperator(app, 'aurora');
    await configure(manager, { daily: on(1000, 30000), federal: on(3000, 30000) });
    const { person, http } = await player();

    const offers = (await http.get('/v1/payments/deposit-bonus')).body as PublicDepositBonusOffers;
    expect(offers).toEqual({
      offers: [
        { rule: 'FEDERAL', bps: 3000, maxCents: 30000 },
        { rule: 'DAILY', bps: 1000, maxCents: 30000 },
      ],
      minDepositCents: 1000,
    });

    await pay(person, 10000);
    expect(await bonusesOf(person.id)).toEqual([{ rule: 'FEDERAL', amount: 3000, bps: 3000 }]);
    // Já recarregou hoje: nenhuma oferta até amanhã.
    expect(((await http.get('/v1/payments/deposit-bonus')).body as PublicDepositBonusOffers).offers).toEqual([]);
  });

  it('sem Federal hoje (feriado no cadastro), vale só a diária', async () => {
    const manager = await loginOperator(app, 'aurora');
    await configure(manager, { daily: on(1000, 30000), federal: on(3000, 30000) });
    const { person } = await player();
    await pay(person, 10000);
    expect(await bonusesOf(person.id)).toEqual([{ rule: 'DAILY', amount: 1000, bps: 1000 }]);
  });

  it('não ganha: abaixo do mínimo, recarga de cassino, jogador bloqueado ou regras desligadas', async () => {
    const manager = await loginOperator(app, 'aurora');
    const { person } = await player();
    await pay(person, 5000); // tudo desligado
    await configure(manager, { minDepositCents: 2000, daily: on(1000, 30000) });
    const small = await player();
    await pay(small.person, 1999);
    const games = await player();
    await pay(games.person, 50000, { destination: 'GAMES' });
    const blocked = await player();
    await manager.http.patch(`/v1/admin/users/${blocked.person.id}/status`, { status: 'BLOCKED' });
    expect((await pay(blocked.person, 50000)).outcome).toBe('applied');

    for (const who of [person, small.person, games.person, blocked.person]) {
      expect(await bonusesOf(who.id), who.id).toEqual([]);
    }
    // A recarga de cassino não conta como "primeira do dia" de Loterias.
    await pay(games.person, 10000);
    expect(await bonusesOf(games.person.id)).toEqual([{ rule: 'DAILY', amount: 1000, bps: 1000 }]);
  });

  it('recarga em análise (outro titular) só ganha quando o Gerente libera', async () => {
    const manager = await loginOperator(app, 'aurora');
    await configure(manager, { firstDeposit: on(5000, 30000) });
    const { person } = await player();
    const held = await pay(person, 10000, { payer: '52998224725' });
    expect(held.outcome).toBe('review');
    expect(await bonusesOf(person.id)).toEqual([]);

    const res = await manager.http.post(`/v1/admin/deposits/${held.id}/review`, { approve: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await bonusesOf(person.id)).toEqual([{ rule: 'FIRST_DEPOSIT', amount: 5000, bps: 5000 }]);
    expect(await walletOf(person.id)).toEqual({ balance: 10000, bonus: 5000, prizes: 0 });
  });

  it('livro-caixa: DEPOSIT_BONUS só na bolsa de bônus; a role de runtime não grava bônus nem chama a concessão', async () => {
    const manager = await loginOperator(app, 'aurora');
    await configure(manager, { daily: on(1000, 30000) });
    const { person } = await player();
    const { id } = await pay(person, 10000);
    const entries = await asTenant(
      migratorPool,
      auroraId,
      async (c) =>
        (
          await c.query(
            `SELECT kind, balance_jb_delta, bonus_jb_delta, note FROM wallet_entries WHERE user_id = $1 ORDER BY kind`,
            [person.id],
          )
        ).rows,
    );
    expect(entries).toEqual([
      { kind: 'DEPOSIT', balance_jb_delta: '10000', bonus_jb_delta: '0', note: null },
      { kind: 'DEPOSIT_BONUS', balance_jb_delta: '0', bonus_jb_delta: '1000', note: 'Bônus de recarga' },
    ]);
    await expect(
      asTenant(runtimePool, auroraId, (c) => c.query('SELECT deposit_bonus_grant($1, $2)', [auroraId, id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asTenant(runtimePool, auroraId, (c) => c.query('UPDATE deposit_bonuses SET amount_cents = 1')),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('Uso do bônus nas apostas', () => {
  const TOMORROW = drawDateOf(new Date().toISOString(), 1);
  const lotteryItem = (amountCents: number) => ({
    modality: 'milhar',
    placement: 'p1',
    guesses: ['3452'],
    amountCents,
    split: 'total',
    quoteCents: lotteryQuoteCents(findLotteryModality('milhar')!, defaultQuotes()),
  });

  it('Loterias: bônus primeiro, depois Saldo; comissão só sobre o Saldo; cancelar devolve ao bônus', async () => {
    const manager = await loginOperator(app, 'aurora');
    await configure(manager, { firstDeposit: on(3000, 30000) });
    const promoter = await createUser(app, 'aurora', { name: 'Paula Promotora' });
    await manager.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 1000 });
    const { person, http } = await player({ inviteCode: promoter.inviteCode });
    await pay(person, 1000); // 1.000 de saldo + 300 de bônus

    const res = await http.post('/v1/lotteries/tickets', {
      idempotencyKey: randomUUID(),
      drawDate: TOMORROW,
      draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
      items: [lotteryItem(500)],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await walletOf(person.id)).toEqual({ balance: 800, bonus: 0, prizes: 0 });
    // Comissão pendente: 10% de promotor sobre os 200 pagos com Saldo (não sobre os 300 de bônus).
    const pending = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT wagered_cents::int AS wagered, promoter_cents::int AS cents FROM bet_commissions'),
    );
    expect(pending.rows).toEqual([{ wagered: 200, cents: 20 }]);
    expect(await walletOf(promoter.id)).toMatchObject({ balance: 0 });

    const pule = res.body.tickets[0].puleNumber as number;
    expect((await http.post(`/v1/me/pules/${pule}/cancel`, {})).status).toBe(200);
    expect(await walletOf(person.id)).toEqual({ balance: 1000, bonus: 300, prizes: 0 });
    // Cancelado antes da apuração: a comissão não chega a ser paga.
    await settleAll(app, 'aurora');
    expect(await walletOf(promoter.id)).toMatchObject({ balance: 0 });
  });

  it('Fazendinha também gasta o bônus primeiro; sem fundos somando bônus, recusa', async () => {
    const manager = await loginOperator(app, 'aurora');
    await configure(manager, { firstDeposit: on(10000, 30000) });
    const { person, http } = await player();
    await pay(person, 1000); // 1.000 de saldo + 1.000 de bônus
    const { fazendinhaPrizeFrom } = await import('@sysjb/contracts');
    const bet = (stakeCents: number, numbers: number[]) => ({
      idempotencyKey: randomUUID(),
      drawDate: TOMORROW,
      lottery: 'LT PT RIO 09HS',
      hour: 9,
      mode: 'grupo',
      stakeCents,
      numbers,
      prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', stakeCents),
    });
    const ok = await http.post('/v1/fazendinha/bets', bet(100, [5, 4]));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(await walletOf(person.id)).toEqual({ balance: 1000, bonus: 800, prizes: 0 });
    // 1.800 disponíveis (saldo + bônus): 2.000 é demais.
    const tooMuch = await http.post('/v1/fazendinha/bets', bet(1000, [1, 2]));
    expect(tooMuch.status).toBe(409);
  });
});
