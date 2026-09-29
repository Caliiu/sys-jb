import type { INestApplication } from '@nestjs/common';
import type { LoginResponse, PublicUser } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createUser,
  KEYS,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
  syntheticUser,
} from './helpers.js';

let app: INestApplication;

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(async () => {
  await resetUsers();
  await migratorPool.query('UPDATE tenants SET support_phone = NULL');
});

const TENANT_PHONE = '11987654321';

async function loginAs(person: PublicUser) {
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
}

/** Jogador cadastrado pelo link de convite de `inviter`. */
async function referredBy(inviter: PublicUser) {
  const res = await api(app, 'aurora').post('/v1/users', syntheticUser({ inviteCode: inviter.inviteCode }));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as PublicUser;
}

async function setTenantPhone(phone: string | null) {
  const manager = await loginOperator(app, 'aurora');
  const current = (await manager.http.get('/v1/admin/branding')).body;
  const { logoUrl: _logo, hasCustomLogo: _custom, ...rest } = current;
  const res = await manager.http.put('/v1/admin/branding', { ...rest, supportPhone: phone });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return manager;
}

const support = async (person: PublicUser) => (await (await loginAs(person)).get('/v1/me/support')).body;

describe('WhatsApp do atendimento', () => {
  it('sem promotor: o número da banca (ou nenhum, se não configurado)', async () => {
    const player = await createUser(app, 'aurora');
    const message = `Olá, preciso de ajuda, meu código de unidade é: ${player.displayId}.`;
    expect(await support(player)).toEqual({ phone: null, message });
    await setTenantPhone('(11) 98765-4321');
    expect(await support(player)).toEqual({ phone: TENANT_PHONE, message });
  });

  it('com promotor ativo vinculado: o número do promotor', async () => {
    await setTenantPhone(TENANT_PHONE);
    const promoter = await createUser(app, 'aurora');
    const manager = await loginOperator(app, 'aurora');
    expect((await manager.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 500 })).status).toBe(200);
    const player = await referredBy(promoter);

    const http = await loginAs(player);
    const res = await http.get('/v1/me/support');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      phone: promoter.phone,
      message: `Olá Promotor ${promoter.name}, preciso de ajuda, meu código de unidade é: ${player.displayId}.`,
    });
  });

  it('indicado por jogador comum, promotor removido ou bloqueado: volta ao número da banca', async () => {
    await setTenantPhone(TENANT_PHONE);
    const manager = await loginOperator(app, 'aurora');

    const friend = await createUser(app, 'aurora');
    const ofFriend = await referredBy(friend);
    expect(await support(ofFriend)).toEqual({
      phone: TENANT_PHONE,
      message: `Olá, preciso de ajuda, meu código de unidade é: ${ofFriend.displayId}.`,
    });

    const removed = await createUser(app, 'aurora');
    await manager.http.put(`/v1/admin/promoters/${removed.id}`, { commissionBps: 500 });
    const ofRemoved = await referredBy(removed);
    await manager.http.delete(`/v1/admin/promoters/${removed.id}`);
    expect((await support(ofRemoved)).phone).toBe(TENANT_PHONE);

    const blocked = await createUser(app, 'aurora');
    await manager.http.put(`/v1/admin/promoters/${blocked.id}`, { commissionBps: 500 });
    const ofBlocked = await referredBy(blocked);
    await manager.http.patch(`/v1/admin/users/${blocked.id}/status`, { status: 'BLOCKED' });
    expect(await support(ofBlocked)).toEqual({
      phone: TENANT_PHONE,
      message: `Olá, preciso de ajuda, meu código de unidade é: ${ofBlocked.displayId}.`,
    });
  });

  it('exige sessão; o número da banca é público (login) e o de outra banca não vaza', async () => {
    await setTenantPhone(TENANT_PHONE);
    expect((await api(app, 'aurora').get('/v1/me/support')).status).toBe(401);
    expect((await api(app, 'aurora').get('/v1/tenant')).body.supportPhone).toBe(TENANT_PHONE);
    expect((await api(app, 'boreal').get('/v1/tenant')).body.supportPhone).toBeNull();
  });

  it('painel: valida, aceita máscara, remove com null ou vazio e audita', async () => {
    const manager = await setTenantPhone('(11) 3456-7890');
    const current = (await manager.http.get('/v1/admin/branding')).body;
    expect(current.supportPhone).toBe('1134567890');
    const { logoUrl: _logo, hasCustomLogo: _custom, ...rest } = current;
    for (const phone of ['123', '(11) 1234-5678', '+55 11 98765-4321', 'abc', '1'.repeat(40)]) {
      const res = await manager.http.put('/v1/admin/branding', { ...rest, supportPhone: phone });
      expect(res.status, phone).toBe(400);
      expect(res.body.details[0].field).toBe('supportPhone');
    }
    const cleared = await manager.http.put('/v1/admin/branding', { ...rest, supportPhone: '' });
    expect(cleared.body.supportPhone).toBeNull();
    const audit = await manager.http.get('/v1/admin/audit');
    expect(audit.body.items[0].details).toEqual({ fields: ['WhatsApp do suporte'] });
  });
});
