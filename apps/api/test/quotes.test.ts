import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type LoginResponse,
  type PublicQuotes,
  type SetFazendinhaQuotesRequest,
  defaultQuotes,
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

async function player(tenant: 'aurora' | 'boreal' = 'aurora', funds = 0) {
  const person = await createUser(app, tenant);
  if (funds) {
    await asTenant(migratorPool, await tenantId(tenant), (c) =>
      c.query("SELECT wallet_manual_adjust($1, $2, 0, 0, 'fundos de teste')", [person.id, funds]),
    );
  }
  const login = await api(app, tenant).post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return api(app, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token });
}

const traditionalBody = (quotes: PublicQuotes, changes: Record<string, number> = {}) => ({
  quotes: quotes.traditional.map((q) => ({ modality: q.modality, prizeCents: changes[q.modality] ?? q.prizeCents })),
});
const fazendinhaBody = (quotes: PublicQuotes, changes: Record<string, number> = {}): SetFazendinhaQuotesRequest => ({
  quotes: quotes.fazendinha.map((q) => ({
    mode: q.mode,
    stakeCents: q.stakeCents,
    prizeCents: changes[`${q.mode}|${q.stakeCents}`] ?? q.prizeCents,
  })),
});

describe('cotações', () => {
  it('sem nada salvo, vale a tabela padrão (800/1/8000), igual para o jogador e o painel', async () => {
    const http = await player();
    const res = await http.get('/v1/quotes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(defaultQuotes());
    expect(res.body.tableLabel).toBe('800/1/8000');
    expect(res.body.traditional.find((q: { modality: string }) => q.modality === 'grupo').prizeCents).toBe(2000);
    const ct100 = res.body.fazendinha.find(
      (q: { mode: string; stakeCents: number }) => q.mode === 'centena' && q.stakeCents === 10000,
    );
    expect(ct100.prizeCents).toBe(0);

    const session = await loginOperator(app, 'aurora');
    expect((await session.http.get('/v1/admin/quotes')).body).toEqual(defaultQuotes());
    expect((await api(app, 'aurora').get('/v1/quotes')).status).toBe(401);
  });

  it('Gerente edita o Tradicional: grava só o que mudou, audita e o nome da tabela acompanha', async () => {
    const session = await loginOperator(app, 'aurora');
    const base = defaultQuotes();
    const res = await session.http.put(
      '/v1/admin/quotes/tradicional',
      traditionalBody(base, { centena: 85000, grupo: 1850 }),
    );
    expect(res.status).toBe(200);
    expect(res.body.tableLabel).toBe('850/1/8000');
    expect(res.body.traditional.find((q: { modality: string }) => q.modality === 'grupo').prizeCents).toBe(1850);

    // Repetir a mesma tabela não gera nova auditoria.
    await session.http.put('/v1/admin/quotes/tradicional', traditionalBody(res.body));
    const audit = (await session.http.get('/v1/admin/audit?action=quote.update')).body.items;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      targetType: 'tenant',
      details: { fields: ['Tradicional GRUPO', 'Tradicional CENTENA'] },
    });

    const rows = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT modality FROM traditional_quotes ORDER BY modality'),
    );
    expect(rows.rows.map((r) => r.modality)).toEqual(['centena', 'grupo']);
  });

  it('salva só os itens enviados; vazio, repetido ou inválido é recusado', async () => {
    const session = await loginOperator(app, 'aurora');
    const put = (body: unknown) => session.http.put('/v1/admin/quotes/tradicional', body);
    const cases: unknown[] = [
      { quotes: [] },
      {
        quotes: [
          { modality: 'grupo', prizeCents: 1 },
          { modality: 'grupo', prizeCents: 2 },
        ],
      },
      { quotes: [{ modality: 'grupo', prizeCents: -1 }] },
      { quotes: [{ modality: 'grupo', prizeCents: 100_000_001 }] },
      { quotes: [{ modality: 'grupo', prizeCents: 1.5 }] },
      { quotes: [{ modality: 'inexistente', prizeCents: 1 }] },
    ];
    for (const body of cases) expect((await put(body)).status, JSON.stringify(body)).toBe(400);
    const faz = (body: unknown) => session.http.put('/v1/admin/quotes/fazendinha', body);
    expect((await faz({ quotes: [{ mode: 'grupo', stakeCents: 200, prizeCents: 1 }] })).status).toBe(400);

    const ok = await put({ quotes: [{ modality: 'grupo', prizeCents: 1900 }] });
    expect(ok.status).toBe(200);
    expect(ok.body.traditional.find((q: { modality: string }) => q.modality === 'grupo').prizeCents).toBe(1900);
    expect(ok.body.traditional.find((q: { modality: string }) => q.modality === 'milhar').prizeCents).toBe(800_000);
  });

  it('dois gerentes editando ao mesmo tempo: um não desfaz a alteração do outro', async () => {
    const a = await loginOperator(app, 'aurora');
    const b = await loginOperator(app, 'aurora');
    // Os dois abriram a página com a tabela padrão; cada um muda um item e salva.
    await a.http.put('/v1/admin/quotes/tradicional', { quotes: [{ modality: 'grupo', prizeCents: 1900 }] });
    await b.http.put('/v1/admin/quotes/tradicional', { quotes: [{ modality: 'centena', prizeCents: 85_000 }] });
    const final = (await a.http.get('/v1/admin/quotes')).body as PublicQuotes;
    const prize = (id: string) => final.traditional.find((q) => q.modality === id)!.prizeCents;
    expect([prize('grupo'), prize('centena')]).toEqual([1900, 85_000]);
  });

  it('Financeiro só consulta; Suporte não vê; cada banca tem a sua tabela', async () => {
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.get('/v1/admin/quotes')).status).toBe(200);
    expect((await finance.http.put('/v1/admin/quotes/tradicional', traditionalBody(defaultQuotes()))).status).toBe(403);
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get('/v1/admin/quotes')).status).toBe(403);

    const session = await loginOperator(app, 'aurora');
    await session.http.put('/v1/admin/quotes/tradicional', traditionalBody(defaultQuotes(), { milhar: 900000 }));
    expect((await (await player('boreal')).get('/v1/quotes')).body.tableLabel).toBe('800/1/8000');
    expect((await (await player('aurora')).get('/v1/quotes')).body.tableLabel).toBe('800/1/9000');
  });

  it('a Fazendinha compra pela cotação da banca: prêmio gravado no pule; valor com prêmio 0 não é vendido', async () => {
    const session = await loginOperator(app, 'aurora');
    await session.http.put(
      '/v1/admin/quotes/fazendinha',
      fazendinhaBody(defaultQuotes(), { 'grupo|100': 2500, 'grupo|300': 0 }),
    );
    const http = await player('aurora', 10_000);
    const bet = (stakeCents: number, numbers: number[], prizeCents: number) =>
      http.post('/v1/fazendinha/bets', {
        idempotencyKey: randomUUID(),
        drawDate: drawDateOf(new Date().toISOString(), 1),
        lottery: 'LT PT RIO 09HS',
        hour: 9,
        mode: 'grupo',
        stakeCents,
        prizeCents,
        numbers,
      });

    const ok = await bet(100, [1], 2500);
    expect(ok.status).toBe(201);
    expect(ok.body.bet).toMatchObject({ stakeCents: 100, prizeCents: 2500, quoteTable: '800/1/8000' });

    const off = await bet(300, [2], 6600);
    expect(off.status).toBe(400);
    expect(off.body.details[0]).toMatchObject({ field: 'stakeCents', message: 'Valor não disponível.' });

    // Mudar a cotação depois não muda o pule já vendido.
    await session.http.put('/v1/admin/quotes/fazendinha', fazendinhaBody(defaultQuotes(), { 'grupo|100': 3000 }));
    const stored = await asTenant(migratorPool, auroraId, (c) => c.query('SELECT prize_cents FROM fazendinha_bets'));
    expect(stored.rows).toEqual([{ prize_cents: 2500 }]);

    // Quem ainda vê o prêmio antigo (R$ 25) não compra pelo novo: recusa sem debitar nada.
    const stale = await bet(100, [2], 2500);
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('QUOTE_CHANGED');
    expect((await http.get('/v1/me')).body.wallet.balanceJb).toBe(10_000 - 100);
    expect((await bet(100, [2], 3000)).status).toBe(201);
  });
});
