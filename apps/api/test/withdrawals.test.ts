import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { type IncomingMessage, type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type {
  AdminWithdrawalList,
  AdminWithdrawalListItem,
  LoginResponse,
  MyWithdrawals,
  PublicUser,
  PushPayload,
  WithdrawalResult,
  WithdrawalSettings,
} from '@sysjb/contracts';
import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DepositsService } from '../src/payments/deposits.service.js';
import { misticPayPixKey } from '../src/payments/misticpay.gateway.js';
import { loadPaymentsConfig } from '../src/payments/payments.config.js';
import { WithdrawalsService, withdrawalPush } from '../src/payments/withdrawals.service.js';
import { PushService } from '../src/push/push.service.js';
import {
  SYNTHETIC_PASSWORD,
  api,
  asTenant,
  consoleApi,
  createUser,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  tenantId,
} from './helpers.js';

const CLIENT_ID = `pk_${randomBytes(12).toString('hex')}`;
const CLIENT_SECRET = `sk_${randomBytes(16).toString('hex')}`;

interface FakePayout {
  providerId: string;
  amount: number;
  pixKey: string;
  pixKeyType: string;
  description: string;
  state: 'PENDENTE' | 'COMPLETO' | 'FALHA';
  beneficiaryDocument: string;
}

/** MisticPay falsa: saques (envio, consulta e listagem), com falhas programáveis. */
const fake = {
  payouts: new Map<string, FakePayout>(),
  sends: 0,
  /** Próximo envio responde com este status HTTP. `createAnyway`: cria lá mesmo assim (resposta perdida). */
  failSend: null as { status: number; createAnyway?: boolean } | null,
  /** Documento de quem recebe (padrão: o da chave). */
  beneficiary: null as string | null,
};
let fakeServer: Server;
let app: INestApplication;
const VAPID = webpush.generateVAPIDKeys();
/** Avisos capturados pelo envio falso (o endpoint de verdade é de um serviço externo). */
let pushes: PushPayload[] = [];
let pushFails = false;
let withdrawals: WithdrawalsService;

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
    req.on('end', () => resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}));
  });
}

beforeAll(async () => {
  fakeServer = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const expected = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
    if (req.headers.authorization !== expected) return send(401, { message: 'Credenciais inválidas' });
    const url = new URL(req.url ?? '/', 'http://fake');
    const body = await readBody(req);
    if (url.pathname === '/api/transactions/withdraw' && req.method === 'POST') {
      fake.sends += 1;
      const failure = fake.failSend;
      fake.failSend = null;
      if (failure && !failure.createAnyway) return send(failure.status, { message: 'recusado' });
      const payout: FakePayout = {
        providerId: `7${fake.sends}${fake.payouts.size}`,
        amount: Number(body.amount),
        pixKey: String(body.pixKey),
        pixKeyType: String(body.pixKeyType),
        description: String(body.description),
        state: 'PENDENTE',
        beneficiaryDocument: fake.beneficiary ?? String(body.pixKey),
      };
      fake.payouts.set(payout.providerId, payout);
      if (failure) return send(failure.status, { message: 'erro interno' });
      return send(201, {
        message: 'Saque adicionado à fila de processamento',
        data: { jobId: `withdraw-${payout.providerId}`, transactionId: Number(payout.providerId), status: 'QUEUED' },
      });
    }
    if (url.pathname === '/api/transactions/check' && req.method === 'POST') {
      const payout = fake.payouts.get(String(body.transactionId));
      if (!payout) return send(404, { message: 'Transação não encontrada' });
      return send(200, {
        transaction: {
          transactionId: payout.providerId,
          value: payout.amount,
          fee: 0.5,
          transactionState: payout.state,
          transactionType: 'RETIRADA',
          transactionMethod: 'PIX',
          beneficiary: { name: 'Titular Sintético', document: payout.beneficiaryDocument, documentType: 'cpf' },
        },
      });
    }
    if (url.pathname === '/api/transactions/list' && req.method === 'GET') {
      const search = url.searchParams.get('search') ?? '';
      const items = [...fake.payouts.values()]
        .filter((p) => p.description.includes(search))
        .map((p) => ({ id: Number(p.providerId), description: p.description, transactionType: 'RETIRADA' }));
      return send(200, { data: items });
    }
    return send(404, {});
  });
  await new Promise<void>((resolve) => fakeServer.listen(0, '127.0.0.1', resolve));
  const fakeUrl = `http://127.0.0.1:${(fakeServer.address() as AddressInfo).port}/api/`;
  const payments = loadPaymentsConfig({
    PAYMENTS_SECRET_KEY: randomBytes(24).toString('hex'),
    MISTICPAY_API_URL: fakeUrl,
  })!;
  app = await startApp({
    payments: { ...payments, sweepIntervalMs: null },
    push: { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: 'mailto:suporte@exemplo.com' },
  });
  app.get(PushService).sender = async (_subscription, body) => {
    if (pushFails) throw new Error('serviço de push fora do ar');
    pushes.push(JSON.parse(body) as PushPayload);
  };
  withdrawals = app.get(WithdrawalsService);
});

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve) => fakeServer.close(() => resolve()));
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});

