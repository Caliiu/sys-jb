import type { INestApplication } from '@nestjs/common';
import {
  type AdminMural,
  type LoginResponse,
  MURAL_LIMITS,
  type PublicMural,
  type SaveMuralRequest,
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

const day = (offset: number) => drawDateOf(new Date().toISOString(), offset);
const TODAY = day(0);

/** PNG 1×1 válido. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
/** Só o começo de um JPEG: o servidor confere o formato pelos primeiros bytes. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1').toString('base64');

const NEW_MURAL: SaveMuralRequest = {
  name: 'Coelho da Fortuna',
  startsOn: TODAY,
  endsOn: day(7),
  displayMode: 'ONCE',
  image: PNG,
};

async function player(tenant: 'aurora' | 'boreal' = 'aurora') {
  const person = await createUser(app, tenant);
  const login = await api(app, tenant).post('/v1/auth/login', {
    document: person.document,
    password: 'correct horse battery staple',
  });
  return api(app, tenant, KEYS[tenant], { 'X-Session-Token': (login.body as LoginResponse).token });
}

/** Mural gravado direto no banco (a API recusa data final no passado). */
async function insertMural(name: string, startsOn: string, endsOn: string, displayMode = 'ALWAYS') {
  const { rows } = await asTenant(migratorPool, auroraId, (c) =>
    c.query<{ id: string }>(
      `INSERT INTO murals (tenant_id, name, starts_on, ends_on, display_mode, image, image_type)
       VALUES ($1, $2, $3, $4, $5, decode($6, 'base64'), 'image/png') RETURNING id`,
      [auroraId, name, startsOn, endsOn, displayMode, PNG],
    ),
  );
  return rows[0]!.id;
}

const byName = (list: AdminMural[], name: string) => list.find((m) => m.name === name)!;

describe('Mural no painel', () => {
  it('cadastra, altera e exclui, com auditoria', async () => {
    const session = await loginOperator(app, 'aurora');
    const created = await session.http.post('/v1/admin/murals', NEW_MURAL);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const mural = byName(created.body, 'Coelho da Fortuna');
    expect(mural).toEqual({
      id: expect.any(String),
      name: 'Coelho da Fortuna',
      startsOn: TODAY,
      endsOn: day(7),
      displayMode: 'ONCE',
      imageType: 'image/png',
      imageBytes: Buffer.from(PNG, 'base64').byteLength,
      viewsCount: 0,
      version: expect.any(String),
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const image = await session.http.get(`/v1/admin/murals/${mural.id}/image`);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(Buffer.from(image.body as Buffer).equals(Buffer.from(PNG, 'base64'))).toBe(true);

    // Sem imagem = mantém a atual.
    const { image: _image, ...withoutImage } = NEW_MURAL;
    const renamed = await session.http.put(`/v1/admin/murals/${mural.id}`, {
      ...withoutImage,
      name: 'Raspadinha',
      displayMode: 'ALWAYS',
    });
    expect(renamed.status).toBe(200);
    expect(byName(renamed.body, 'Raspadinha')).toMatchObject({ displayMode: 'ALWAYS', imageType: 'image/png' });

    // Nada mudou: sem auditoria.
    const same = await session.http.put(`/v1/admin/murals/${mural.id}`, {
      ...withoutImage,
      name: 'Raspadinha',
      displayMode: 'ALWAYS',
    });
    expect(same.status).toBe(200);

    const replaced = await session.http.put(`/v1/admin/murals/${mural.id}`, {
      ...NEW_MURAL,
      name: 'Raspadinha',
      displayMode: 'ALWAYS',
      image: JPEG,
    });
    const after = byName(replaced.body, 'Raspadinha');
    expect(after.imageType).toBe('image/jpeg');
    expect(after.version).not.toBe(mural.version);

    const removed = await session.http.delete(`/v1/admin/murals/${mural.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual([]);

    const audit = await session.http.get('/v1/admin/audit');
    expect(audit.body.items.map((e: { action: string }) => e.action)).toEqual([
      'mural.delete',
      'mural.update',
      'mural.update',
      'mural.create',
    ]);
    expect(audit.body.items[1].details).toEqual({ fields: ['Imagem'], mural: 'Raspadinha' });
    expect(audit.body.items[2].details).toEqual({ fields: ['Nome', 'Exibição'], mural: 'Raspadinha' });
    expect(audit.body.items[3].details).toEqual({ fields: [], mural: 'Coelho da Fortuna' });
  });

  it('valida o cadastro', async () => {
    const session = await loginOperator(app, 'aurora');
    const { image: _image, ...withoutImage } = NEW_MURAL;
    const cases: Array<[Record<string, unknown>, string]> = [
      [withoutImage, 'image'],
      [{ ...NEW_MURAL, image: GIF }, 'image'],
      [{ ...NEW_MURAL, image: 'não é base64' }, 'image'],
      [{ ...NEW_MURAL, name: '   ' }, 'name'],
      [{ ...NEW_MURAL, name: 'x'.repeat(MURAL_LIMITS.nameMax + 1) }, 'name'],
      [{ ...NEW_MURAL, startsOn: '2026-02-30' }, 'startsOn'],
      [{ ...NEW_MURAL, endsOn: day(-1), startsOn: day(-3) }, 'endsOn'],
      [{ ...NEW_MURAL, startsOn: day(3), endsOn: day(2) }, 'endsOn'],
      [{ ...NEW_MURAL, displayMode: 'DAILY' }, 'displayMode'],
      [{ ...NEW_MURAL, tenantId: auroraId }, 'tenantId'],
    ];
    for (const [body, field] of cases) {
      const res = await session.http.post('/v1/admin/murals', body);
      expect(res.status, `${field}: ${JSON.stringify(res.body)}`).toBe(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    }
    expect((await session.http.get('/v1/admin/murals')).body).toEqual([]);
  });

  it('recusa imagem acima de 3 MB (na API e no banco)', async () => {
    const session = await loginOperator(app, 'aurora');
    // Exatamente no limite: aceita.
    const limit = Buffer.alloc(MURAL_LIMITS.imageMaxBytes);
    Buffer.from(PNG, 'base64').copy(limit);
    const ok = await session.http.post('/v1/admin/murals', { ...NEW_MURAL, image: limit.toString('base64') });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body[0].imageBytes).toBe(3 * 1024 * 1024);

    const big = Buffer.alloc(MURAL_LIMITS.imageMaxBytes + 1);
    Buffer.from(PNG, 'base64').copy(big);
    const res = await session.http.post('/v1/admin/murals', { ...NEW_MURAL, image: big.toString('base64') });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('image');

    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query(
          `INSERT INTO murals (tenant_id, name, starts_on, ends_on, display_mode, image, image_type)
           VALUES ($1, 'x', $2, $2, 'ONCE', $3, 'image/png')`,
          [auroraId, TODAY, big],
        ),
      ),
    ).rejects.toThrow(/murals_image_size/);
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query(
          `INSERT INTO murals (tenant_id, name, starts_on, ends_on, display_mode, image, image_type)
           VALUES ($1, 'x', $2, $2, 'ONCE', '\\x01', 'image/gif')`,
          [auroraId, TODAY],
        ),
      ),
    ).rejects.toThrow(/murals_image_type/);
  });

  it('permite renomear um mural encerrado sem mexer nas datas', async () => {
    const session = await loginOperator(app, 'aurora');
    const id = await insertMural('Antigo', day(-10), day(-5));
    const res = await session.http.put(`/v1/admin/murals/${id}`, {
      name: 'Antigo (arquivo)',
      startsOn: day(-10),
      endsOn: day(-5),
      displayMode: 'ALWAYS',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(byName(res.body, 'Antigo (arquivo)').endsOn).toBe(day(-5));
  });

  it('só o Gerente consulta e altera', async () => {
    const id = await insertMural('No ar', TODAY, TODAY);
    for (const role of ['FINANCE', 'SUPPORT'] as const) {
      const session = await loginOperator(app, 'aurora', { role });
      expect((await session.http.get('/v1/admin/murals')).status).toBe(403);
      expect((await session.http.get(`/v1/admin/murals/${id}/image`)).status).toBe(403);
      expect((await session.http.post('/v1/admin/murals', NEW_MURAL)).status).toBe(403);
      expect((await session.http.delete(`/v1/admin/murals/${id}`)).status).toBe(403);
    }
  });

  it('não alcança mural de outra banca', async () => {
    const id = await insertMural('Da Aurora', TODAY, TODAY);
    const boreal = await loginOperator(app, 'boreal');
    expect((await boreal.http.get('/v1/admin/murals')).body).toEqual([]);
    expect((await boreal.http.get(`/v1/admin/murals/${id}/image`)).status).toBe(404);
    expect((await boreal.http.put(`/v1/admin/murals/${id}`, NEW_MURAL)).status).toBe(404);
    expect((await boreal.http.delete(`/v1/admin/murals/${id}`)).status).toBe(404);
  });
});

describe('Mural para o jogador', () => {
  it('mostra só os murais no ar; "Apenas uma vez" some depois de visto, "Sempre" continua', async () => {
    const once = await insertMural('Uma vez', day(-1), day(1), 'ONCE');
    const always = await insertMural('Sempre', TODAY, TODAY, 'ALWAYS');
    await insertMural('Agendado', day(1), day(3));
    await insertMural('Encerrado', day(-3), day(-1));

    const http = await player();
    const list = await http.get('/v1/murals');
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    // Mais recente (data inicial) primeiro.
    expect((list.body as PublicMural[]).map((m) => [m.name, m.displayMode])).toEqual([
      ['Sempre', 'ALWAYS'],
      ['Uma vez', 'ONCE'],
    ]);

    expect((await http.post(`/v1/murals/${once}/seen`, {})).status).toBe(204);
    // Idempotente, e "Sempre" não grava nada.
    expect((await http.post(`/v1/murals/${once}/seen`, {})).status).toBe(204);
    expect((await http.post(`/v1/murals/${always}/seen`, {})).status).toBe(204);

    expect(((await http.get('/v1/murals')).body as PublicMural[]).map((m) => m.name)).toEqual(['Sempre']);
    // Outro jogador ainda vê os dois.
    expect(((await (await player()).get('/v1/murals')).body as PublicMural[]).map((m) => m.name)).toEqual([
      'Sempre',
      'Uma vez',
    ]);

    const session = await loginOperator(app, 'aurora');
    const murals = (await session.http.get('/v1/admin/murals')).body as AdminMural[];
    expect(byName(murals, 'Uma vez').viewsCount).toBe(1);
    expect(byName(murals, 'Sempre').viewsCount).toBe(0);

    // Excluir apaga também quem viu.
    expect((await session.http.delete(`/v1/admin/murals/${once}`)).status).toBe(200);
    const views = await asTenant(migratorPool, auroraId, (c) => c.query('SELECT 1 FROM mural_views'));
    expect(views.rowCount).toBe(0);
  });

  it('entrega a imagem só de mural no ar', async () => {
    const live = await insertMural('No ar', TODAY, TODAY);
    const scheduled = await insertMural('Agendado', day(1), day(2));
    const http = await player();

    const image = await http.get(`/v1/murals/${live}/image`);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect((await http.get(`/v1/murals/${scheduled}/image`)).status).toBe(404);
    expect((await http.post(`/v1/murals/${scheduled}/seen`, {})).status).toBe(404);
  });

  it('exige sessão e não mostra murais de outra banca', async () => {
    const id = await insertMural('Da Aurora', TODAY, TODAY);
    expect((await api(app, 'aurora').get('/v1/murals')).status).toBe(401);
    expect((await api(app, 'aurora').get(`/v1/murals/${id}/image`)).status).toBe(401);

    const boreal = await player('boreal');
    expect((await boreal.get('/v1/murals')).body).toEqual([]);
    expect((await boreal.get(`/v1/murals/${id}/image`)).status).toBe(404);
    expect((await boreal.post(`/v1/murals/${id}/seen`, {})).status).toBe(404);
  });

  it('a role de runtime não altera o registro de quem viu (só inclui, lê e apaga junto com o mural)', async () => {
    const privileges = await runtimePool.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'sysjb_app' AND table_name = 'mural_views' ORDER BY privilege_type`,
    );
    expect(privileges.rows.map((r) => r.privilege_type)).toEqual(['DELETE', 'SELECT']);
  });
});
