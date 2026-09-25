import type { INestApplication } from '@nestjs/common';
import type { PublicUser } from '@sysjb/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/database/database.service.js';
import {
  api,
  asTenant,
  createUser,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  syntheticUser,
  tenantId,
} from './helpers.js';

let app: INestApplication;
let aurora: string;
let boreal: string;
let auroraUser: PublicUser;
let borealUser: PublicUser;

beforeAll(async () => {
  // Pool pequeno de propósito: força reutilização de conexões entre bancas.
  app = await startApp({ dbPoolMax: 2 });
  aurora = await tenantId('aurora');
  boreal = await tenantId('boreal');
  await resetUsers();
  auroraUser = await createUser(app, 'aurora');
  borealUser = await createUser(app, 'boreal');
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});

describe('5. role de runtime e políticas RLS', () => {
  it('a role de runtime não é superuser, não tem BYPASSRLS e não é dona das tabelas', async () => {
    const { rows } = await runtimePool.query<{ rolsuper: boolean; rolbypassrls: boolean; owned: string }>(`
      SELECT r.rolsuper, r.rolbypassrls,
             (SELECT count(*) FROM pg_tables t WHERE t.schemaname = 'public' AND t.tableowner = current_user) AS owned
      FROM pg_roles r WHERE r.rolname = current_user`);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, owned: '0' });

    const rls = await runtimePool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
      WHERE relname IN ('users', 'wallets') ORDER BY relname`);
    expect(rls.rows).toEqual([
      { relname: 'users', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'wallets', relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it('sem contexto de banca: nenhuma linha visível e nenhuma escrita', async () => {
    const users = await runtimePool.query('SELECT id FROM users');
    const wallets = await runtimePool.query('SELECT id FROM wallets');
    expect(users.rowCount).toBe(0);
    expect(wallets.rowCount).toBe(0);

    const u = syntheticUser();
    await expect(
      runtimePool.query(
        'INSERT INTO users (tenant_id, name, phone, document, birth_date, password_hash, updated_at) VALUES ($1, $2, $3, $4, make_date(1990, 1, 1), $$$argon2id$sintetico$$, now())',
        [aurora, u.name, u.phone, u.document],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const upd = await runtimePool.query("UPDATE users SET name = 'Sem Contexto'");
    expect(upd.rowCount).toBe(0);
  });

  it('com contexto: leitura restrita à banca corrente', async () => {
    const ids = await asTenant(
      runtimePool,
      aurora,
      async (c) => (await c.query<{ id: string }>('SELECT id FROM users')).rows,
    );
    expect(ids.map((r) => r.id)).toEqual([auroraUser.id]);
    const wallets = await asTenant(
      runtimePool,
      aurora,
      async (c) => (await c.query<{ tenant_id: string }>('SELECT tenant_id FROM wallets')).rows,
    );
    expect(wallets).toEqual([{ tenant_id: aurora }]);
  });

  it('com contexto: escrita cruzada é bloqueada (WITH CHECK e USING)', async () => {
    const u = syntheticUser();
    await expect(
      asTenant(runtimePool, aurora, (c) =>
        c.query(
          'INSERT INTO users (tenant_id, name, phone, document, birth_date, password_hash, updated_at) VALUES ($1, $2, $3, $4, make_date(1990, 1, 1), $$$argon2id$sintetico$$, now())',
          [boreal, u.name, u.phone, u.document],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const upd = await asTenant(runtimePool, aurora, (c) =>
      c.query("UPDATE users SET name = 'Invasor Sintético' WHERE id = $1", [borealUser.id]),
    );
    expect(upd.rowCount).toBe(0);

    // Mover um usuário para outra banca também viola o WITH CHECK (e tenant_id nem é atualizável).
    await expect(
      asTenant(runtimePool, aurora, (c) =>
        c.query('UPDATE users SET tenant_id = $1 WHERE id = $2', [boreal, auroraUser.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('privilégios mínimos: sem DELETE, sem alterar saldo, sem escolher id/displayId', async () => {
    await expect(
      asTenant(runtimePool, aurora, (c) => c.query('DELETE FROM users WHERE id = $1', [auroraUser.id])),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asTenant(runtimePool, aurora, (c) => c.query('UPDATE wallets SET balance_jb = 100')),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      asTenant(runtimePool, aurora, (c) => c.query('UPDATE users SET display_id = 1 WHERE id = $1', [auroraUser.id])),
    ).rejects.toMatchObject({ code: '42501' });
    const u = syntheticUser();
    await expect(
      asTenant(runtimePool, aurora, (c) =>
        c.query(
          'INSERT INTO users (tenant_id, name, phone, document, birth_date, password_hash, display_id, updated_at) VALUES ($1, $2, $3, $4, make_date(1990, 1, 1), $$$argon2id$sintetico$$, 1, now())',
          [aurora, u.name, u.phone, u.document],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('FK composta impede carteira apontando para usuário de outra banca', async () => {
    // Usuário de boreal ainda sem carteira, criado pela dona das tabelas só para este cenário.
    const u = syntheticUser();
    const orphanId = await asTenant(migratorPool, boreal, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        'INSERT INTO users (tenant_id, name, phone, document, birth_date, password_hash, updated_at) VALUES ($1, $2, $3, $4, make_date(1990, 1, 1), $$$argon2id$sintetico$$, now()) RETURNING id',
        [boreal, u.name, u.phone, u.document],
      );
      return rows[0]!.id;
    });
    try {
      // Mesmo com contexto válido de aurora, a FK (tenant_id, user_id) barra a relação.
      await expect(
        asTenant(migratorPool, aurora, (c) =>
          c.query('INSERT INTO wallets (tenant_id, user_id, updated_at) VALUES ($1, $2, now())', [aurora, orphanId]),
        ),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      await asTenant(migratorPool, boreal, (c) => c.query('DELETE FROM users WHERE id = $1', [orphanId]));
    }
  });

  it('contexto inválido é rejeitado', async () => {
    await expect(asTenant(runtimePool, 'nao-e-uuid', (c) => c.query('SELECT id FROM users'))).rejects.toMatchObject({
      code: '22P02',
    });
  });
});

describe('6. contexto de banca não vaza pelo pool', () => {
  it('transações concorrentes e alternadas enxergam apenas a própria banca', async () => {
    const db = app.get(DatabaseService);
    const expected = { [aurora]: auroraUser.id, [boreal]: borealUser.id };

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const tenant = i % 2 === 0 ? aurora : boreal;
        return db.withTenant(tenant, async (tx) => {
          await tx.$executeRawUnsafe(`SELECT pg_sleep(${(Math.random() * 0.02).toFixed(3)})`);
          const [ctx] = await tx.$queryRaw<Array<{ t: string }>>`SELECT current_setting('app.tenant_id', true) AS t`;
          const users = await tx.user.findMany({ select: { id: true } });
          return { tenant, ctx: ctx?.t, users: users.map((u) => u.id) };
        });
      }),
    );

    for (const r of results) {
      expect(r.ctx).toBe(r.tenant);
      expect(r.users).toEqual([expected[r.tenant]]);
    }
  });

  it('após as transações, conexões do pool não carregam contexto residual', async () => {
    const db = app.get(DatabaseService);
    await db.withTenant(aurora, (tx) => tx.user.findMany());
    const residual = await Promise.all(
      Array.from(
        { length: 6 },
        () =>
          db.client.$queryRaw<Array<{ t: string | null; n: bigint }>>`
          SELECT current_setting('app.tenant_id', true) AS t, (SELECT count(*) FROM users) AS n`,
      ),
    );
    for (const [row] of residual) {
      expect(row?.t ?? '').toBe('');
      expect(Number(row?.n)).toBe(0);
    }
  });

  it('requisições HTTP concorrentes e alternadas retornam somente dados da própria banca', async () => {
    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const own = i % 2 === 0;
        const tenant = i % 4 < 2 ? 'aurora' : 'boreal';
        const user = tenant === 'aurora' ? auroraUser : borealUser;
        const other = tenant === 'aurora' ? borealUser : auroraUser;
        return api(app, tenant)
          .get(`/v1/users/${own ? user.id : other.id}`)
          .then((res) => ({ res, own, user }));
      }),
    );
    for (const { res, own, user } of responses) {
      if (own) {
        expect(res.status).toBe(200);
        expect(res.body).toEqual(user);
      } else {
        expect(res.status).toBe(404);
      }
    }
  });
});
