import { randomBytes, randomUUID } from 'node:crypto';
import { type IncomingMessage, type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import type {
  AdminDepositList,
  AdminPaymentSettings,
  LoginResponse,
  PaymentGatewayTestResult,
  PublicDeposit,
  PublicDepositStatus,
} from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { credentialsHint, openCredentials, sealCredentials } from '../src/payments/credentials-box.js';
import { DepositsService, publicDomain } from '../src/payments/deposits.service.js';
import { reaisToCents } from '../src/payments/misticpay.gateway.js';
import { loadPaymentsConfig } from '../src/payments/payments.config.js';
import {
  SYNTHETIC_PASSWORD,
  api,
  asTenant,
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
const PIX_CODE = '00020101021226820014br.gov.bcb.pix2560qrcode.exemplo.test/pix/abc5204000053039865802BR6304ABCD';

interface FakeCharge {
  transactionId: string;
  /** Id da transação na MisticPay (volta na criação e no aviso). */
  providerId: string;
  amount: number;
  payerName: string;
  payerDocument: string;
  projectWebhook?: string;
  state: 'PENDENTE' | 'COMPLETO' | 'FALHA' | 'CANCELADO';
  /** Valor pago informado na consulta (reais); padrão: o cobrado. */
  paid?: number;
}

/** MisticPay falsa: cria cobranças, responde a consulta e o saldo; confere a credencial Basic. */
const fake = {
  charges: new Map<string, FakeCharge>(),
  /** Próxima criação responde com este status HTTP (simula recusa/queda). */
  failCreate: null as number | null,
  checks: 0,
  creates: 0,
};
let fakeServer: Server;
let fakeUrl: string;

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
    req.on('end', () => resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}));
  });
}

let app: INestApplication;
let deposits: DepositsService;
const SECRET = randomBytes(24).toString('hex');

beforeAll(async () => {
  fakeServer = createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const expected = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
    if (req.headers.authorization !== expected) return send(401, { message: 'Credenciais inválidas' });
    const body = await readBody(req);
    if (req.url === '/api/transactions/create' && req.method === 'POST') {
      fake.creates += 1;
      if (fake.failCreate) return send(fake.failCreate, { message: 'recusado' });
      const charge: FakeCharge = {
        transactionId: String(body.transactionId),
        providerId: `9${fake.creates}`,
        amount: Number(body.amount),
        payerName: String(body.payerName),
        payerDocument: String(body.payerDocument),
        ...(typeof body.projectWebhook === 'string' ? { projectWebhook: body.projectWebhook } : {}),
        state: 'PENDENTE',
      };
      fake.charges.set(charge.transactionId, charge);
      return send(201, {
        message: 'Transação criada com sucesso',
        data: { transactionId: charge.providerId, transactionState: 'PENDENTE', copyPaste: PIX_CODE },
      });
    }
    if (req.url === '/api/transactions/check' && req.method === 'POST') {
      fake.checks += 1;
      const charge = fake.charges.get(String(body.transactionId));
      if (!charge) return send(404, { message: 'Transação não encontrada' });
      return send(200, {
        transaction: {
          transactionId: charge.transactionId,
          value: charge.paid ?? charge.amount,
          fee: 0.1,
          transactionState: charge.state,
          transactionType: 'DEPOSITO',
          transactionMethod: 'PIX',
        },
      });
    }
    if (req.url === '/api/users/balance' && req.method === 'GET') {
      return send(200, { data: { balance: 1234.56 } });
    }
    return send(404, {});
  });
  await new Promise<void>((resolve) => fakeServer.listen(0, '127.0.0.1', resolve));
  fakeUrl = `http://127.0.0.1:${(fakeServer.address() as AddressInfo).port}/api/`;

  const payments = loadPaymentsConfig({ PAYMENTS_SECRET_KEY: SECRET, MISTICPAY_API_URL: fakeUrl })!;
  app = await startApp({ payments: { ...payments, sweepIntervalMs: null } });
  deposits = app.get(DepositsService);
});

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve) => fakeServer.close(() => resolve()));
});

beforeEach(async () => {
  await resetUsers();
  fake.charges.clear();
  fake.failCreate = null;
  fake.checks = 0;
  fake.creates = 0;
});

