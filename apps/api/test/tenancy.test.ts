import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizeHost } from '../src/tenancy/host.js';
import { api, createUser, KEYS, migratorPool, resetUsers, startApp, tenantId } from './helpers.js';

let app: INestApplication;
let server: App;

beforeAll(async () => {
  app = await startApp();
  server = app.getHttpServer() as App;
});
afterAll(async () => {
  await app.close();
  await migratorPool.end();
});
beforeEach(resetUsers);

describe('resolução de banca por hostname', () => {
  it('normaliza caixa, ponto final e porta de forma consistente', () => {
    expect(normalizeHost('Aurora.Test:3000')).toBe('aurora.test');
    expect(normalizeHost('aurora.test.')).toBe('aurora.test');
    expect(normalizeHost('aurora.test:4000')).toBe('aurora.test');
    expect(normalizeHost('[::1]:4000')).toBeNull();
    expect(normalizeHost('aurora.test:abc')).toBeNull();
    expect(normalizeHost('aurora_test')).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
  });

  it('a mesma banca é resolvida com ou sem porta', async () => {
    for (const host of ['aurora.test', 'aurora.test:4000', 'AURORA.TEST:3000']) {
      const res = await request(server)
        .get('/v1/tenant')
        .set('Host', host)
        .set('Authorization', `Bearer ${KEYS.aurora}`);
      expect(res.status, host).toBe(200);
      expect(res.body).toMatchObject({ slug: 'aurora' });
      expect(res.body).not.toHaveProperty('id');
    }
  });

  it('hostname desconhecido falha sem fallback para outra banca', async () => {
    for (const host of ['desconhecida.test', 'aurora.test.evil.test', 'test', 'localhost']) {
      const res = await request(server)
        .get('/v1/tenant')
        .set('Host', host)
        .set('Authorization', `Bearer ${KEYS.aurora}`);
      expect(res.status, host).toBe(404);
      expect(res.body.code).toBe('TENANT_NOT_FOUND');
    }
  });

  it('banca inativa falha mesmo com a credencial dela', async () => {
    const res = await api(app, 'cometa').get('/v1/tenant');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('X-Forwarded-Host é ignorado quando não há proxy confiável', async () => {
    const res = await request(server)
      .get('/v1/tenant')
      .set('Host', 'aurora.test')
      .set('X-Forwarded-Host', 'boreal.test')
      .set('Authorization', `Bearer ${KEYS.boreal}`);
    expect(res.status).toBe(403);
  });

  it('X-Forwarded-Host só vale atrás de proxy explicitamente confiável', async () => {
    const proxied = await startApp({ trustProxy: 'loopback' });
    try {
      const res = await request(proxied.getHttpServer() as App)
        .get('/v1/tenant')
        .set('Host', 'aurora.test')
        .set('X-Forwarded-Host', 'boreal.test')
        .set('Authorization', `Bearer ${KEYS.boreal}`);
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('boreal');
    } finally {
      await proxied.close();
    }
  });
});

describe('9. credencial de serviço por banca', () => {
  it('sem credencial ou com credencial inválida: 401', async () => {
    const user = await createUser(app, 'aurora');
    const noKey = await request(server).get(`/v1/users/${user.id}`).set('Host', 'aurora.test');
    expect(noKey.status).toBe(401);
    const wrongKey = await api(app, 'aurora', 'x'.repeat(48)).get(`/v1/users/${user.id}`);
    expect(wrongKey.status).toBe(401);
    const basic = await request(server)
      .get(`/v1/users/${user.id}`)
      .set('Host', 'aurora.test')
      .set('Authorization', `Basic ${KEYS.aurora}`);
    expect(basic.status).toBe(401);
    expect(noKey.body).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Credencial de serviço ausente ou inválida.',
    });
  });

  it('credencial de uma banca não autoriza outra: 403', async () => {
    const user = await createUser(app, 'aurora');
    const get = await api(app, 'boreal', KEYS.aurora).get(`/v1/users/${user.id}`);
    expect(get.status).toBe(403);
    const post = await api(app, 'boreal', KEYS.aurora).post('/v1/users', {
      name: 'X Y',
      phone: '11999999999',
      document: '99999999999',
    });
    expect(post.status).toBe(403);
    const reverse = await api(app, 'aurora', KEYS.boreal).get(`/v1/users/${user.id}`);
    expect(reverse.status).toBe(403);
  });

  it('/health não exige credencial nem expõe segredos', async () => {
    const res = await request(server).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });
});

describe('4. GET e PATCH isolados por banca', () => {
  it('usuário de outra banca é 404 no GET e no PATCH, e não é alterado', async () => {
    const aurora = await createUser(app, 'aurora', { email: 'isolado@exemplo.test' });

    const get = await api(app, 'boreal').get(`/v1/users/${aurora.id}`);
    expect(get.status).toBe(404);
    expect(get.body).toEqual({ statusCode: 404, code: 'NOT_FOUND', message: 'Usuário não encontrado.' });

    const patch = await api(app, 'boreal').patch(`/v1/users/${aurora.id}`, { name: 'Invasor' });
    expect(patch.status).toBe(404);

    const after = await api(app, 'aurora').get(`/v1/users/${aurora.id}`);
    expect(after.body).toEqual(aurora);
  });

  it('tenantId em query ou header não muda a banca', async () => {
    const aurora = await createUser(app, 'aurora');
    const auroraTenant = await tenantId('aurora');
    const res = await api(app, 'boreal')
      .raw()
      .get(`/v1/users/${aurora.id}?tenantId=${auroraTenant}&tenant=aurora`)
      .set('Host', 'boreal.test')
      .set('Authorization', `Bearer ${KEYS.boreal}`)
      .set('X-Tenant-Id', auroraTenant);
    expect(res.status).toBe(404);
  });

  it('UUID inexistente é 404; UUID malformado é 400', async () => {
    expect((await api(app, 'aurora').get('/v1/users/7d3c1b0e-8f4a-4b6e-9c2d-1a2b3c4d5e6f')).status).toBe(404);
    expect((await api(app, 'aurora').get('/v1/users/123')).status).toBe(400);
  });
});