beforeEach(async () => {
  await resetUsers();
  fake.payouts.clear();
  fake.sends = 0;
  fake.failSend = null;
  fake.beneficiary = null;
  pushes = [];
  pushFails = false;
});

/** Aparelho do jogador inscrito nas notificações (chaves no formato real). */
async function subscribeDevice(who: Player) {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const res = await who.http.post('/v1/me/push-subscriptions', {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  });
  expect(res.status).toBeLessThan(300);
}

type Tenant = 'aurora' | 'boreal';

async function player(tenant: Tenant = 'aurora') {
  const person = await createUser(app, tenant);
  const login = await api(app, tenant).post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return {
    ...person,
    tenant,
    http: api(app, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token }),
  };
}
type Player = Awaited<ReturnType<typeof player>>;

/** Gerente com a MisticPay configurada e ativa. */
async function configured(tenant: Tenant = 'aurora') {
  const manager = await loginOperator(app, tenant);
  const res = await manager.http.put('/v1/admin/payments/MISTICPAY', {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    activate: true,
  });
  expect(res.status).toBe(200);
  return manager;
}

/** Prêmios (loterias e cassino) na carteira, como saldo de abertura (a conciliação confere). */
async function grantPrizes(who: Player, jbCents: number, gamesCents = 0) {
  const id = await tenantId(who.tenant);
  await asTenant(migratorPool, id, async (c) => {
    await c.query(
      'UPDATE wallets SET prizes_jb = prizes_jb + $2, prizes_games = prizes_games + $3 WHERE user_id = $1',
      [who.id, jbCents, gamesCents],
    );
    await c.query(
      `INSERT INTO wallet_entries (tenant_id, user_id, kind, balance_jb_delta, prizes_jb_delta, prizes_games_delta, note)
       VALUES ($1, $2, 'OPENING_BALANCE', 0, $3, $4, 'Prêmios de teste')`,
      [id, who.id, jbCents, gamesCents],
    );
  });
}

async function prizes(who: Player) {
  const id = await tenantId(who.tenant);
  return asTenant(migratorPool, id, async (c) => {
    const { rows } = await c.query<{ prizes_jb: string; prizes_games: string }>(
      'SELECT prizes_jb, prizes_games FROM wallets WHERE user_id = $1',
      [who.id],
    );
    return { jb: Number(rows[0]!.prizes_jb), games: Number(rows[0]!.prizes_games) };
  });
}

async function rowOf(tenant: Tenant, withdrawalId: string) {
  const id = await tenantId(tenant);
  return asTenant(migratorPool, id, async (c) => {
    const { rows } = await c.query<Record<string, unknown>>('SELECT * FROM pix_withdrawals WHERE id = $1', [
      withdrawalId,
    ]);
    return rows[0]!;
  });
}

/** Volta no tempo campos de data do saque (só para os prazos da rodada e da conclusão manual). */
async function age(tenant: Tenant, withdrawalId: string, column: 'send_started_at' | 'updated_at', minutes: number) {
  const id = await tenantId(tenant);
  await asTenant(migratorPool, id, (c) =>
    c.query(`UPDATE pix_withdrawals SET ${column} = now() - make_interval(mins => $2) WHERE id = $1`, [
      withdrawalId,
      minutes,
    ]),
  );
}