async function player(tenant: 'aurora' | 'boreal' = 'aurora') {
  const person = await createUser(app, tenant);
  const login = await api(app, tenant).post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return {
    ...person,
    http: api(app, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token }),
  };
}

/** Gerente da banca com a MisticPay configurada e ativa. */
async function configured(tenant: 'aurora' | 'boreal' = 'aurora') {
  const manager = await loginOperator(app, tenant);
  const res = await manager.http.put('/v1/admin/payments/MISTICPAY', {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    activate: true,
  });
  expect(res.status).toBe(200);
  return manager;
}

async function deposit(
  who: Awaited<ReturnType<typeof player>>,
  amountCents = 2550,
  destination: 'LOTTERIES' | 'GAMES' = 'LOTTERIES',
) {
  const res = await who.http.post('/v1/payments/deposits', { amountCents, destination });
  expect(res.status).toBe(201);
  return res.body as PublicDeposit;
}

/** Consulta como dona das tabelas, dentro da banca (o RLS forçado vale também para a dona). */
async function owner<T extends Record<string, unknown>>(
  tenant: 'aurora' | 'boreal',
  sql: string,
  params: unknown[] = [],
) {
  const id = await tenantId(tenant);
  return asTenant(
    migratorPool,
    id,
    async (c) => (await (params.length ? c.query<T>(sql, params) : c.query<T>(sql))).rows,
  );
}

async function walletOf(tenant: 'aurora' | 'boreal', userId: string) {
  const id = await tenantId(tenant);
  return asTenant(migratorPool, id, async (c) => {
    const { rows } = await c.query<{ balance_jb: string; balance_games: string }>(
      'SELECT balance_jb, balance_games FROM wallets WHERE user_id = $1',
      [userId],
    );
    return { jb: Number(rows[0]!.balance_jb), games: Number(rows[0]!.balance_games) };
  });
}

/** Status do depósito pela tela do jogador, sem esperar os 5 s entre consultas ao gateway. */
async function poll(who: Awaited<ReturnType<typeof player>>, id: string) {
  await owner(
    'aurora',
    "UPDATE pix_deposits SET last_checked_at = NULL WHERE id = $1 AND status NOT IN ('PAID', 'REJECTED')",
    [id],
  );
  const res = await who.http.get(`/v1/payments/deposits/${id}`);
  expect(res.status).toBe(200);
  return res.body as PublicDepositStatus;
}

/**
 * Aviso de depósito da MisticPay (endereço assinado), como ela manda: o id da transação dela e quem pagou.
 * `providerId` troca o id da transação (aviso de outra cobrança).
 */
async function notify(
  created: PublicDeposit,
  payerDocument: string,
  options: { providerId?: string; tenant?: 'aurora' | 'boreal' } = {},
) {
  const charge = fake.charges.get(created.id)!;
  const res = await api(app, options.tenant ?? 'aurora')
    .raw()
    .post(`/v1/integrations/payments/misticpay?d=${created.id}&t=${deposits.sign('MISTICPAY', created.id)}`)
    .send({
      transactionId: Number(options.providerId ?? charge.providerId),
      transactionType: 'DEPOSITO',
      transactionMethod: 'PIX',
      clientName: 'Pagador Sintético',
      clientDocument: payerDocument,
      status: charge.state,
      value: charge.amount,
      fee: 0.1,
      e2e: 'E0000000000000000000000000000000',
      ispb: '18236120',
      bankName: 'BANCO SINTÉTICO',
    });
  expect(res.status).toBe(200);
}

/** Situação e pagador gravados do depósito (como dona, dentro da banca). */
async function stored(id: string, tenant: 'aurora' | 'boreal' = 'aurora') {
  const [row] = await owner<{ status: string; payer_document: string | null; review_reason: string | null }>(
    tenant,
    'SELECT status, payer_document, review_reason FROM pix_deposits WHERE id = $1',
    [id],
  );
  return row!;
}

