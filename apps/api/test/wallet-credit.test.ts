import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { AdminUserDetail } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  asTenant,
  createOperator,
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

beforeAll(async () => {
  app = await startApp();
  auroraId = await tenantId('aurora');
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

type Session = Awaited<ReturnType<typeof loginOperator>>;

const credit = (session: Session, userId: string, extra: Record<string, unknown> = {}) =>
  session.http.post(`/v1/admin/users/${userId}/wallet/credits`, {
    idempotencyKey: randomUUID(),
    bucket: 'balance',
    amountCents: 1000,
    note: 'Crédito de teste',
    ...extra,
  });

const entriesOf = (userId: string) =>
  asTenant(migratorPool, auroraId, async (c) => {
    const { rows } = await c.query(
      `SELECT kind, balance_jb_delta, bonus_jb_delta, balance_games_delta, note, operator_id
       FROM wallet_entries WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    return rows;
  });

const auditOf = (userId: string) =>
  asTenant(migratorPool, auroraId, async (c) => {
    const { rows } = await c.query('SELECT action, details FROM audit_logs WHERE target_id = $1 ORDER BY created_at', [
      userId,
    ]);
    return rows;
  });

describe('POST /v1/admin/users/:id/wallet/credits', () => {
  it('adiciona saldo, bônus e disponível em games, com registro e auditoria', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');

    const a = await credit(session, user.id, { bucket: 'balance', amountCents: 1000 });
    const b = await credit(session, user.id, { bucket: 'bonus', amountCents: 250 });
    const c = await credit(session, user.id, { bucket: 'games', amountCents: 5000, note: '  Promoção de games  ' });
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
    expect(c.headers['cache-control']).toBe('no-store');
    expect((c.body as AdminUserDetail).wallet).toMatchObject({
      balanceJb: 1000,
      bonusJb: 250,
      balanceGames: 5000,
      totalAvailableJb: 1250,
      totalAvailableGames: 5000,
    });

    const op = session.operator.id;
    expect(await entriesOf(user.id)).toEqual([
      {
        kind: 'OPERATOR_CREDIT',
        balance_jb_delta: '1000',
        bonus_jb_delta: '0',
        balance_games_delta: '0',
        note: 'Crédito de teste',
        operator_id: op,
      },
      {
        kind: 'OPERATOR_CREDIT',
        balance_jb_delta: '0',
        bonus_jb_delta: '250',
        balance_games_delta: '0',
        note: 'Crédito de teste',
        operator_id: op,
      },
      {
        kind: 'OPERATOR_CREDIT',
        balance_jb_delta: '0',
        bonus_jb_delta: '0',
        balance_games_delta: '5000',
        note: 'Promoção de games',
        operator_id: op,
      },
    ]);
    expect(await auditOf(user.id)).toEqual([
      { action: 'wallet.credit', details: { fields: ['balanceJb'], amount: 1000 } },
      { action: 'wallet.credit', details: { fields: ['bonusJb'], amount: 250 } },
      { action: 'wallet.credit', details: { fields: ['balanceGames'], amount: 5000 } },
    ]);

    const log = await session.http.get(`/v1/admin/audit?userId=${user.id}&action=wallet.credit`);
    expect(log.body.items[0]).toMatchObject({
      action: 'wallet.credit',
      details: { fields: ['balanceGames'], amount: 5000 },
    });
  });

  it('mesma chave não credita de novo; a chave em outro lançamento é recusada', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    const key = randomUUID();

    expect((await credit(session, user.id, { idempotencyKey: key })).status).toBe(201);
    const again = await credit(session, user.id, { idempotencyKey: key });
    expect(again.status).toBe(201);
    expect(again.body.wallet.balanceJb).toBe(1000);

    const other = await credit(session, user.id, { idempotencyKey: key, amountCents: 999 });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('CONFLICT');
    expect(await entriesOf(user.id)).toHaveLength(1);
    expect(await auditOf(user.id)).toHaveLength(1);
  });

  it('cliques simultâneos com a mesma chave: um crédito só', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    const key = randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => credit(session, user.id, { idempotencyKey: key })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await entriesOf(user.id)).toHaveLength(1);
    expect(await auditOf(user.id)).toHaveLength(1);
  });

  it('só o Gerente credita; valores, bolsa e motivo são validados; outra banca é 404', async () => {
    const user = await createUser(app, 'aurora');
    for (const role of ['SUPPORT', 'FINANCE'] as const) {
      expect((await credit(await loginOperator(app, 'aurora', { role }), user.id)).status, role).toBe(403);
    }

    const session = await loginOperator(app, 'aurora');
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ amountCents: 0 }, 'amountCents'],
      [{ amountCents: 10_000_001 }, 'amountCents'],
      [{ amountCents: 10.5 }, 'amountCents'],
      [{ bucket: 'prizes' }, 'bucket'],
      [{ note: '  ' }, 'note'],
      [{ idempotencyKey: 'x' }, 'idempotencyKey'],
      [{ extra: 1 }, 'extra'],
    ];
    for (const [patch, field] of cases) {
      const res = await credit(session, user.id, patch);
      expect(res.status, JSON.stringify(patch)).toBe(400);
      expect(res.body.details?.[0]?.field, JSON.stringify(patch)).toBe(field);
    }

    const foreign = await createUser(app, 'boreal');
    expect((await credit(session, foreign.id)).status).toBe(404);
    expect(await entriesOf(user.id)).toEqual([]);
  });
});

describe('trava do banco no crédito', () => {
  it('a função recusa operador sem perfil Gerente, inativo ou de outra banca, mesmo chamada direto', async () => {
    const user = await createUser(app, 'aurora');
    const callAs = (operatorId: string) =>
      asTenant(runtimePool, auroraId, (c) =>
        c.query("SELECT wallet_operator_credit($1, $2, 'balance', 100, 'teste direto', gen_random_uuid())", [
          user.id,
          operatorId,
        ]),
      );
    const idOf = async (email: string, tenant: 'aurora' | 'boreal') =>
      asTenant(migratorPool, await tenantId(tenant), async (c) => {
        const { rows } = await c.query<{ id: string }>('SELECT id FROM operators WHERE email = $1', [email]);
        return rows[0]!.id;
      });

    const support = await createOperator('aurora', { role: 'SUPPORT' });
    const inactive = await createOperator('aurora', { active: false });
    const foreign = await createOperator('boreal');
    await expect(callAs(await idOf(support.email, 'aurora'))).rejects.toMatchObject({ code: '42501' });
    await expect(callAs(await idOf(inactive.email, 'aurora'))).rejects.toMatchObject({ code: '42501' });
    await expect(callAs(await idOf(foreign.email, 'boreal'))).rejects.toMatchObject({ code: '42501' });

    // Direto na tabela, a role de runtime continua sem poder mexer em saldo nem registrar movimentação.
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query('UPDATE wallets SET balance_games = 1 WHERE user_id = $1', [user.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await entriesOf(user.id)).toEqual([]);
  });
});
