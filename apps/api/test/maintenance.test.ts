import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';
import {
  asTenant,
  createUser,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  tenantId,
} from './helpers.js';

let app: INestApplication;
let auroraId: string;
let borealId: string;

beforeAll(async () => {
  app = await startApp();
  [auroraId, borealId] = await Promise.all([tenantId('aurora'), tenantId('boreal')]);
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(async () => {
  await resetUsers();
  await migratorPool.query('TRUNCATE result_consultations');
});

const hash = () => randomBytes(32).toString('hex');
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

/** Sessão de jogador criada com as datas pedidas (dados sintéticos). */
async function session(
  tenant: string,
  userId: string,
  createdDaysAgo: number,
  expiresDaysAgo: number,
  revoked = false,
) {
  await asTenant(migratorPool, tenant, (c) =>
    c.query(
      `INSERT INTO sessions (tenant_id, user_id, token_hash, created_at, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenant, userId, hash(), ago(createdDaysAgo), ago(expiresDaysAgo), revoked ? ago(expiresDaysAgo) : null],
    ),
  );
}

const count = (tenant: string, table: string) =>
  asTenant(migratorPool, tenant, async (c) => Number((await c.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n));

describe('limpeza diária (maintenance_purge)', () => {
  it('apaga só o vencido há mais tempo que o prazo, em todas as bancas, e mantém o resto', async () => {
    const a = await createUser(app, 'aurora');
    const b = await createUser(app, 'boreal');
    await loginOperator(app, 'aurora'); // sessão de operador ativa (fica)

    // Jogadores: vencidas há 8+ dias saem; vencida há 2 dias, encerrada há 2 dias e ativa ficam.
    await session(auroraId, a.id, 30, 20);
    await session(auroraId, a.id, 10, 8, true);
    await session(auroraId, a.id, 3, 2);
    await session(auroraId, a.id, 1, -1, false);
    await session(borealId, b.id, 30, 9);

    // Operador: uma vencida há 10 dias sai.
    await asTenant(migratorPool, auroraId, async (c) => {
      const { rows } = await c.query('SELECT id FROM operators LIMIT 1');
      await c.query(
        `INSERT INTO operator_sessions (tenant_id, operator_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [auroraId, rows[0].id, hash(), ago(11), ago(10)],
      );
    });

    // Tentativas de login: mais de 1 dia saem.
    await asTenant(migratorPool, auroraId, (c) =>
      c.query(
        `INSERT INTO login_failures (tenant_id, identifier_hash, created_at) VALUES ($1, $2, $3), ($1, $4, now())`,
        [auroraId, hash(), ago(2), hash()],
      ),
    );
    await migratorPool.query(
      `INSERT INTO operator_login_failures (identifier_hash, created_at) VALUES ($1, $2), ($3, now())`,
      [hash(), ago(3), hash()],
    );

    // Consultas ao provedor: mais de 90 dias saem.
    await migratorPool.query(
      `INSERT INTO result_consultations (requested_at, draw_date, lottery, status, http_status, responses)
       VALUES ($1, '2026-01-01', 'rj', 'OK', 200, 1), (now(), '2026-10-05', 'rj', 'OK', 200, 1)`,
      [ago(120)],
    );

    const before = { aurora: await count(auroraId, 'sessions'), boreal: await count(borealId, 'sessions') };
    const result = await app.get(MaintenanceService).purge();

    expect(result).toEqual({
      sessions: 3,
      operatorSessions: 1,
      loginFailures: 1,
      operatorLoginFailures: 1,
      resultConsultations: 1,
    });
    // Aurora perde as 2 vencidas há mais de 7 dias; Boreal, 1. As recentes e as ativas ficam.
    expect(await count(auroraId, 'sessions')).toBe(before.aurora - 2);
    expect(await count(borealId, 'sessions')).toBe(before.boreal - 1);
    expect(await count(auroraId, 'operator_sessions')).toBe(1);
    expect(await count(auroraId, 'login_failures')).toBe(1);
    expect(Number((await migratorPool.query('SELECT count(*) AS n FROM operator_login_failures')).rows[0].n)).toBe(1);
    expect(Number((await migratorPool.query('SELECT count(*) AS n FROM result_consultations')).rows[0].n)).toBe(1);

    // Repetir não apaga mais nada.
    expect(await app.get(MaintenanceService).purge()).toEqual({
      sessions: 0,
      operatorSessions: 0,
      loginFailures: 0,
      operatorLoginFailures: 0,
      resultConsultations: 0,
    });
  });

  it('a role de runtime não apaga essas tabelas diretamente: só pela função', async () => {
    await expect(runtimePool.query('DELETE FROM sessions')).rejects.toThrow(/permission denied/);
    await expect(runtimePool.query('DELETE FROM operator_sessions')).rejects.toThrow(/permission denied/);
    await expect(runtimePool.query('DELETE FROM result_consultations')).rejects.toThrow(/permission denied/);
    await expect(runtimePool.query('SELECT * FROM maintenance_purge()')).resolves.toBeDefined();
  });
});
