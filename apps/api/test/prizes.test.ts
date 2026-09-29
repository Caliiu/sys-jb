import type { INestApplication } from '@nestjs/common';
import { type LoginResponse, drawDateOf } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  createUser,
  KEYS,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  SYNTHETIC_PASSWORD,
} from './helpers.js';

let app: INestApplication;

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

async function player() {
  const person = await createUser(app, 'aurora');
  const login = await api(app, 'aurora').post('/v1/auth/login', {
    document: person.document,
    password: SYNTHETIC_PASSWORD,
  });
  return api(app, 'aurora', KEYS.aurora, { 'X-Session-Token': (login.body as LoginResponse).token });
}

const day = (offset: number) => drawDateOf(new Date().toISOString(), offset);

describe('GET /v1/me/prizes', () => {
  it('de hoje até 7 dias atrás: sem apuração de resultados, nenhuma pule premiada', async () => {
    const http = await player();
    for (const date of [day(0), day(-7)]) {
      const res = await http.get(`/v1/me/prizes?date=${date}`);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({ date, tickets: [], totalPrizeCents: 0 });
    }
  });

  it('recusa data fora da janela, malformada ou ausente, e campos extras', async () => {
    const http = await player();
    for (const query of [
      `date=${day(-8)}`,
      `date=${day(1)}`,
      'date=2026-02-30',
      'date=ontem',
      '',
      `date=${day(0)}&userId=x`,
    ]) {
      const res = await http.get(`/v1/me/prizes?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('exige a credencial da banca e a sessão do jogador', async () => {
    expect((await api(app, 'aurora').get(`/v1/me/prizes?date=${day(0)}`)).status).toBe(401);
    const noSession = await api(app, 'aurora', KEYS.aurora).get(`/v1/me/prizes?date=${day(0)}`);
    expect(noSession.status).toBe(401);
    expect(noSession.body.code).toBe('SESSION_INVALID');
  });
});

describe('GET /v1/me/prizes/claim', () => {
  it('sem apuração de resultados, nenhum prêmio pago: "não encontrado"', async () => {
    const http = await player();
    for (const pule of ['1', '562229026', '999999999999']) {
      const res = await http.get(`/v1/me/prizes/claim?pule=${pule}`);
      expect(res.status, pule).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({ status: 'not_found' });
    }
  });

  it('recusa código que não é o número da pule, e campos extras', async () => {
    const http = await player();
    for (const query of [
      'pule=0',
      'pule=0123',
      'pule=-5',
      'pule=1e3',
      'pule=12a',
      'pule=1000000000000',
      'pule=',
      '',
      'pule=1&userId=x',
    ]) {
      const res = await http.get(`/v1/me/prizes/claim?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('exige a credencial da banca e a sessão do jogador', async () => {
    expect((await api(app, 'aurora').get('/v1/me/prizes/claim?pule=1')).status).toBe(401);
    const noSession = await api(app, 'aurora', KEYS.aurora).get('/v1/me/prizes/claim?pule=1');
    expect(noSession.status).toBe(401);
    expect(noSession.body.code).toBe('SESSION_INVALID');
  });
});