describe('peças', () => {
  it('cifra amarrada à banca e ao gateway; pista sem revelar a credencial', () => {
    const key = randomBytes(32);
    const sealed = sealCredentials(key, 'banca-a', 'MISTICPAY', { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
    expect(sealed.toString('utf8')).not.toContain(CLIENT_SECRET);
    expect(openCredentials(key, 'banca-a', 'MISTICPAY', sealed)).toEqual({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
    expect(openCredentials(key, 'banca-b', 'MISTICPAY', sealed)).toBeNull();
    expect(openCredentials(randomBytes(32), 'banca-a', 'MISTICPAY', sealed)).toBeNull();
    expect(credentialsHint('pk_abcdefgh1234')).toBe('pk_…1234');
    expect(credentialsHint('semprefixo"<9')).toBe('…o**9');
  });

  it('reais com casas decimais viram centavos; domínio público para o aviso', () => {
    expect(reaisToCents(25.5)).toBe(2550);
    expect(reaisToCents('1.12')).toBe(112);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(reaisToCents(-1)).toBeNull();
    expect(reaisToCents('abc')).toBeNull();
    expect(publicDomain('trevo.com.br')).toBe(true);
    expect(publicDomain('aurora.test')).toBe(false);
    expect(publicDomain('trevo.localhost')).toBe(false);
    expect(publicDomain('localhost')).toBe(false);
  });

  it('sem PAYMENTS_SECRET_KEY ficam desligados; chave curta é recusada', () => {
    expect(loadPaymentsConfig({})).toBeNull();
    expect(() => loadPaymentsConfig({ PAYMENTS_SECRET_KEY: 'curta' })).toThrow(/PAYMENTS_SECRET_KEY/);
    expect(() =>
      loadPaymentsConfig({ PAYMENTS_SECRET_KEY: SECRET, MISTICPAY_API_URL: 'http://api.misticpay.com/api' }),
    ).toThrow(/HTTPS/);
  });
});

describe('Configurações > Pagamentos', () => {
  it('Gerente grava (cifrado), testa e ativa; a credencial nunca volta; auditoria sem a credencial', async () => {
    const manager = await loginOperator(app, 'aurora');
    const before = await manager.http.get('/v1/admin/payments');
    expect(before.status).toBe(200);
    expect(before.body).toEqual({
      available: true,
      gateways: [
        {
          gateway: 'MISTICPAY',
          configured: false,
          active: false,
          credentialsHint: null,
          updatedAt: null,
          updatedBy: null,
        },
      ],
    });

    const saved = await manager.http.put('/v1/admin/payments/MISTICPAY', {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      activate: false,
    });
    expect(saved.status).toBe(200);
    const settings = saved.body as AdminPaymentSettings;
    expect(settings.gateways[0]).toMatchObject({
      configured: true,
      active: false,
      credentialsHint: `pk_…${CLIENT_ID.slice(-4)}`,
    });
    expect(JSON.stringify(saved.body)).not.toContain(CLIENT_SECRET);

    // No banco, só o texto cifrado.
    const rows = await owner<{ credentials: Buffer }>('aurora', 'SELECT credentials FROM payment_gateways');
    expect(rows[0]!.credentials.toString('latin1')).not.toContain(CLIENT_SECRET);
    expect(rows[0]!.credentials.toString('latin1')).not.toContain(CLIENT_ID);

    const test = await manager.http.post('/v1/admin/payments/MISTICPAY/test', {});
    expect(test.status).toBe(200);
    expect(test.body as PaymentGatewayTestResult).toEqual({
      ok: true,
      message: 'Conexão com a MisticPay funcionando.',
      balanceCents: 123456,
    });

    const active = await manager.http.put('/v1/admin/payments/MISTICPAY/active', { active: true });
    expect(active.status).toBe(200);
    expect((active.body as AdminPaymentSettings).gateways[0]!.active).toBe(true);

    const audit = await owner<{ action: string; details: unknown }>(
      'aurora',
      'SELECT action, details FROM audit_logs ORDER BY created_at, action',
    );
    expect(audit.map((r) => r.action).sort()).toEqual(['payment.gateway.activate', 'payment.gateway.update']);
    expect(audit[0]!.details).toMatchObject({ gateway: 'MISTICPAY' });
    expect(JSON.stringify(audit)).not.toContain(CLIENT_SECRET);
    expect(JSON.stringify(audit)).not.toContain(CLIENT_ID);
  });

  it('credencial errada: o teste avisa sem derrubar nada', async () => {
    const manager = await loginOperator(app, 'aurora');
    await manager.http.put('/v1/admin/payments/MISTICPAY', {
      clientId: CLIENT_ID,
      clientSecret: `sk_${randomBytes(16).toString('hex')}`,
      activate: false,
    });
    const test = await manager.http.post('/v1/admin/payments/MISTICPAY/test', {});
    expect(test.status).toBe(200);
    expect(test.body).toMatchObject({ ok: false, message: 'Credenciais recusadas pela MisticPay.' });
  });

  it('Financeiro consulta, mas não grava; Suporte nem consulta; gateway desconhecido é recusado', async () => {
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.get('/v1/admin/payments')).status).toBe(200);
    const put = await finance.http.put('/v1/admin/payments/MISTICPAY', {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      activate: true,
    });
    expect(put.status).toBe(403);
    expect((await finance.http.post('/v1/admin/payments/MISTICPAY/test', {})).status).toBe(403);

    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get('/v1/admin/payments')).status).toBe(403);

    const manager = await loginOperator(app, 'aurora');
    const unknown = await manager.http.put('/v1/admin/payments/PAGSEGURO', {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      activate: true,
    });
    expect(unknown.status).toBe(400);
    const spaces = await manager.http.put('/v1/admin/payments/MISTICPAY', {
      clientId: 'pk_ com espaço',
      clientSecret: CLIENT_SECRET,
      activate: true,
    });
    expect(spaces.status).toBe(400);
  });

  it('o banco confere o perfil de novo: operador que não é Gerente não grava nem com a role de runtime', async () => {
    await loginOperator(app, 'aurora', { role: 'FINANCE' });
    const id = await tenantId('aurora');
    const rows = await owner<{ id: string }>('aurora', "SELECT id FROM operators WHERE role = 'FINANCE'");
    await expect(
      asTenant(runtimePool, id, (c) =>
        c.query("SELECT payment_gateway_save($1, 'MISTICPAY', '\\x00'::bytea, 'pk_…1234', true)", [rows[0]!.id]),
      ),
    ).rejects.toThrow(/not allowed/);
    // E a role de runtime não grava na tabela diretamente.
    await expect(
      asTenant(runtimePool, id, (c) => c.query('UPDATE payment_gateways SET active = true WHERE tenant_id = $1', [id])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('Recarga Pix', () => {
  it('sem gateway ativo: Pix indisponível (503) e nada é gravado', async () => {
    const who = await player();
    const res = await who.http.post('/v1/payments/deposits', { amountCents: 2550, destination: 'LOTTERIES' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
    expect(await owner('aurora', 'SELECT 1 FROM pix_deposits')).toHaveLength(0);
  });

  it('cria a cobrança com o id do depósito e o CPF do jogador; pago pelo titular = creditado uma vez só', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who, 2550);
    expect(created).toMatchObject({
      amountCents: 2550,
      destination: 'LOTTERIES',
      status: 'PENDING',
      pixCode: PIX_CODE,
    });

    const charge = fake.charges.get(created.id)!;
    expect(charge).toMatchObject({ amount: 25.5, payerDocument: who.document, payerName: who.name });
    // Domínio de teste não é público: a cobrança vai sem endereço de aviso (a conferência fica com a tela e a rodada).
    expect(charge.projectWebhook).toBeUndefined();

    expect((await poll(who, created.id)).deposit.status).toBe('PENDING');

    // Pago no gateway, mas o aviso com quem pagou ainda não chegou: não credita (aguarda o titular).
    charge.state = 'COMPLETO';
    expect((await poll(who, created.id)).deposit.status).toBe('PENDING');
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 0, games: 0 });

    // O aviso traz o CPF do próprio jogador (com pontuação): credita.
    await notify(
      created,
      `${who.document.slice(0, 3)}.${who.document.slice(3, 6)}.${who.document.slice(6, 9)}-${who.document.slice(9)}`,
    );
    const paid = await poll(who, created.id);
    expect(paid.deposit.status).toBe('PAID');
    expect(paid.deposit.paidAt).not.toBeNull();
    expect(paid.wallet?.balanceJb).toBe(2550);
    expect((await stored(created.id)).payer_document).toBe(who.document);

    // Conferir de novo (tela, aviso, rodada) não credita outra vez.
    await deposits.reconcile(await tenantId('aurora'), created.id, { onlyPending: false });
    expect((await poll(who, created.id)).wallet?.balanceJb).toBe(2550);
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 2550, games: 0 });
    const entries = await owner<{ kind: string; balance_jb_delta: string }>(
      'aurora',
      'SELECT kind, balance_jb_delta FROM wallet_entries WHERE pix_deposit_id = $1',
      [created.id],
    );
    expect(entries).toEqual([{ kind: 'DEPOSIT', balance_jb_delta: '2550' }]);
  });

  it('destino Games credita o saldo de games', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who, 10000, 'GAMES');
    fake.charges.get(created.id)!.state = 'COMPLETO';
    await notify(created, who.document);
    const paid = await poll(who, created.id);
    expect(paid.wallet).toMatchObject({ balanceJb: 0, balanceGames: 10000 });
  });

  it('valor pago diferente do cobrado: não credita e o depósito continua pendente', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who, 5000);
    const charge = fake.charges.get(created.id)!;
    charge.state = 'COMPLETO';
    charge.paid = 1;
    await notify(created, who.document);
    const status = await poll(who, created.id);
    expect(status.deposit.status).toBe('PENDING');
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 0, games: 0 });
  });

  it('recusado/cancelado no gateway vira CANCELED; pagamento atrasado pelo aviso ainda é creditado', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who, 3000);
    const charge = fake.charges.get(created.id)!;
    charge.state = 'CANCELADO';
    expect((await poll(who, created.id)).deposit.status).toBe('CANCELED');

    // O gateway depois confirma: o aviso confere de novo e credita.
    charge.state = 'COMPLETO';
    await notify(created, who.document);
    expect((await poll(who, created.id)).deposit.status).toBe('PAID');
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 3000, games: 0 });
  });

  it('aviso do gateway: assinatura errada = 401 e nada é consultado; o corpo nunca credita sozinho', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who, 2000);
    const checksBefore = fake.checks;

    const forged = await api(app, 'aurora')
      .raw()
      .post(`/v1/integrations/payments/misticpay?d=${created.id}&t=${'A'.repeat(43)}`)
      .send({ transactionId: created.id, status: 'COMPLETO', value: 20 });
    expect(forged.status).toBe(401);
    const otherDeposit = await api(app, 'aurora')
      .raw()
      .post(`/v1/integrations/payments/misticpay?d=${randomUUID()}&t=${deposits.sign('MISTICPAY', created.id)}`)
      .send({});
    expect(otherDeposit.status).toBe(401);
    expect((await api(app, 'aurora').raw().post('/v1/integrations/payments/misticpay').send({})).status).toBe(401);
    expect(fake.checks).toBe(checksBefore);

    // Assinatura certa, mas o gateway diz que ainda está pendente: nada muda, mesmo com o corpo dizendo "pago".
    const signed = await api(app, 'aurora')
      .raw()
      .post(`/v1/integrations/payments/misticpay?d=${created.id}&t=${deposits.sign('MISTICPAY', created.id)}`)
      .send({ transactionId: created.id, status: 'COMPLETO', value: 20 });
    expect(signed.status).toBe(200);
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 0, games: 0 });
  });

  it('rodada automática confere os pendentes de todas as bancas', async () => {
    await configured('aurora');
    await configured('boreal');
    const a = await player('aurora');
    const b = await player('boreal');
    const da = await deposit(a, 1500);
    const db = await deposit(b, 2500);
    // O aviso com o titular chega primeiro (o gateway ainda diz pendente): nada é creditado ainda.
    await notify(da, a.document);
    await notify(db, b.document, { tenant: 'boreal' });
    expect(await walletOf('aurora', a.id)).toEqual({ jb: 0, games: 0 });
    // Criados há mais de 1 minuto (a rodada não pega o que acabou de ser criado). A data de criação é imutável: o
    // trigger sai do caminho só nesta transação de teste.
    for (const tenant of ['aurora', 'boreal'] as const) {
      await owner(
        tenant,
        `ALTER TABLE pix_deposits DISABLE TRIGGER pix_deposits_guard;
         UPDATE pix_deposits SET created_at = now() - interval '5 minutes', last_checked_at = NULL;
         ALTER TABLE pix_deposits ENABLE TRIGGER pix_deposits_guard;`,
      );
    }
    fake.charges.get(da.id)!.state = 'COMPLETO';
    fake.charges.get(db.id)!.state = 'COMPLETO';

    expect(await deposits.sweep()).toBe(2);
    expect(await walletOf('aurora', a.id)).toEqual({ jb: 1500, games: 0 });
    expect(await walletOf('boreal', b.id)).toEqual({ jb: 2500, games: 0 });
    // Já pagos: a próxima rodada não tem o que conferir.
    expect(await deposits.sweep()).toBe(0);
  });

  it('pago por outro CPF: não credita, fica em análise; a tela do jogador vê "em análise"', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who, 4000);
    fake.charges.get(created.id)!.state = 'COMPLETO';
    await notify(created, '52998224725');
    const status = await poll(who, created.id);
    expect(status.deposit.status).toBe('REVIEW');
    expect(status.wallet).toBeNull();
    expect(await stored(created.id)).toEqual({
      status: 'REVIEW',
      payer_document: '52998224725',
      review_reason: 'PAYER_MISMATCH',
    });
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 0, games: 0 });
    // Outro aviso (mesmo com o CPF certo) não troca o pagador nem tira da análise.
    await notify(created, who.document);
    expect(await stored(created.id)).toMatchObject({ status: 'REVIEW', payer_document: '52998224725' });
  });

  it('pago e o aviso com o pagador não chega em 15 min: vai para análise (nunca credita sem conferir)', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who, 2000);
    fake.charges.get(created.id)!.state = 'COMPLETO';
    expect((await poll(who, created.id)).deposit.status).toBe('PENDING');
    await owner(
      'aurora',
      `ALTER TABLE pix_deposits DISABLE TRIGGER pix_deposits_guard;
       UPDATE pix_deposits SET payment_seen_at = now() - interval '16 minutes';
       ALTER TABLE pix_deposits ENABLE TRIGGER pix_deposits_guard;`,
    );
    expect((await poll(who, created.id)).deposit.status).toBe('REVIEW');
    expect((await stored(created.id)).review_reason).toBe('PAYER_UNKNOWN');
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 0, games: 0 });
  });

  it('aviso de outra transação ou com CPF mascarado: o pagador é ignorado', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who, 2000);
    fake.charges.get(created.id)!.state = 'COMPLETO';
    await notify(created, who.document, { providerId: '123456789' });
    expect((await stored(created.id)).payer_document).toBeNull();
    await notify(created, '529.***.***-25');
    expect((await stored(created.id)).payer_document).toBeNull();
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 0, games: 0 });
  });

  it('Gerente libera o crédito ou recusa o depósito em análise; auditado; outros perfis não', async () => {
    const manager = await configured();
    const who = await player();
    const first = await deposit(who, 4000);
    const second = await deposit(who, 1500, 'GAMES');
    for (const d of [first, second]) {
      fake.charges.get(d.id)!.state = 'COMPLETO';
      await notify(d, '52998224725');
    }
    expect((await stored(first.id)).status).toBe('REVIEW');

    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.post(`/v1/admin/deposits/${first.id}/review`, { approve: true })).status).toBe(403);

    const approved = await manager.http.post(`/v1/admin/deposits/${first.id}/review`, { approve: true });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({
      status: 'PAID',
      payer: { name: 'Pagador Sintético', document: '52998224725' },
      payerMatches: false,
      reviewReason: 'PAYER_MISMATCH',
      reviewedBy: { name: expect.any(String) },
    });
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 4000, games: 0 });

    const rejected = await manager.http.post(`/v1/admin/deposits/${second.id}/review`, { approve: false });
    expect(rejected.status).toBe(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED' });
    expect(await walletOf('aurora', who.id)).toEqual({ jb: 4000, games: 0 });

    // Já decididos: não há o que liberar de novo (409); inexistente = 404.
    expect((await manager.http.post(`/v1/admin/deposits/${first.id}/review`, { approve: true })).status).toBe(409);
    expect((await manager.http.post(`/v1/admin/deposits/${second.id}/review`, { approve: true })).status).toBe(409);
    expect((await manager.http.post(`/v1/admin/deposits/${randomUUID()}/review`, { approve: true })).status).toBe(404);
    // Recusado é final: o gateway confirmar de novo não muda nada.
    await deposits.reconcile(await tenantId('aurora'), second.id, { onlyPending: false });
    expect((await stored(second.id)).status).toBe('REJECTED');

    const audit = await owner<{ action: string; details: { amount: number } }>(
      'aurora',
      "SELECT action, details FROM audit_logs WHERE action LIKE 'deposit.%' ORDER BY created_at",
    );
    expect(audit.map((a) => [a.action, a.details.amount])).toEqual([
      ['deposit.approve', 4000],
      ['deposit.reject', 1500],
    ]);
    expect(JSON.stringify(audit)).not.toContain('52998224725');
  });

  it('depósito pendente (sem pagamento) não pode ser liberado pelo painel; o banco confere o Gerente', async () => {
    const manager = await configured();
    const who = await player();
    const created = await deposit(who, 2000);
    expect((await manager.http.post(`/v1/admin/deposits/${created.id}/review`, { approve: true })).status).toBe(409);
    await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    const [support] = await owner<{ id: string }>('aurora', "SELECT id FROM operators WHERE role = 'SUPPORT'");
    const id = await tenantId('aurora');
    await expect(
      asTenant(runtimePool, id, (c) => c.query('SELECT pix_deposit_review($1, $2, true)', [support!.id, created.id])),
    ).rejects.toThrow(/not allowed/);
    // E a role de runtime não grava o pagador por fora da função.
    await expect(
      asTenant(runtimePool, id, (c) => c.query("UPDATE pix_deposits SET payer_document = '52998224725'")),
    ).rejects.toThrow(/permission denied/);
  });

  it('gateway recusa a criação: 503 e o depósito fica cancelado', async () => {
    await configured();
    const who = await player();
    fake.failCreate = 422;
    const res = await who.http.post('/v1/payments/deposits', { amountCents: 2000, destination: 'LOTTERIES' });
    expect(res.status).toBe(503);
    expect(await owner('aurora', 'SELECT status FROM pix_deposits')).toEqual([{ status: 'CANCELED' }]);
  });

  it('limites: valor fora da faixa (400) e no máximo 5 cobranças abertas (429)', async () => {
    await configured();
    const who = await player();
    expect((await who.http.post('/v1/payments/deposits', { amountCents: 99, destination: 'LOTTERIES' })).status).toBe(
      400,
    );
    expect(
      (await who.http.post('/v1/payments/deposits', { amountCents: 1_000_001, destination: 'LOTTERIES' })).status,
    ).toBe(400);
    expect((await who.http.post('/v1/payments/deposits', { amountCents: 10.5, destination: 'LOTTERIES' })).status).toBe(
      400,
    );
    expect((await who.http.post('/v1/payments/deposits', { amountCents: 1000, destination: 'CASSINO' })).status).toBe(
      400,
    );
    for (let i = 0; i < 5; i += 1) await deposit(who, 1000);
    const sixth = await who.http.post('/v1/payments/deposits', { amountCents: 1000, destination: 'LOTTERIES' });
    expect(sixth.status).toBe(429);
  });

  it('cada jogador só vê o próprio depósito; outra banca não enxerga', async () => {
    await configured();
    const owner = await player();
    const other = await player();
    const created = await deposit(owner);
    expect((await other.http.get(`/v1/payments/deposits/${created.id}`)).status).toBe(404);
    const elsewhere = await player('boreal');
    expect((await elsewhere.http.get(`/v1/payments/deposits/${created.id}`)).status).toBe(404);
    expect((await owner.http.get('/v1/payments/deposits/nao-e-uuid')).status).toBe(400);
  });

  it('a role de runtime não marca como pago nem altera o depósito por fora das funções', async () => {
    await configured();
    const who = await player();
    const created = await deposit(who);
    const id = await tenantId('aurora');
    await expect(
      asTenant(runtimePool, id, (c) => c.query("UPDATE pix_deposits SET status = 'PAID', paid_at = now()")),
    ).rejects.toThrow(/permission denied/);
    await expect(asTenant(runtimePool, id, (c) => c.query('UPDATE pix_deposits SET amount_cents = 1'))).rejects.toThrow(
      /permission denied/,
    );
    // Valor errado na função: recusado (SJ011), sem crédito.
    await expect(
      asTenant(runtimePool, id, (c) => c.query('SELECT pix_deposit_confirm($1, 1)', [created.id])),
    ).rejects.toThrow(/differs/);
    // Pago é final, nem a dona altera.
    fake.charges.get(created.id)!.state = 'COMPLETO';
    await notify(created, who.document);
    await poll(who, created.id);
    await expect(
      asTenant(migratorPool, id, (c) =>
        c.query("UPDATE pix_deposits SET status = 'CANCELED' WHERE id = $1", [created.id]),
      ),
    ).rejects.toThrow(/final/);
    await expect(
      asTenant(migratorPool, id, (c) => c.query('DELETE FROM pix_deposits WHERE id = $1', [created.id])),
    ).rejects.toThrow(/never deleted/);
  });
});