const request = (who: Player, amountCents: number, extra: Record<string, unknown> = {}) =>
  who.http.post('/v1/payments/withdrawals', {
    amountCents,
    keyType: 'CPF',
    keyValue: who.document,
    idempotencyKey: randomUUID(),
    ...extra,
  });

async function requested(who: Player, amountCents: number, extra: Record<string, unknown> = {}) {
  const res = await request(who, amountCents, extra);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  await withdrawals.idle();
  return res.body as WithdrawalResult;
}

const today = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const adminList = async (http: Awaited<ReturnType<typeof loginOperator>>['http'], extra = '') =>
  (await http.get(`/v1/admin/withdrawals?from=${today()}&to=${today()}${extra}`)).body as AdminWithdrawalList;

describe('solicitação do jogador', () => {
  it('até o limite automático: reserva dos prêmios (loterias, depois cassino) e envia ao gateway', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 1500, 5000);

    const result = await requested(me, 4000);
    expect(result.withdrawal).toMatchObject({
      amountCents: 4000,
      status: 'PROCESSING',
      keyType: 'CPF',
      cancellable: false,
    });
    expect(result.wallet).toMatchObject({ prizesJb: 0, prizesGames: 2500, withdrawable: 2500 });
    expect(await prizes(me)).toEqual({ jb: 0, games: 2500 });

    const row = await rowOf('aurora', result.withdrawal.id);
    expect(row).toMatchObject({ status: 'PROCESSING', from_prizes_jb_cents: '1500', from_prizes_games_cents: '2500' });
    const [payout] = [...fake.payouts.values()];
    expect(payout).toMatchObject({
      amount: 40,
      pixKey: me.document,
      pixKeyType: 'CPF',
      description: `Saque ${result.withdrawal.id}`,
    });
    expect(row.provider_transaction_id).toBe(payout!.providerId);

    const mine = (await me.http.get('/v1/payments/withdrawals')).body as MyWithdrawals;
    expect(mine.withdrawableCents).toBe(2500);
    expect(mine.limits).toMatchObject({ enabled: true, minCents: 1000, maxCents: 500000, dailyCount: 3, usedToday: 1 });
    expect(mine.items.map((i) => i.id)).toEqual([result.withdrawal.id]);
  });

  it('acima do limite automático fica em análise; o jogador pode cancelar (devolve)', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 50000);
    const result = await requested(me, 30000);
    expect(result.withdrawal).toMatchObject({ status: 'REVIEW', cancellable: true });
    expect(fake.sends).toBe(0);

    const canceled = await me.http.post(`/v1/payments/withdrawals/${result.withdrawal.id}/cancel`, {});
    expect(canceled.status).toBe(200);
    expect((canceled.body as WithdrawalResult).withdrawal.status).toBe('CANCELED');
    expect(await prizes(me)).toEqual({ jb: 50000, games: 0 });
    // Cancelar de novo, ou cancelar um saque já enviado: conflito.
    expect((await me.http.post(`/v1/payments/withdrawals/${result.withdrawal.id}/cancel`, {})).status).toBe(409);
    const sent = await requested(me, 1000);
    expect((await me.http.post(`/v1/payments/withdrawals/${sent.withdrawal.id}/cancel`, {})).status).toBe(409);
  });

  it('chaves: e-mail, celular (+55 no gateway) e aleatória; CPF só o do titular', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 100000);
    await requested(me, 1000, { keyType: 'EMAIL', keyValue: '  Jogador@Exemplo.COM ' });
    await requested(me, 1000, { keyType: 'PHONE', keyValue: '(11) 98765-4321' });
    const random = randomUUID();
    await requested(me, 1000, { keyType: 'RANDOM', keyValue: random.toUpperCase() });
    expect([...fake.payouts.values()].map((p) => [p.pixKeyType, p.pixKey])).toEqual([
      ['EMAIL', 'jogador@exemplo.com'],
      ['TELEFONE', '+5511987654321'],
      ['CHAVE_ALEATORIA', random],
    ]);
    expect(misticPayPixKey('CPF', '12345678909')).toBe('12345678909');

    const other = await request(me, 1000, { keyValue: '52998224725' });
    expect(other.status).toBe(400);
    expect((await request(me, 1000, { keyType: 'PHONE', keyValue: '123' })).status).toBe(400);
    expect((await request(me, 1000, { keyType: 'EMAIL', keyValue: 'sem-arroba' })).status).toBe(400);
  });

  it('mesma chave de idempotência = o mesmo saque (inclusive em paralelo); outros dados = conflito', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 10000);
    const key = randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => request(me, 2000, { idempotencyKey: key })));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(new Set(results.map((r) => (r.body as WithdrawalResult).withdrawal.id)).size).toBe(1);
    await withdrawals.idle();
    expect(await prizes(me)).toEqual({ jb: 8000, games: 0 });
    expect(fake.sends).toBe(1);
    expect((await request(me, 3000, { idempotencyKey: key })).status).toBe(409);
  });

  it('limites: mínimo, máximo, saques por dia, saldo, pausado, conta bloqueada', async () => {
    const manager = await configured();
    const me = await player();
    await grantPrizes(me, 1_000_000);
    expect((await request(me, 999)).body).toMatchObject({ message: 'Valor fora dos limites de saque.' });
    expect((await request(me, 500001)).status).toBe(400);
    await requested(me, 1000);
    await requested(me, 1000);
    await requested(me, 1000);
    const fourth = await request(me, 1000);
    expect(fourth.status).toBe(429);

    const poor = await player();
    await grantPrizes(poor, 500);
    expect((await request(poor, 1000)).status).toBe(409);
    // Recarga e bônus não são sacáveis.
    expect((await poor.http.get('/v1/me')).body).toMatchObject({ wallet: { withdrawable: 500 } });

    const paused = await manager.http.put('/v1/admin/withdrawal-settings', {
      enabled: false,
      minCents: 1000,
      maxCents: 500000,
      dailyCount: 3,
      autoLimitCents: 20000,
    });
    expect(paused.status).toBe(200);
    const other = await player();
    await grantPrizes(other, 5000);
    expect((await request(other, 1000)).status).toBe(503);

    await manager.http.put('/v1/admin/withdrawal-settings', {
      enabled: true,
      minCents: 1000,
      maxCents: 500000,
      dailyCount: 3,
      autoLimitCents: 20000,
    });
    await manager.http.patch(`/v1/admin/users/${other.id}/status`, { status: 'BLOCKED' });
    const blocked = await request(other, 1000);
    expect([401, 403]).toContain(blocked.status);
    expect(await prizes(other)).toEqual({ jb: 5000, games: 0 });
  });

  it('isolamento: outro jogador não vê nem cancela o saque', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 50000);
    const result = await requested(me, 30000);
    const intruder = await player();
    expect((await intruder.http.get('/v1/payments/withdrawals')).body).toMatchObject({ items: [] });
    expect((await intruder.http.post(`/v1/payments/withdrawals/${result.withdrawal.id}/cancel`, {})).status).toBe(404);
    const otherTenant = await player('boreal');
    expect((await otherTenant.http.post(`/v1/payments/withdrawals/${result.withdrawal.id}/cancel`, {})).status).toBe(
      404,
    );
  });
});

