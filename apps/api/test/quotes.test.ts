import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminQuoteTable,
  type AdminQuoteTableSummary,
  type LoginResponse,
  type PublicQuotes,
  type SetFazendinhaQuotesRequest,
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
let borealId: string;

beforeAll(async () => {
  app = await startApp();
  auroraId = await tenantId('aurora');
  borealId = await tenantId('boreal');
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

const TABLES = '/v1/admin/quote-tables';

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
  return { person, http: api(app, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token }) };
}

/** Aponta a unidade para uma tabela (o painel da unidade vem numa etapa seguinte; aqui direto no banco). */
const assignTable = (userId: string, tableId: string | null) =>
  asTenant(migratorPool, auroraId, (c) =>
    c.query('UPDATE users SET quote_table_id = $2 WHERE id = $1', [userId, tableId]),
  );

type Session = Awaited<ReturnType<typeof loginOperator>>;

async function defaultTable(session: Session): Promise<AdminQuoteTableSummary> {
  const res = await session.http.get(TABLES);
  expect(res.status).toBe(200);
  return (res.body as AdminQuoteTableSummary[]).find((t) => t.isDefault)!;
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
const prizeOf = (quotes: PublicQuotes, modality: string) => quotes.traditional.find((q) => q.modality === modality)!;

describe('tabelas de cotação', () => {
  it('sem nada salvo, vale a tabela padrão (800/1/8000); o painel grava a padrão ao listar', async () => {
    const { http } = await player();
    const res = await http.get('/v1/quotes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(defaultQuotes());
    expect(res.body.tableLabel).toBe('800/1/8000');
    const ct100 = res.body.fazendinha.find(
      (q: { mode: string; stakeCents: number }) => q.mode === 'centena' && q.stakeCents === 10000,
    );
    expect(ct100.prizeCents).toBe(0);
    expect((await api(app, 'aurora').get('/v1/quotes')).status).toBe(401);

    const session = await loginOperator(app, 'aurora');
    const list = await session.http.get(TABLES);
    expect(list.body).toEqual([
      { id: expect.any(String), name: '800/1/8000', isDefault: true, usersCount: 0, updatedAt: expect.any(String) },
    ]);
    // Listar de novo não cria outra.
    expect((await session.http.get(TABLES)).body).toHaveLength(1);
    const detail = await session.http.get(`${TABLES}/${list.body[0].id}`);
    expect(detail.body).toMatchObject({ ...defaultQuotes(), id: list.body[0].id, isDefault: true });
    expect((await http.get('/v1/quotes')).body).toEqual(defaultQuotes());
  });

  it('Gerente edita o Tradicional de uma tabela: grava só o que mudou, audita; o nome não muda, o rótulo sim', async () => {
    const session = await loginOperator(app, 'aurora');
    const table = await defaultTable(session);
    const res = await session.http.put(
      `${TABLES}/${table.id}/tradicional`,
      traditionalBody(defaultQuotes(), { centena: 85000, grupo: 1850 }),
    );
    expect(res.status).toBe(200);
    // Nome = o do painel; rótulo = os valores (centena/1/milhar), o que sai no pule.
    expect(res.body).toMatchObject({ id: table.id, name: '800/1/8000', tableLabel: '850/1/8000' });
    expect(prizeOf(res.body, 'grupo').prizeCents).toBe(1850);

    // Repetir a mesma tabela não gera nova auditoria.
    await session.http.put(`${TABLES}/${table.id}/tradicional`, traditionalBody(res.body));
    const audit = (await session.http.get('/v1/admin/audit?action=quote.update')).body.items;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      targetType: 'tenant',
      details: { fields: ['Tradicional GRUPO', 'Tradicional CENTENA'], quoteTable: '800/1/8000' },
    });

    const rows = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT modality, quote_table_id FROM traditional_quotes ORDER BY modality'),
    );
    expect(rows.rows).toEqual([
      { modality: 'centena', quote_table_id: table.id },
      { modality: 'grupo', quote_table_id: table.id },
    ]);
  });

  it('salva só os itens enviados; vazio, repetido ou inválido é recusado; tabela inexistente responde 404', async () => {
    const session = await loginOperator(app, 'aurora');
    const { id } = await defaultTable(session);
    const put = (body: unknown) => session.http.put(`${TABLES}/${id}/tradicional`, body);
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
    const faz = (body: unknown) => session.http.put(`${TABLES}/${id}/fazendinha`, body);
    expect((await faz({ quotes: [{ mode: 'grupo', stakeCents: 200, prizeCents: 1 }] })).status).toBe(400);

    const ok = await put({ quotes: [{ modality: 'grupo', prizeCents: 1900 }] });
    expect(ok.status).toBe(200);
    expect(prizeOf(ok.body, 'grupo').prizeCents).toBe(1900);
    expect(prizeOf(ok.body, 'milhar').prizeCents).toBe(800_000);

    const body = { quotes: [{ modality: 'grupo', prizeCents: 1 }] };
    expect((await session.http.put(`${TABLES}/${randomUUID()}/tradicional`, body)).status).toBe(404);
    expect((await session.http.put(`${TABLES}/nao-e-uuid/tradicional`, body)).status).toBe(400);
  });

  it('dois gerentes editando ao mesmo tempo: um não desfaz a alteração do outro', async () => {
    const a = await loginOperator(app, 'aurora');
    const b = await loginOperator(app, 'aurora');
    const { id } = await defaultTable(a);
    await a.http.put(`${TABLES}/${id}/tradicional`, { quotes: [{ modality: 'grupo', prizeCents: 1900 }] });
    await b.http.put(`${TABLES}/${id}/tradicional`, { quotes: [{ modality: 'centena', prizeCents: 85_000 }] });
    const final = (await a.http.get(`${TABLES}/${id}`)).body as AdminQuoteTable;
    expect([prizeOf(final, 'grupo').prizeCents, prizeOf(final, 'centena').prizeCents]).toEqual([1900, 85_000]);
  });

  it('cria (padrão ou cópia), renomeia, troca a padrão e exclui com as regras', async () => {
    const session = await loginOperator(app, 'aurora');
    const base = await defaultTable(session);
    await session.http.put(`${TABLES}/${base.id}/tradicional`, {
      quotes: [{ modality: 'milhar', prizeCents: 900_000 }],
    });

    const blank = await session.http.post(TABLES, { name: '  Tabela VIP  ' });
    expect(blank.status).toBe(201);
    expect(blank.body).toMatchObject({ name: 'Tabela VIP', tableLabel: '800/1/8000', isDefault: false, usersCount: 0 });
    expect(prizeOf(blank.body, 'milhar').prizeCents).toBe(800_000);

    const copy = await session.http.post(TABLES, { name: 'Cópia', copyFromId: base.id });
    expect(copy.status).toBe(201);
    expect(prizeOf(copy.body, 'milhar').prizeCents).toBe(900_000);
    // Editar a cópia não mexe na original.
    await session.http.put(`${TABLES}/${copy.body.id}/tradicional`, {
      quotes: [{ modality: 'milhar', prizeCents: 1 }],
    });
    expect(prizeOf((await session.http.get(`${TABLES}/${base.id}`)).body, 'milhar').prizeCents).toBe(900_000);

    // Nome único na banca, sem diferenciar maiúsculas; nome vazio ou longo demais é recusado.
    expect((await session.http.post(TABLES, { name: 'tabela vip' })).status).toBe(409);
    expect((await session.http.post(TABLES, { name: '   ' })).status).toBe(400);
    expect((await session.http.post(TABLES, { name: 'x'.repeat(41) })).status).toBe(400);
    expect((await session.http.post(TABLES, { name: 'Outra', copyFromId: randomUUID() })).status).toBe(404);
    expect((await session.http.patch(`${TABLES}/${copy.body.id}`, { name: 'TABELA VIP' })).status).toBe(409);
    const renamed = await session.http.patch(`${TABLES}/${copy.body.id}`, { name: 'Promo' });
    expect(renamed.body).toMatchObject({ name: 'Promo', tableLabel: '800/1/0,01' });

    // A padrão não sai; tabela com unidade apontando também não.
    expect((await session.http.delete(`${TABLES}/${base.id}`)).status).toBe(409);
    const { person } = await player();
    await assignTable(person.id, blank.body.id);
    const inUse = await session.http.delete(`${TABLES}/${blank.body.id}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body).toMatchObject({ code: 'QUOTE_TABLE_IN_USE', details: [{ field: 'usersCount', message: '1' }] });
    expect((await session.http.get(`${TABLES}/${blank.body.id}`)).body.usersCount).toBe(1);

    // Troca a padrão: exatamente uma marcada.
    const made = await session.http.post(`${TABLES}/${renamed.body.id}/default`, {});
    expect(made.status).toBe(200);
    expect(made.body.isDefault).toBe(true);
    const list = (await session.http.get(TABLES)).body as AdminQuoteTableSummary[];
    expect(list.filter((t) => t.isDefault).map((t) => t.name)).toEqual(['Promo']);
    expect(list[0]!.name).toBe('Promo');

    // A antiga padrão agora pode sair (os itens vão junto).
    expect((await session.http.delete(`${TABLES}/${base.id}`)).status).toBe(204);
    expect((await session.http.get(`${TABLES}/${base.id}`)).status).toBe(404);
    const orphan = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT count(*)::int AS n FROM traditional_quotes WHERE quote_table_id = $1', [base.id]),
    );
    expect(orphan.rows[0].n).toBe(0);

    const actions = (await session.http.get('/v1/admin/audit')).body.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['quote.create', 'quote.default', 'quote.delete', 'quote.update']));
  });

  it('a compra usa a tabela do comprador: Loterias (cotação, prêmio e rótulo no pule) e Fazendinha', async () => {
    const session = await loginOperator(app, 'aurora');
    const vip = (await session.http.post(TABLES, { name: 'VIP' })).body as AdminQuoteTable;
    await session.http.put(`${TABLES}/${vip.id}/tradicional`, {
      quotes: [{ modality: 'milhar', prizeCents: 900_000 }],
    });
    await session.http.put(`${TABLES}/${vip.id}/fazendinha`, {
      quotes: [{ mode: 'grupo', stakeCents: 100, prizeCents: 2500 }],
    });

    const vipPlayer = await player('aurora', 10_000);
    await assignTable(vipPlayer.person.id, vip.id);
    const common = await player('aurora', 10_000);

    const vipQuotes = (await vipPlayer.http.get('/v1/quotes')).body as PublicQuotes;
    // O jogador vê o rótulo dos valores, nunca o nome da tabela no painel.
    expect(vipQuotes.tableLabel).toBe('800/1/9000');
    expect(prizeOf(vipQuotes, 'milhar').prizeCents).toBe(900_000);
    expect((await common.http.get('/v1/quotes')).body).toEqual(defaultQuotes());

    const milhar = findLotteryModality('milhar')!;
    const ticket = (quotes: PublicQuotes) => ({
      idempotencyKey: randomUUID(),
      game: 'tradicional',
      drawDate: drawDateOf(new Date().toISOString(), 1),
      draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
      items: [
        {
          modality: 'milhar',
          placement: 'p1',
          guesses: ['3452'],
          amountCents: 100,
          split: 'total',
          quoteCents: lotteryQuoteCents(milhar, quotes),
        },
      ],
    });
    const vipBuy = await vipPlayer.http.post('/v1/lotteries/tickets', ticket(vipQuotes));
    expect(vipBuy.status, JSON.stringify(vipBuy.body)).toBe(201);
    expect(vipBuy.body.tickets[0]).toMatchObject({ quoteTable: '800/1/9000' });
    expect(vipBuy.body.tickets[0].items[0]).toMatchObject({ quoteCents: 900_000, possiblePrizeCents: 900_000 });
    // Com a cotação da padrão, o jogador da VIP não compra (e o comum não compra com a da VIP).
    const stale = await vipPlayer.http.post('/v1/lotteries/tickets', ticket(defaultQuotes()));
    expect(stale.body.code).toBe('QUOTE_CHANGED');
    expect((await common.http.post('/v1/lotteries/tickets', ticket(vipQuotes))).body.code).toBe('QUOTE_CHANGED');
    const commonBuy = await common.http.post('/v1/lotteries/tickets', ticket(defaultQuotes()));
    expect(commonBuy.status).toBe(201);
    expect(commonBuy.body.tickets[0]).toMatchObject({ quoteTable: '800/1/8000' });

    const stored = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `SELECT t.user_id, t.quote_table, i.quote_cents, i.possible_prize_cents::int AS prize
           FROM lottery_tickets t JOIN lottery_ticket_items i ON i.ticket_id = t.id ORDER BY t.pule_number`,
      ),
    );
    expect(stored.rows).toEqual([
      { user_id: vipPlayer.person.id, quote_table: '800/1/9000', quote_cents: 900_000, prize: 900_000 },
      { user_id: common.person.id, quote_table: '800/1/8000', quote_cents: 800_000, prize: 800_000 },
    ]);

    const bet = (http: typeof common.http, prizeCents: number, number: number) =>
      http.post('/v1/fazendinha/bets', {
        idempotencyKey: randomUUID(),
        drawDate: drawDateOf(new Date().toISOString(), 1),
        lottery: 'LT PT RIO 09HS',
        hour: 9,
        mode: 'grupo',
        stakeCents: 100,
        prizeCents,
        numbers: [number],
      });
    expect((await bet(vipPlayer.http, 2200, 1)).body.code).toBe('QUOTE_CHANGED');
    const vipBet = await bet(vipPlayer.http, 2500, 1);
    expect(vipBet.status, JSON.stringify(vipBet.body)).toBe(201);
    expect(vipBet.body.bet).toMatchObject({ prizeCents: 2500, quoteTable: '800/1/9000' });
    const commonBet = await bet(common.http, 2200, 2);
    expect(commonBet.body.bet).toMatchObject({ prizeCents: 2200, quoteTable: '800/1/8000' });
    const bets = await asTenant(migratorPool, auroraId, (c) =>
      c.query('SELECT prize_cents, quote_table FROM fazendinha_bets ORDER BY pule_number'),
    );
    expect(bets.rows).toEqual([
      { prize_cents: 2500, quote_table: '800/1/9000' },
      { prize_cents: 2200, quote_table: '800/1/8000' },
    ]);

    // O pule guarda o rótulo da venda: renomear, mudar os valores ou trocar a tabela depois não muda o recibo.
    await session.http.patch(`${TABLES}/${vip.id}`, { name: 'VIP 2' });
    await session.http.put(`${TABLES}/${vip.id}/tradicional`, {
      quotes: [{ modality: 'milhar', prizeCents: 950_000 }],
    });
    await assignTable(vipPlayer.person.id, null);
    const receipt = await vipPlayer.http.get(`/v1/me/pules/${vipBet.body.bet.puleNumber}`);
    expect(receipt.body.bet.quoteTable).toBe('800/1/9000');
    const ticketReceipt = await vipPlayer.http.get(`/v1/me/pules/${vipBuy.body.tickets[0].puleNumber}`);
    expect(ticketReceipt.body.ticket.quoteTable).toBe('800/1/9000');
    // Sem tabela própria, volta a valer a padrão.
    expect((await vipPlayer.http.get('/v1/quotes')).body).toEqual(defaultQuotes());
  });

  it('Financeiro só consulta; Suporte não vê; cada banca tem as suas tabelas', async () => {
    const manager = await loginOperator(app, 'aurora');
    const table = await defaultTable(manager);
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.get(TABLES)).status).toBe(200);
    expect((await finance.http.get(`${TABLES}/${table.id}`)).status).toBe(200);
    const body = traditionalBody(defaultQuotes());
    expect((await finance.http.put(`${TABLES}/${table.id}/tradicional`, body)).status).toBe(403);
    expect((await finance.http.post(TABLES, { name: 'Nova' })).status).toBe(403);
    expect((await finance.http.patch(`${TABLES}/${table.id}`, { name: 'Nova' })).status).toBe(403);
    expect((await finance.http.post(`${TABLES}/${table.id}/default`, {})).status).toBe(403);
    expect((await finance.http.delete(`${TABLES}/${table.id}`)).status).toBe(403);
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get(TABLES)).status).toBe(403);

    await manager.http.put(`${TABLES}/${table.id}/tradicional`, traditionalBody(defaultQuotes(), { milhar: 900000 }));
    expect((await (await player('boreal')).http.get('/v1/quotes')).body).toEqual(defaultQuotes());

    // A tabela de outra banca não existe para o gerente desta.
    const boreal = await loginOperator(app, 'boreal');
    expect((await boreal.http.get(`${TABLES}/${table.id}`)).status).toBe(404);
    expect((await boreal.http.put(`${TABLES}/${table.id}/tradicional`, body)).status).toBe(404);
    expect((await boreal.http.delete(`${TABLES}/${table.id}`)).status).toBe(404);
    expect((await boreal.http.post(TABLES, { name: 'X', copyFromId: table.id })).status).toBe(404);
    const borealTables = (await boreal.http.get(TABLES)).body as AdminQuoteTableSummary[];
    expect(borealTables.map((t) => t.id)).not.toContain(table.id);

    // RLS: a credencial de runtime só enxerga as tabelas da banca do contexto.
    const visible = await asTenant(runtimePool, borealId, (c) => c.query('SELECT id FROM quote_tables'));
    expect(visible.rows.map((r) => r.id)).toEqual(borealTables.map((t) => t.id));
  });

  it('o banco garante: uma padrão por banca, nome único, FK na mesma banca e limites da unidade', async () => {
    const session = await loginOperator(app, 'aurora');
    const table = await defaultTable(session);
    const borealTable = await defaultTable(await loginOperator(app, 'boreal'));
    const { person } = await player();
    const rejects = (sql: string, params: unknown[]) =>
      expect(asTenant(runtimePool, auroraId, (c) => c.query(sql, params))).rejects.toThrow();

    await rejects("INSERT INTO quote_tables (tenant_id, name, is_default) VALUES ($1, 'Outra', true)", [auroraId]);
    await rejects("INSERT INTO quote_tables (tenant_id, name) VALUES ($1, '800/1/8000')", [auroraId]);
    await rejects("INSERT INTO quote_tables (tenant_id, name) VALUES ($1, ' x')", [auroraId]);
    // Sem padrão no commit (trigger adiado).
    await rejects('UPDATE quote_tables SET is_default = false WHERE id = $1', [table.id]);
    // Tabela de outra banca (a FK é composta com a banca; o RLS também esconde).
    await rejects('UPDATE users SET quote_table_id = $2 WHERE id = $1', [person.id, borealTable.id]);
    await rejects("UPDATE users SET region = 'XX' WHERE id = $1", [person.id]);
    await rejects('UPDATE users SET unit_commission_bps = 10001 WHERE id = $1', [person.id]);
    await rejects('UPDATE users SET daily_limit_enabled = true WHERE id = $1', [person.id]);
    await rejects('UPDATE users SET daily_limit_cents = 0 WHERE id = $1', [person.id]);
    // Tabela em uso não sai nem direto no banco.
    await asTenant(migratorPool, auroraId, (c) =>
      c.query("INSERT INTO quote_tables (tenant_id, name) VALUES ($1, 'Usada')", [auroraId]),
    );
    const used = await asTenant(runtimePool, auroraId, (c) =>
      c.query("SELECT id FROM quote_tables WHERE name = 'Usada'"),
    );
    await assignTable(person.id, used.rows[0].id);
    await rejects('DELETE FROM quote_tables WHERE id = $1', [used.rows[0].id]);

    // Os padrões e o que é aceito.
    await asTenant(runtimePool, auroraId, (c) =>
      c.query(
        `UPDATE users SET region = 'SP', unit_commission_bps = 500, gift_milhar_enabled = false, retain_prizes = true,
                daily_limit_enabled = true, daily_limit_cents = 50000 WHERE id = $1`,
        [person.id],
      ),
    );
    const fresh = await createUser(app, 'aurora');
    const row = await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `SELECT region, unit_commission_bps, quote_table_id, gift_milhar_enabled, retain_prizes, daily_limit_enabled,
                daily_limit_cents FROM users WHERE id = $1`,
        [fresh.id],
      ),
    );
    expect(row.rows[0]).toEqual({
      region: null,
      unit_commission_bps: 0,
      quote_table_id: null,
      gift_milhar_enabled: true,
      retain_prizes: false,
      daily_limit_enabled: false,
      daily_limit_cents: null,
    });
  });
});
