import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type AdminDraw,
  type AdminDrawsResponse,
  type DrawSchedule,
  type LoginResponse,
  type SaveDrawRequest,
  defaultQuotes,
  drawDateOf,
  fazendinhaPrizeFrom,
  weekdayOfDate,
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

const NOW = () => new Date().toISOString();
const TOMORROW = drawDateOf(NOW(), 1);
const IN_TWO_DAYS = drawDateOf(NOW(), 2);

async function player(funds = 10_000) {
  const person = await createUser(app, 'aurora');
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: 'correct horse battery staple',
  });
  await asTenant(migratorPool, auroraId, (c) =>
    c.query('SELECT wallet_manual_adjust($1, $2, 0, 0, $3)', [person.id, funds, 'crédito de teste']),
  );
  return api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
}

const fazendinhaBet = (lottery: string, hour: number, drawDate = TOMORROW) => ({
  idempotencyKey: randomUUID(),
  drawDate,
  lottery,
  hour,
  mode: 'grupo',
  stakeCents: 100,
  prizeCents: fazendinhaPrizeFrom(defaultQuotes(), 'grupo', 100),
  numbers: [7],
});

const findDraw = (body: AdminDrawsResponse, name: string) => body.draws.find((d) => d.name === name)!;

const toSave = (
  { id: _id, hour: _hour, ...draw }: AdminDraw,
  patch: Partial<SaveDrawRequest> = {},
): SaveDrawRequest => ({
  ...draw,
  ...patch,
});

const NEW_DRAW: SaveDrawRequest = {
  group: 'teste',
  name: 'lt teste 10hs',
  code: '',
  drawTime: '10:20',
  closesAt: '10:15',
  weekdays: [1, 2, 3, 4, 5, 6, 0],
  games: ['lotteries'],
  result: null,
  active: true,
  sortOrder: 5000,
};

describe('GET /v1/draws (jogador)', () => {
  it('lista os sorteios ativos do cadastro padrão, com a Federal às quartas e domingos', async () => {
    const http = await player();
    const res = await http.get('/v1/draws');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as DrawSchedule;
    expect(body.draws).toHaveLength(72);
    expect(body.draws[0]).toEqual({
      id: expect.any(String),
      group: 'RIO/FEDERAL',
      name: 'LT PT RIO 09HS',
      hour: 9,
      drawTime: '09:20',
      closesAt: '09:18',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      games: ['lotteries', 'fazendinha'],
      result: { lottery: 'rj', extraction: 9 },
    });
    // A Federal da banca é às 20h; o resultado é a Federal das 19h do provedor.
    expect(body.draws.find((d) => d.name === 'LT FEDERAL')).toMatchObject({
      hour: 20,
      closesAt: '19:58',
      weekdays: [0, 3],
      result: { lottery: 'fd', extraction: 19 },
    });
    expect(body.draws.find((d) => d.name === 'LT BAND 15HS')!.result).toEqual({ lottery: 'sp', extraction: 15 });
    // Sem correspondência certa no provedor: sem ligação (o painel define).
    for (const name of ['LT LOTECE 10HS', 'LT CAPITAL 10HS', 'LT LOTEP 09HS', 'LT NACIONAL 21HS', 'LT MALUQ FEDERAL']) {
      expect(body.draws.find((d) => d.name === name)!.result, name).toBeNull();
    }
    expect(body.draws.filter((d) => d.result !== null)).toHaveLength(54);
    expect(body.exceptions).toEqual([]);
  });

  it('exige sessão', async () => {
    expect((await api(app, 'aurora').get('/v1/draws')).status).toBe(401);
  });
});