describe('análise e conclusão', () => {
  it('Gerente aprova (envia) ou recusa com motivo (devolve); Financeiro e Suporte não decidem', async () => {
    const manager = await configured();
    const me = await player();
    await grantPrizes(me, 100000);
    const first = await requested(me, 30000);
    const second = await requested(me, 25000);

    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect(
      (await finance.http.post(`/v1/admin/withdrawals/${first.withdrawal.id}/review`, { approve: true })).status,
    ).toBe(403);

    const approved = await manager.http.post(`/v1/admin/withdrawals/${first.withdrawal.id}/review`, { approve: true });
    expect(approved.status).toBe(200);
    await withdrawals.idle();
    expect((await rowOf('aurora', first.withdrawal.id)).status).toBe('PROCESSING');

    const rejected = await manager.http.post(`/v1/admin/withdrawals/${second.withdrawal.id}/review`, {
      approve: false,
      note: 'Dados bancários divergentes',
    });
    expect((rejected.body as AdminWithdrawalListItem).status).toBe('REJECTED');
    expect(await prizes(me)).toEqual({ jb: 100000 - 30000, games: 0 });
    const mine = (await me.http.get('/v1/payments/withdrawals')).body as MyWithdrawals;
    expect(mine.items.find((i) => i.id === second.withdrawal.id)).toMatchObject({
      status: 'REJECTED',
      note: 'Dados bancários divergentes',
    });
    // Já decidido: conflito.
    expect(
      (await manager.http.post(`/v1/admin/withdrawals/${second.withdrawal.id}/review`, { approve: true })).status,
    ).toBe(409);

    const audit = await manager.http.get('/v1/admin/audit?action=withdrawal.reject');
    expect(JSON.stringify(audit.body)).toContain('withdrawal.reject');
  });

  it('gateway paga: PAID com o titular conferido; gateway falha: FAILED e devolve', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 10000);
    const paid = await requested(me, 3000);
    const failed = await requested(me, 2000);
    const [first, second] = [...fake.payouts.values()];
    first!.state = 'COMPLETO';
    second!.state = 'FALHA';
    await withdrawals.reconcile(await tenantId('aurora'), paid.withdrawal.id);
    await withdrawals.reconcile(await tenantId('aurora'), failed.withdrawal.id);

    expect(await rowOf('aurora', paid.withdrawal.id)).toMatchObject({
      status: 'PAID',
      beneficiary_document: me.document,
    });
    expect(await rowOf('aurora', failed.withdrawal.id)).toMatchObject({
      status: 'FAILED',
      failure_reason: 'GATEWAY_FAILED',
    });
    expect(await prizes(me)).toEqual({ jb: 7000, games: 0 });

    const manager = await loginOperator(app, 'aurora');
    const list = await adminList(manager.http, '&status=PAID');
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ beneficiaryMatches: true, beneficiary: { document: me.document } });
    expect(list.paidTotalCents).toBe(3000);
    // Suporte vê a lista, mas não o documento de quem recebeu.
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await adminList(support.http, '&status=PAID')).items[0]).toMatchObject({ beneficiary: null });

    // Concluído não muda mais.
    await withdrawals.reconcile(await tenantId('aurora'), paid.withdrawal.id);
    expect((await rowOf('aurora', paid.withdrawal.id)).status).toBe('PAID');
  });

  it('pago a outro titular: fica registrado para o painel', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 10000);
    fake.beneficiary = '52998224725';
    const result = await requested(me, 2000, { keyType: 'EMAIL', keyValue: 'outra@exemplo.com' });
    [...fake.payouts.values()][0]!.state = 'COMPLETO';
    await withdrawals.reconcile(await tenantId('aurora'), result.withdrawal.id);
    const manager = await loginOperator(app, 'aurora');
    expect((await adminList(manager.http)).items[0]).toMatchObject({ status: 'PAID', beneficiaryMatches: false });
  });
});