describe('Carteira > Depósitos (painel)', () => {
  it('lista do período com filtros e o total pago', async () => {
    const manager = await configured();
    const a = await player();
    const b = await player();
    const paid = await deposit(a, 2000);
    await deposit(a, 3000);
    await deposit(b, 4000, 'GAMES');
    fake.charges.get(paid.id)!.state = 'COMPLETO';
    await notify(paid, a.document);
    await poll(a, paid.id);

    const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const all = await manager.http.get(`/v1/admin/deposits?from=${today}&to=${today}`);
    expect(all.status).toBe(200);
    const list = all.body as AdminDepositList;
    expect(list.total).toBe(3);
    expect(list.paidTotalCents).toBe(2000);
    expect(list.items.map((i) => i.amountCents)).toEqual([4000, 3000, 2000]);
    expect(list.items[0]).toMatchObject({ gateway: 'MISTICPAY', destination: 'GAMES', status: 'PENDING' });
    expect(list.items[0]!.user).toEqual({ id: b.id, displayId: b.displayId, name: b.name });
    expect(list.items[0]).toMatchObject({ payer: null, payerMatches: null, reviewReason: null });
    expect(list.items[2]).toMatchObject({
      status: 'PAID',
      payer: { name: 'Pagador Sintético', document: a.document },
      payerMatches: true,
    });

    const onlyA = (await manager.http.get(`/v1/admin/deposits?from=${today}&to=${today}&userId=${a.id}&status=PAID`))
      .body as AdminDepositList;
    expect(onlyA.items.map((i) => i.id)).toEqual([paid.id]);

    // Outra banca não vê.
    const boreal = await loginOperator(app, 'boreal');
    expect(
      ((await boreal.http.get(`/v1/admin/deposits?from=${today}&to=${today}`)).body as AdminDepositList).total,
    ).toBe(0);
    // Todos os perfis consultam (mesma permissão do menu).
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    const supportView = await support.http.get(`/v1/admin/deposits?from=${today}&to=${today}`);
    expect(supportView.status).toBe(200);
    // Suporte (sem payments.read) não recebe nome nem CPF de quem pagou; só se foi o titular.
    const paidForSupport = (supportView.body as AdminDepositList).items.find((i) => i.id === paid.id)!;
    expect(paidForSupport).toMatchObject({ payer: null, payerMatches: true });
    expect(JSON.stringify(supportView.body)).not.toContain(a.document);
    // Financeiro (payments.read) recebe.
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    const financeView = (await finance.http.get(`/v1/admin/deposits?from=${today}&to=${today}`))
      .body as AdminDepositList;
    expect(financeView.items.find((i) => i.id === paid.id)!.payer).toEqual({
      name: 'Pagador Sintético',
      document: a.document,
    });
    expect((await manager.http.get(`/v1/admin/deposits?from=${today}&to=2020-01-01`)).status).toBe(400);
  });
});