describe('painel: /v1/admin/draws', () => {
  it('Financeiro consulta mas não altera; Suporte não vê', async () => {
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    expect((await finance.http.get('/v1/admin/draws')).status).toBe(200);
    expect((await finance.http.post('/v1/admin/draws', NEW_DRAW)).status).toBe(403);
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get('/v1/admin/draws')).status).toBe(403);
  });

  it('cadastra, altera e exclui um sorteio sem apostas, com auditoria', async () => {
    const session = await loginOperator(app, 'aurora');
    const created = await session.http.post('/v1/admin/draws', NEW_DRAW);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const draw = findDraw(created.body, 'LT TESTE 10HS');
    expect(draw).toMatchObject({ group: 'TESTE', hour: 10, weekdays: [0, 1, 2, 3, 4, 5, 6], games: ['lotteries'] });
    // Sem código: gerado do nome e da hora.
    expect(draw.code).toBe('TESTE10');

    const updated = await session.http.put(
      `/v1/admin/draws/${draw.id}`,
      toSave(draw, { closesAt: '10:18', weekdays: [1, 3] }),
    );
    expect(updated.status).toBe(200);
    expect(findDraw(updated.body, 'LT TESTE 10HS')).toMatchObject({ closesAt: '10:18', weekdays: [1, 3] });

    // Código informado (em maiúsculas); vazio de novo volta ao gerado.
    const coded = await session.http.put(`/v1/admin/draws/${draw.id}`, toSave(draw, { code: 'tst10' }));
    expect(findDraw(coded.body, 'LT TESTE 10HS').code).toBe('TST10');
    const regenerated = await session.http.put(`/v1/admin/draws/${draw.id}`, toSave(draw, { code: '' }));
    expect(findDraw(regenerated.body, 'LT TESTE 10HS').code).toBe('TESTE10');

    // Ligação com o resultado do provedor: definir, repetir (sem auditoria) e tirar.
    const linked = await session.http.put(
      `/v1/admin/draws/${draw.id}`,
      toSave(draw, { result: { lottery: 'ln', extraction: 10 } }),
    );
    expect(linked.status, JSON.stringify(linked.body)).toBe(200);
    expect(findDraw(linked.body, 'LT TESTE 10HS').result).toEqual({ lottery: 'ln', extraction: 10 });
    const current = findDraw(linked.body, 'LT TESTE 10HS');
    await session.http.put(`/v1/admin/draws/${draw.id}`, toSave(current));
    const unlinked = await session.http.put(`/v1/admin/draws/${draw.id}`, toSave(current, { result: null }));
    expect(findDraw(unlinked.body, 'LT TESTE 10HS').result).toBeNull();

    const removed = await session.http.delete(`/v1/admin/draws/${draw.id}`);
    expect(removed.status).toBe(200);
    expect(findDraw(removed.body, 'LT TESTE 10HS')).toBeUndefined();

    const audit = await session.http.get('/v1/admin/audit');
    expect(audit.body.items.map((e: { action: string }) => e.action)).toEqual([
      'draw.delete',
      'draw.update',
      'draw.update',
      'draw.update',
      'draw.update',
      'draw.update',
      'draw.create',
    ]);
    expect(audit.body.items[1].details).toEqual({ fields: ['Resultado'], draw: 'LT TESTE 10HS' });
    expect(audit.body.items[2].details).toEqual({ fields: ['Resultado'], draw: 'LT TESTE 10HS' });
    expect(audit.body.items[3].details).toEqual({ fields: ['Código'], draw: 'LT TESTE 10HS' });
    expect(audit.body.items[5].details).toEqual({ fields: ['Venda até', 'Dias'], draw: 'LT TESTE 10HS' });
  });

  it('valida o cadastro', async () => {
    const session = await loginOperator(app, 'aurora');
    const cases: Array<[Partial<SaveDrawRequest>, string]> = [
      [{ closesAt: '10:21' }, 'closesAt'],
      [{ drawTime: '24:00' }, 'drawTime'],
      [{ weekdays: [] }, 'weekdays'],
      [{ weekdays: [1, 1] }, 'weekdays'],
      [{ weekdays: [7] }, 'weekdays.0'],
      [{ games: [] }, 'games'],
      [{ name: ' ' }, 'name'],
      [{ name: 'X'.repeat(41) }, 'name'],
      [{ code: 'PT 14' }, 'code'],
      [{ code: 'PT-14' }, 'code'],
      [{ code: 'X'.repeat(13) }, 'code'],
      // Fora do catálogo: sigla desconhecida ou extração que a loteria não tem.
      [{ result: { lottery: 'zz', extraction: 10 } }, 'result'],
      [{ result: { lottery: 'rj', extraction: 10 } }, 'result'],
      [{ result: { lottery: 'RJ', extraction: 9 } }, 'result'],
    ];
    for (const [patch, field] of cases) {
      const res = await session.http.post('/v1/admin/draws', { ...NEW_DRAW, ...patch });
      expect(res.status, JSON.stringify(patch)).toBe(400);
      expect(res.body.details?.[0]?.field, JSON.stringify(patch)).toBe(field);
    }
    // Campo obrigatório (null = sem ligação).
    const { result: _result, ...withoutResult } = NEW_DRAW;
    expect((await session.http.post('/v1/admin/draws', withoutResult)).status).toBe(400);
    // O banco recusa sigla sem extração (e vice-versa), mesmo por fora da API.
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query(`UPDATE draws SET result_extraction = NULL WHERE name = 'LT PT RIO 09HS'`),
      ),
    ).rejects.toThrow(/draws_result_source_pair/);
    const duplicated = await session.http.post('/v1/admin/draws', { ...NEW_DRAW, name: 'LT PT RIO 09HS' });
    expect(duplicated.status).toBe(409);
    expect(duplicated.body.code).toBe('CONFLICT');
    expect(duplicated.body.details).toEqual([{ field: 'name', message: 'Já existe um sorteio com este nome.' }]);
    const sameCode = await session.http.post('/v1/admin/draws', { ...NEW_DRAW, code: 'PTRIO09' });
    expect(sameCode.status).toBe(409);
    expect(sameCode.body.details).toEqual([{ field: 'code', message: 'Já existe um sorteio com este código.' }]);
  });

  it('não desativa, não tira o jogo nem o dia, não renomeia e não exclui sorteio com apostas vendidas', async () => {
    const http = await player();
    expect((await http.post('/v1/fazendinha/bets', fazendinhaBet('LT PT RIO 09HS', 9))).status).toBe(201);

    const session = await loginOperator(app, 'aurora');
    const draw = findDraw((await session.http.get('/v1/admin/draws')).body, 'LT PT RIO 09HS');
    const blocked: Array<Partial<SaveDrawRequest>> = [
      { active: false },
      { games: ['lotteries'] },
      { weekdays: [0, 1, 2, 3, 4, 5, 6].filter((w) => w !== weekdayOfDate(TOMORROW)) },
      { name: 'LT PT RIO 09HS NOVO' },
      { drawTime: '10:20', closesAt: '10:18' },
    ];
    for (const patch of blocked) {
      const res = await session.http.put(`/v1/admin/draws/${draw.id}`, toSave(draw, patch));
      expect(res.status, JSON.stringify(patch)).toBe(409);
      expect(res.body.code).toBe('DRAW_HAS_BETS');
    }
    expect((await session.http.delete(`/v1/admin/draws/${draw.id}`)).body.code).toBe('DRAW_HAS_BETS');

    // Horário de venda, grupo e ordem podem mudar; a Loterias pode ser desligada (não há pule de loteria).
    const ok = await session.http.put(`/v1/admin/draws/${draw.id}`, toSave(draw, { closesAt: '09:15', sortOrder: 1 }));
    expect(ok.status).toBe(200);

    // Nada foi auditado nas tentativas recusadas.
    const audit = await session.http.get('/v1/admin/audit');
    expect(audit.body.items.map((e: { action: string }) => e.action)).toEqual(['draw.update']);
  });

  it('desativado some da tela e não vende', async () => {
    const session = await loginOperator(app, 'aurora');
    const draw = findDraw((await session.http.get('/v1/admin/draws')).body, 'LT PT RIO 11HS');
    expect((await session.http.put(`/v1/admin/draws/${draw.id}`, toSave(draw, { active: false }))).status).toBe(200);

    const http = await player();
    const schedule = (await http.get('/v1/draws')).body as DrawSchedule;
    expect(schedule.draws.some((d) => d.name === 'LT PT RIO 11HS')).toBe(false);
    const res = await http.post('/v1/fazendinha/bets', fazendinhaBet('LT PT RIO 11HS', 11));
    expect(res.status).toBe(400);
    expect(res.body.details?.[0]?.field).toBe('lottery');
  });

  it('não mexe em sorteio de outra banca', async () => {
    const boreal = await loginOperator(app, 'boreal');
    const draw = findDraw((await boreal.http.get('/v1/admin/draws')).body, 'LT PT RIO 09HS');
    const aurora = await loginOperator(app, 'aurora');
    expect((await aurora.http.put(`/v1/admin/draws/${draw.id}`, toSave(draw, { active: false }))).status).toBe(404);
    expect((await aurora.http.delete(`/v1/admin/draws/${draw.id}`)).status).toBe(404);
    expect(
      (
        await aurora.http.post('/v1/admin/draws/exceptions', {
          date: TOMORROW,
          drawId: draw.id,
          kind: 'CANCEL',
        })
      ).status,
    ).toBe(400);
  });
});