describe('envio ao gateway', () => {
  it('credencial recusada ou pedido recusado: volta para análise sem mexer no dinheiro', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 10000);
    fake.failSend = { status: 400 };
    const rejected = await requested(me, 2000);
    expect(await rowOf('aurora', rejected.withdrawal.id)).toMatchObject({
      status: 'REVIEW',
      failure_reason: 'GATEWAY_REJECTED',
      gateway: null,
    });
    expect(await prizes(me)).toEqual({ jb: 8000, games: 0 });
  });

  it('limite de requisições (429): volta à fila e a rodada envia de novo', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 10000);
    fake.failSend = { status: 429 };
    const result = await requested(me, 2000);
    expect((await rowOf('aurora', result.withdrawal.id)).status).toBe('QUEUED');
    await withdrawals.sweep();
    expect((await rowOf('aurora', result.withdrawal.id)).status).toBe('PROCESSING');
    expect(fake.sends).toBe(2);
    expect(fake.payouts.size).toBe(1);
  });

  it('sem resposta: NUNCA reenvia; acha no gateway pela descrição, ou o Gerente conclui à mão', async () => {
    const manager = await configured();
    const me = await player();
    await grantPrizes(me, 10000);
    const tenant = await tenantId('aurora');

    // A MisticPay criou o saque, mas a resposta se perdeu (500).
    fake.failSend = { status: 500, createAnyway: true };
    const found = await requested(me, 2000);
    expect((await rowOf('aurora', found.withdrawal.id)).status).toBe('SENDING');
    await withdrawals.sweep();
    expect(fake.sends).toBe(1);
    await withdrawals.reconcile(tenant, found.withdrawal.id); // ainda recente: não procura
    expect((await rowOf('aurora', found.withdrawal.id)).status).toBe('SENDING');
    await age('aurora', found.withdrawal.id, 'send_started_at', 3);
    await withdrawals.reconcile(tenant, found.withdrawal.id);
    expect(await rowOf('aurora', found.withdrawal.id)).toMatchObject({
      status: 'PROCESSING',
      provider_transaction_id: [...fake.payouts.values()][0]!.providerId,
    });

    // Não chegou lá (500 sem criar): fica enviando até o Gerente concluir, depois de 10 minutos.
    fake.failSend = { status: 500 };
    const lost = await requested(me, 3000);
    await age('aurora', lost.withdrawal.id, 'send_started_at', 3);
    await withdrawals.reconcile(tenant, lost.withdrawal.id);
    expect((await rowOf('aurora', lost.withdrawal.id)).status).toBe('SENDING');
    expect(
      (await manager.http.post(`/v1/admin/withdrawals/${lost.withdrawal.id}/resolve`, { paid: false })).status,
    ).toBe(409);
    await age('aurora', lost.withdrawal.id, 'send_started_at', 11);
    expect((await adminList(manager.http, '&status=SENDING')).items[0]).toMatchObject({ resolvable: true });
    const resolved = await manager.http.post(`/v1/admin/withdrawals/${lost.withdrawal.id}/resolve`, { paid: false });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({
      status: 'FAILED',
      failureReason: 'MANUAL_NOT_PAID',
      resolvedBy: { name: expect.any(String) },
    });
    expect(await prizes(me)).toEqual({ jb: 8000, games: 0 });
    expect(fake.sends).toBe(2);
  });

  it('sem gateway ativo: o saque automático volta para análise', async () => {
    const me = await player();
    await grantPrizes(me, 10000);
    const result = await requested(me, 2000);
    expect(await rowOf('aurora', result.withdrawal.id)).toMatchObject({
      status: 'REVIEW',
      failure_reason: 'NO_GATEWAY',
    });
    expect(result.wallet.prizesJb).toBe(8000);
  });
});

