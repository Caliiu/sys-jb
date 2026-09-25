import type { INestApplication } from '@nestjs/common';
import type { PublicUser } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, createUser, migratorPool, resetUsers, startApp, syntheticUser } from './helpers.js';

let app: INestApplication;

beforeAll(async () => {
  app = await startApp({ dbPoolMax: 8 });
});
afterAll(async () => {
  await app.close();
  await migratorPool.end();
});
beforeEach(resetUsers);

describe('3. unicidade por banca', () => {
  it.each(['phone', 'document', 'email'] as const)('%s duplicado na mesma banca retorna 409', async (field) => {
    const first = syntheticUser({ email: 'dup@exemplo.test' });
    await api(app, 'aurora').post('/v1/users', first).expect(201);

    const second = syntheticUser({ email: 'outro@exemplo.test', [field]: first[field as keyof typeof first] });
    const res = await api(app, 'aurora').post('/v1/users', second);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CONFLICT', details: [{ field }] });
    expect(res.text).not.toContain(String(first[field as keyof typeof first]));
  });

  it('email é comparado após normalização', async () => {
    await api(app, 'aurora')
      .post('/v1/users', syntheticUser({ email: 'caixa@exemplo.test' }))
      .expect(201);
    const res = await api(app, 'aurora').post('/v1/users', syntheticUser({ email: '  CAIXA@Exemplo.Test ' }));
    expect(res.status).toBe(409);
  });

  it('vários usuários sem email são permitidos', async () => {
    await createUser(app, 'aurora');
    await createUser(app, 'aurora', { email: null });
    await createUser(app, 'aurora');
  });

  it('mesmo telefone, documento e email em bancas diferentes são contas independentes', async () => {
    const data = syntheticUser({ email: 'mesmo@exemplo.test' });
    const a = await api(app, 'aurora').post('/v1/users', data);
    const b = await api(app, 'boreal').post('/v1/users', data);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
    expect(a.body.displayId).not.toBe(b.body.displayId);
  });

  it('PATCH que colide com outro usuário da banca retorna 409', async () => {
    const a = await createUser(app, 'aurora');
    const b = await createUser(app, 'aurora');
    const res = await api(app, 'aurora').patch(`/v1/users/${b.id}`, { document: a.document });
    expect(res.status).toBe(409);
    expect(res.body.details).toEqual([{ field: 'document', message: 'Já cadastrado.' }]);
  });

  it('cadastros concorrentes com o mesmo telefone: exatamente um vence, os demais recebem 409', async () => {
    const phone = syntheticUser().phone;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => api(app, 'aurora').post('/v1/users', syntheticUser({ phone }))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
  });
});

describe('8. displayId', () => {
  it('cadastros concorrentes recebem displayIds distintos, positivos e seguros', async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        api(app, i % 2 === 0 ? 'aurora' : 'boreal').post('/v1/users', syntheticUser()),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const ids = results.map((r) => (r.body as PublicUser).displayId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => Number.isSafeInteger(id) && id > 0)).toBe(true);
  });
});