describe('concorrência entre compra e cadastro', () => {
  it('desativar espera a compra em andamento terminar e então vê a aposta vendida', async () => {
    await player();
    const buyer = await runtimePool.connect();
    const admin = await runtimePool.connect();
    try {
      // Compra aberta (sem COMMIT): o trigger de venda travou o sorteio em FOR SHARE.
      await buyer.query('BEGIN');
      await buyer.query("SELECT set_config('app.tenant_id', $1, true)", [auroraId]);
      const { rows: users } = await buyer.query<{ id: string }>('SELECT id FROM users LIMIT 1');
      const { rows } = await buyer.query<{ id: string }>(
        `INSERT INTO fazendinha_bets (tenant_id, user_id, idempotency_key, draw_date, lottery, draw_hour, mode,
           stake_cents, prize_cents, multiplier, total_cents)
         VALUES ($1, $2, gen_random_uuid(), $3, 'LT PT RIO 09HS', 9, 'GRUPO', 100, 2200, 22, 100) RETURNING id`,
        [auroraId, users[0]!.id, TOMORROW],
      );
      await buyer.query(
        `INSERT INTO fazendinha_bet_numbers (tenant_id, bet_id, draw_date, lottery, draw_hour, mode, stake_cents, number)
         VALUES ($1, $2, $3, 'LT PT RIO 09HS', 9, 'GRUPO', 100, 1)`,
        [auroraId, rows[0]!.id, TOMORROW],
      );
      await buyer.query('SELECT fazendinha_debit($1)', [rows[0]!.id]);

      // O gerente desativa ao mesmo tempo: fica esperando a trava.
      await admin.query('BEGIN');
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [auroraId]);
      const deactivate = admin.query("UPDATE draws SET active = false WHERE name = 'LT PT RIO 09HS'").then(
        () => 'ok',
        (error: { code?: string }) => error.code,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await buyer.query('COMMIT');
      expect(await deactivate).toBe('SJ005');
      await admin.query('ROLLBACK');
    } finally {
      buyer.release();
      admin.release();
    }
  });

  it('a compra espera o gerente terminar e então vê o sorteio desativado', async () => {
    await player();
    const admin = await runtimePool.connect();
    try {
      await admin.query('BEGIN');
      await admin.query("SELECT set_config('app.tenant_id', $1, true)", [auroraId]);
      await admin.query("UPDATE draws SET active = false WHERE name = 'LT PT RIO 09HS'");
      const purchase = asTenant(runtimePool, auroraId, async (c) => {
        const { rows } = await c.query<{ id: string }>('SELECT id FROM users LIMIT 1');
        await c.query(
          `INSERT INTO fazendinha_bets (tenant_id, user_id, idempotency_key, draw_date, lottery, draw_hour, mode,
             stake_cents, prize_cents, multiplier, total_cents)
           VALUES ($1, $2, gen_random_uuid(), $3, 'LT PT RIO 09HS', 9, 'GRUPO', 100, 2200, 22, 100)`,
          [auroraId, rows[0]!.id, TOMORROW],
        );
      }).then(
        () => 'ok',
        (error: { code?: string }) => error.code,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      await admin.query('COMMIT');
      expect(await purchase).toBe('SJ002');
    } finally {
      admin.release();
    }
  });
});

describe('exceções de data', () => {
  it('feriado cancela todos os sorteios do dia; recusado se já há apostas nele', async () => {
    const session = await loginOperator(app, 'aurora');
    const holiday = await session.http.post('/v1/admin/draws/exceptions', {
      date: IN_TWO_DAYS,
      drawId: null,
      kind: 'CANCEL',
      note: 'Feriado',
    });
    expect(holiday.status, JSON.stringify(holiday.body)).toBe(201);
    expect(holiday.body.exceptions).toEqual([
      {
        id: expect.any(String),
        date: IN_TWO_DAYS,
        drawId: null,
        drawName: null,
        kind: 'CANCEL',
        note: 'Feriado',
        createdAt: expect.any(String),
      },
    ]);

    const http = await player();
    expect((await http.get('/v1/draws')).body.exceptions).toEqual([
      { date: IN_TWO_DAYS, drawId: null, kind: 'CANCEL' },
    ]);
    const blocked = await http.post('/v1/fazendinha/bets', fazendinhaBet('LT PT RIO 09HS', 9, IN_TWO_DAYS));
    expect(blocked.status).toBe(400);
    // Mesmo sem passar pela API.
    await expect(
      asTenant(runtimePool, auroraId, async (c) => {
        const { rows } = await c.query<{ id: string }>('SELECT id FROM users LIMIT 1');
        await c.query(
          `INSERT INTO fazendinha_bets (tenant_id, user_id, idempotency_key, draw_date, lottery, draw_hour, mode,
             stake_cents, prize_cents, multiplier, total_cents)
           VALUES ($1, $2, gen_random_uuid(), $3, 'LT PT RIO 09HS', 9, 'GRUPO', 100, 2200, 22, 100)`,
          [auroraId, rows[0]!.id, IN_TWO_DAYS],
        );
      }),
    ).rejects.toMatchObject({ code: 'SJ002' });

    // Amanhã já tem aposta: o feriado é recusado.
    expect((await http.post('/v1/fazendinha/bets', fazendinhaBet('LT PT RIO 09HS', 9))).status).toBe(201);
    const refused = await session.http.post('/v1/admin/draws/exceptions', {
      date: TOMORROW,
      drawId: null,
      kind: 'CANCEL',
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('DRAW_HAS_BETS');

    // Duplicada.
    const again = await session.http.post('/v1/admin/draws/exceptions', {
      date: IN_TWO_DAYS,
      drawId: null,
      kind: 'CANCEL',
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('CONFLICT');
    expect(again.body.details).toEqual([{ field: 'date', message: 'Já existe uma exceção para esta data e sorteio.' }]);

    // Remover o feriado volta a vender.
    const removed = await session.http.delete(`/v1/admin/draws/exceptions/${holiday.body.exceptions[0].id}`);
    expect(removed.status).toBe(200);
    expect((await http.post('/v1/fazendinha/bets', fazendinhaBet('LT PT RIO 09HS', 9, IN_TWO_DAYS))).status).toBe(201);
  });

  it('sorteio extra corre fora dos dias dele; não pode ser removido depois de vender', async () => {
    const session = await loginOperator(app, 'aurora');
    const federal = findDraw((await session.http.get('/v1/admin/draws')).body, 'LT FEDERAL');
    // Um dia da janela sem Federal.
    const date = [1, 2, 3, 4, 5, 6]
      .map((offset) => drawDateOf(NOW(), offset))
      .find((d) => ![0, 3].includes(weekdayOfDate(d)))!;

    const http = await player();
    expect((await http.post('/v1/fazendinha/bets', fazendinhaBet('LT FEDERAL', 20, date))).status).toBe(400);

    const cancelOffDay = await session.http.post('/v1/admin/draws/exceptions', {
      date,
      drawId: federal.id,
      kind: 'CANCEL',
    });
    expect(cancelOffDay.status).toBe(400);

    const extra = await session.http.post('/v1/admin/draws/exceptions', {
      date,
      drawId: federal.id,
      kind: 'EXTRA',
      note: 'Extra',
    });
    expect(extra.status).toBe(201);
    expect(extra.body.exceptions[0]).toMatchObject({ drawName: 'LT FEDERAL', kind: 'EXTRA' });
    expect((await http.post('/v1/fazendinha/bets', fazendinhaBet('LT FEDERAL', 20, date))).status).toBe(201);

    const removed = await session.http.delete(`/v1/admin/draws/exceptions/${extra.body.exceptions[0].id}`);
    expect(removed.status).toBe(409);
    expect(removed.body.code).toBe('DRAW_HAS_BETS');

    const noDraw = await session.http.post('/v1/admin/draws/exceptions', { date, drawId: null, kind: 'EXTRA' });
    expect(noDraw.status).toBe(400);
    const past = await session.http.post('/v1/admin/draws/exceptions', {
      date: drawDateOf(NOW(), -1),
      drawId: null,
      kind: 'CANCEL',
    });
    expect(past.status).toBe(400);
  });
});