describe('aviso do gateway (webhook)', () => {
  it('com a assinatura do saque, confere no gateway; assinatura errada ou de depósito: 401', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 10000);
    const result = await requested(me, 2000);
    [...fake.payouts.values()][0]!.state = 'COMPLETO';
    const id = result.withdrawal.id;
    const hook = (query: string) => consoleApi(app).post(`/v1/integrations/payments/misticpay?${query}`, {});

    expect((await hook(`s=${id}&t=${'x'.repeat(43)}`)).status).toBe(401);
    const depositToken = app.get(DepositsService).sign('MISTICPAY', id)!;
    expect((await hook(`s=${id}&t=${depositToken}`)).status).toBe(401);
    expect((await rowOf('aurora', id)).status).toBe('PROCESSING');

    const token = withdrawals.sign('MISTICPAY', id)!;
    expect((await hook(`s=${id}&t=${token}`)).status).toBe(200);
    expect((await rowOf('aurora', id)).status).toBe('PAID');
  });
});

describe('configuração e travas do banco', () => {
  it('limites: só o Gerente grava; o banco confere a coerência', async () => {
    const manager = await loginOperator(app, 'aurora');
    expect((await manager.http.get('/v1/admin/withdrawal-settings')).body).toEqual({
      enabled: true,
      minCents: 1000,
      maxCents: 500000,
      dailyCount: 3,
      autoLimitCents: 20000,
    } satisfies WithdrawalSettings);
    const saved = await manager.http.put('/v1/admin/withdrawal-settings', {
      enabled: true,
      minCents: 2000,
      maxCents: 100000,
      dailyCount: 5,
      autoLimitCents: 0,
    });
    expect(saved.status).toBe(200);
    expect((saved.body as WithdrawalSettings).autoLimitCents).toBe(0);
    const invalid = await manager.http.put('/v1/admin/withdrawal-settings', {
      enabled: true,
      minCents: 5000,
      maxCents: 1000,
      dailyCount: 3,
      autoLimitCents: 0,
    });
    expect(invalid.status).toBe(400);
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.get('/v1/admin/withdrawal-settings')).status).toBe(200);
    expect(
      (
        await finance.http.put('/v1/admin/withdrawal-settings', {
          enabled: false,
          minCents: 1000,
          maxCents: 2000,
          dailyCount: 1,
          autoLimitCents: 0,
        })
      ).status,
    ).toBe(403);
  });

  it('a role de runtime só lê: não cria, não muda situação, não apaga; finais não mudam nem para a dona', async () => {
    await configured();
    const me = await player();
    await grantPrizes(me, 10000);
    const result = await requested(me, 2000);
    const id = await tenantId('aurora');
    await asTenant(runtimePool, id, async (c) => {
      await expect(c.query("UPDATE pix_withdrawals SET status = 'PAID'")).rejects.toThrow(/permission denied/);
    });
    await asTenant(runtimePool, id, async (c) => {
      await expect(c.query('DELETE FROM pix_withdrawals')).rejects.toThrow(/permission denied/);
    });
    await asTenant(runtimePool, id, async (c) => {
      await expect(
        c.query(
          `INSERT INTO pix_withdrawals (tenant_id, user_id, idempotency_key, amount_cents, from_prizes_jb_cents,
             from_prizes_games_cents, key_type, key_value, status) VALUES ($1, $2, gen_random_uuid(), 100, 100, 0, 'CPF',
             '12345678909', 'QUEUED')`,
          [id, me.id],
        ),
      ).rejects.toThrow(/permission denied/);
    });
    await asTenant(runtimePool, id, async (c) => {
      await expect(c.query(`SELECT "pix_withdrawal_refund"($1, $2)`, [id, result.withdrawal.id])).rejects.toThrow(
        /permission denied/,
      );
    });
    [...fake.payouts.values()][0]!.state = 'COMPLETO';
    await withdrawals.reconcile(id, result.withdrawal.id);
    await asTenant(migratorPool, id, async (c) => {
      await expect(
        c.query("UPDATE pix_withdrawals SET status = 'FAILED' WHERE id = $1", [result.withdrawal.id]),
      ).rejects.toThrow(/final withdrawal is immutable/);
    });
  });

  it('Resumo da Operação: saques pagos no período e o que ainda pode ser sacado', async () => {
    const manager = await configured();
    const me = await player();
    await grantPrizes(me, 10000, 2000);
    const result = await requested(me, 3000);
    [...fake.payouts.values()][0]!.state = 'COMPLETO';
    await withdrawals.reconcile(await tenantId('aurora'), result.withdrawal.id);
    const summary = await manager.http.get(`/v1/admin/operation-summary?from=${today()}&to=${today()}`);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      cashflow: { depositsCents: 0, withdrawalsCents: 3000, netCents: -3000 },
      balances: { withdrawableCents: 9000 },
      unavailable: ['casino'],
    });
  });

  it('a carteira do jogador mostra o sacável', async () => {
    const me = await player();
    await grantPrizes(me, 1234, 766);
    const res = await me.http.get('/v1/me');
    expect((res.body as PublicUser).wallet.withdrawable).toBe(2000);
  });
});

/** A moeda vem com espaço inseparável depois de "R$" (não quebra a linha ali); os testes comparam com espaço comum. */
const plain = (payload: PushPayload) => ({ ...payload, body: payload.body.replace(/\u00a0/g, ' ') });

describe('avisos no app instalado', () => {
  it('pedido e pagamento: dois avisos com a mesma tag (o pago substitui o solicitado), sem a chave Pix', async () => {
    await configured();
    const me = await player();
    await subscribeDevice(me);
    await grantPrizes(me, 10000);
    const result = await requested(me, 4000, { keyType: 'EMAIL', keyValue: 'jogador@exemplo.com' });
    expect(pushes.map(plain)).toEqual([
      {
        title: 'Saque solicitado',
        body: 'Seu saque de R$ 40,00 está sendo processado. Não foi você? Troque sua senha e fale com o suporte.',
        url: '/saques',
        tag: `withdrawal:${result.withdrawal.id}`,
      },
    ]);

    [...fake.payouts.values()][0]!.state = 'COMPLETO';
    await withdrawals.reconcile(await tenantId('aurora'), result.withdrawal.id);
    await withdrawals.idle();
    expect(plain(pushes[1]!)).toEqual({
      title: 'Saque pago',
      body: 'R$ 40,00 enviado via Pix para a sua chave.',
      url: '/saques',
      tag: `withdrawal:${result.withdrawal.id}`,
    });
    expect(JSON.stringify(pushes)).not.toContain('jogador@exemplo.com');

    // Conferir de novo um saque já pago não avisa outra vez.
    await withdrawals.reconcile(await tenantId('aurora'), result.withdrawal.id);
    await withdrawals.idle();
    expect(pushes).toHaveLength(2);
  });

  it('em análise avisa a análise; o mesmo pedido repetido não avisa de novo; recusado e não pago não avisam "pago"', async () => {
    const manager = await configured();
    const me = await player();
    await subscribeDevice(me);
    await grantPrizes(me, 100000);
    const key = randomUUID();
    const first = await requested(me, 30000, { idempotencyKey: key });
    await requested(me, 30000, { idempotencyKey: key });
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.body).toContain('está em análise pela banca');

    await manager.http.post(`/v1/admin/withdrawals/${first.withdrawal.id}/review`, { approve: false });
    await withdrawals.idle();
    fake.failSend = { status: 500 };
    const lost = await requested(me, 3000);
    await age('aurora', lost.withdrawal.id, 'send_started_at', 11);
    await manager.http.post(`/v1/admin/withdrawals/${lost.withdrawal.id}/resolve`, { paid: false });
    await withdrawals.idle();
    expect(pushes.map((p) => p.title)).toEqual(['Saque solicitado', 'Saque solicitado']);
  });

  it('concluído à mão como pago também avisa', async () => {
    const manager = await configured();
    const me = await player();
    await subscribeDevice(me);
    await grantPrizes(me, 10000);
    fake.failSend = { status: 500 };
    const lost = await requested(me, 2500);
    await age('aurora', lost.withdrawal.id, 'send_started_at', 11);
    expect(
      (await manager.http.post(`/v1/admin/withdrawals/${lost.withdrawal.id}/resolve`, { paid: true })).status,
    ).toBe(200);
    await withdrawals.idle();
    expect(pushes.at(-1)).toMatchObject({ title: 'Saque pago', tag: `withdrawal:${lost.withdrawal.id}` });
  });

  it('avisa só o dono do saque; falha no envio do aviso não afeta o saque', async () => {
    await configured();
    const me = await player();
    const other = await player();
    await subscribeDevice(other);
    await grantPrizes(me, 10000);
    await requested(me, 2000);
    expect(pushes).toEqual([]);

    await subscribeDevice(me);
    pushFails = true;
    const result = await requested(me, 2000);
    expect(result.withdrawal.status).toBe('PROCESSING');
    expect(await prizes(me)).toEqual({ jb: 6000, games: 0 });
  });

  it('texto dos avisos', () => {
    expect(plain(withdrawalPush('requested', { id: 'w', amountCents: 123456, status: 'QUEUED' })).body).toBe(
      'Seu saque de R$ 1.234,56 está sendo processado. Não foi você? Troque sua senha e fale com o suporte.',
    );
    expect(plain(withdrawalPush('paid', { id: 'w', amountCents: 100, status: 'PAID' }))).toEqual({
      title: 'Saque pago',
      body: 'R$ 1,00 enviado via Pix para a sua chave.',
      url: '/saques',
      tag: 'withdrawal:w',
    });
  });
});
