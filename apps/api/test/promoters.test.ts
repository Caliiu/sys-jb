import type { INestApplication } from '@nestjs/common';
import type { AdminPromoterListItem, AdminUserDetail, AdminUserListItem, OperatorRole } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  asTenant,
  cpfFrom,
  createUser,
  loginOperator,
  migratorPool,
  resetUsers,
  runtimePool,
  startApp,
  syntheticUser,
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

const promote = (session: Session, userId: string, commissionBps: number) =>
  session.http.put(`/v1/admin/promoters/${userId}`, { commissionBps });

const auditRows = (tenant: string, userId: string) =>
  asTenant(migratorPool, tenant, async (c) => {
    const { rows } = await c.query<{ action: string; details: unknown; operator_id: string }>(
      'SELECT action, details, operator_id FROM audit_logs WHERE target_id = $1 ORDER BY created_at, id',
      [userId],
    );
    return rows;
  });

/** Cadastra um jogador (POST /v1/users) com o código de convite informado. */
const register = (inviteCode?: string, tenant: 'aurora' | 'boreal' = 'aurora') =>
  api(app, tenant).post('/v1/users', syntheticUser(inviteCode === undefined ? {} : { inviteCode }));

const detail = async (session: Session, userId: string) =>
  (await session.http.get(`/v1/admin/users/${userId}`)).body as AdminUserDetail;

describe('perfis e permissões', () => {
  const matrix: Array<[OperatorRole, { read: number; set: number; remove: number }]> = [
    ['MANAGER', { read: 200, set: 200, remove: 204 }],
    ['FINANCE', { read: 200, set: 403, remove: 403 }],
    ['SUPPORT', { read: 403, set: 403, remove: 403 }],
  ];

  it.each(matrix)('%s', async (role, expected) => {
    const manager = await loginOperator(app, 'aurora', { role: 'MANAGER' });
    const session = role === 'MANAGER' ? manager : await loginOperator(app, 'aurora', { role });
    const promoter = await createUser(app, 'aurora');
    await promote(manager, promoter.id, 1000);
    const player = await createUser(app, 'aurora');

    expect((await session.http.get('/v1/admin/promoters')).status).toBe(expected.read);
    expect((await session.http.get(`/v1/admin/promoters/${promoter.id}`)).status).toBe(expected.read);
    expect((await session.http.get(`/v1/admin/promoters/${promoter.id}/referrals`)).status).toBe(expected.read);
    expect((await promote(session, player.id, 500)).status).toBe(expected.set);
    expect((await session.http.delete(`/v1/admin/promoters/${promoter.id}`)).status).toBe(expected.remove);
  });

  it('sem sessão de operador, nenhuma rota abre (a credencial do painel sozinha não basta)', async () => {
    const user = await createUser(app, 'aurora');
    const bare = api(app, 'aurora');
    expect((await bare.get('/v1/admin/promoters')).status).toBe(401);
    expect((await bare.get(`/v1/admin/promoters/${user.id}`)).status).toBe(401);
  });
});

describe('promover, alterar e remover', () => {
  it('promove um usuário existente, com a comissão em centésimos de %', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');

    const res = await promote(session, user.id, 1250);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      id: user.id,
      displayId: user.displayId,
      name: user.name,
      phone: user.phone,
      inviteCode: user.inviteCode,
      status: 'ACTIVE',
      commissionBps: 1250,
      referralsCount: 0,
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|document|tenantId|birthDate/);
    expect((await detail(session, user.id)).promoterCommissionBps).toBe(1250);
  });

  it('valida a comissão: inteiro de 1 a 10000, sem campos extras', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    const invalid = [
      { commissionBps: 0 },
      { commissionBps: -5 },
      { commissionBps: 10001 },
      { commissionBps: 12.5 },
      { commissionBps: '1000' },
      { commissionBps: null },
      {},
      { commissionBps: 1000, tenantId: 'x' },
      { commissionBps: 1000, referredByUserId: user.id },
    ];
    for (const body of invalid) {
      const res = await session.http.put(`/v1/admin/promoters/${user.id}`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect((await detail(session, user.id)).promoterCommissionBps).toBeNull();
    for (const bps of [1, 10000]) expect((await promote(session, user.id, bps)).status).toBe(200);
  });

  it('usuário inexistente, de outra banca ou id inválido', async () => {
    const session = await loginOperator(app, 'aurora');
    const foreign = await createUser(app, 'boreal');
    expect((await promote(session, foreign.id, 1000)).status).toBe(404);
    expect((await promote(session, '11111111-1111-4111-8111-111111111111', 1000)).status).toBe(404);
    expect((await session.http.put('/v1/admin/promoters/nao-e-uuid', { commissionBps: 1000 })).status).toBe(400);
    expect((await session.http.delete(`/v1/admin/promoters/${foreign.id}`)).status).toBe(404);
    expect((await api(app, 'boreal').get(`/v1/users/${foreign.id}`)).body).not.toHaveProperty('commissionBps');
  });

  it('a lista traz só promotores, com a contagem de jogadores, busca e paginação', async () => {
    const session = await loginOperator(app, 'aurora');
    const ana = await createUser(app, 'aurora', { name: 'Ana Promotora' });
    const bruno = await createUser(app, 'aurora', { name: 'Bruno Promotor' });
    await createUser(app, 'aurora', { name: 'Carla Jogadora' });
    await promote(session, ana.id, 1000);
    await promote(session, bruno.id, 500);
    await register(String(ana.displayId));
    await register(String(ana.displayId));

    const all = (await session.http.get('/v1/admin/promoters')).body;
    expect(all.total).toBe(2);
    expect((all.items as AdminPromoterListItem[]).map((p) => [p.name, p.commissionBps, p.referralsCount])).toEqual([
      ['Ana Promotora', 1000, 2],
      ['Bruno Promotor', 500, 0],
    ]);

    const found = (await session.http.get(`/v1/admin/promoters?search=${encodeURIComponent('bruno')}`)).body;
    expect(found.items.map((p: AdminPromoterListItem) => p.id)).toEqual([bruno.id]);

    const page2 = (await session.http.get('/v1/admin/promoters?page=2&pageSize=1')).body;
    expect(page2).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(page2.items.map((p: AdminPromoterListItem) => p.id)).toEqual([bruno.id]);
  });

  it('só enxerga promotores da própria banca', async () => {
    const aurora = await loginOperator(app, 'aurora');
    const boreal = await loginOperator(app, 'boreal');
    const foreign = await createUser(app, 'boreal');
    await promote(boreal, foreign.id, 800);

    expect((await aurora.http.get('/v1/admin/promoters')).body.total).toBe(0);
    expect((await aurora.http.get(`/v1/admin/promoters/${foreign.id}`)).status).toBe(404);
    expect((await aurora.http.get(`/v1/admin/promoters/${foreign.id}/referrals`)).status).toBe(404);
    expect((await boreal.http.get('/v1/admin/promoters')).body.total).toBe(1);
  });

  it('altera a comissão e registra a auditoria (antes/depois); repetir o valor não audita', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');

    await promote(session, user.id, 1000);
    await promote(session, user.id, 1000);
    await promote(session, user.id, 1500);
    expect(await auditRows(auroraId, user.id)).toEqual([
      {
        action: 'promoter.enable',
        operator_id: expect.any(String),
        details: { fields: ['promoterCommissionBps'], from: null, to: 1000 },
      },
      {
        action: 'promoter.update',
        operator_id: expect.any(String),
        details: { fields: ['promoterCommissionBps'], from: 1000, to: 1500 },
      },
    ]);
  });

  it('remover: deixa de ser promotor, mantém quem já foi indicado e audita; repetir é aceito', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await promote(session, promoter.id, 1000);
    const player = (await register(String(promoter.displayId))).body;

    expect((await session.http.delete(`/v1/admin/promoters/${promoter.id}`)).status).toBe(204);
    expect((await session.http.delete(`/v1/admin/promoters/${promoter.id}`)).status).toBe(204);
    expect((await session.http.get(`/v1/admin/promoters/${promoter.id}`)).status).toBe(404);
    expect((await detail(session, promoter.id)).promoterCommissionBps).toBeNull();

    // Histórico preservado. Sem ser promotor, o link continua valendo como indicação comum (Promotor ≠ Indicação).
    const asReferrer = {
      id: promoter.id,
      displayId: promoter.displayId,
      name: promoter.name,
      promoterCommissionBps: null,
    };
    expect((await detail(session, player.id)).referredBy).toEqual(asReferrer);
    const late = (await register(String(promoter.displayId))).body;
    expect((await detail(session, late.id)).referredBy).toEqual(asReferrer);

    const actions = (await auditRows(auroraId, promoter.id)).map((row) => row.action);
    expect(actions).toEqual(['promoter.enable', 'promoter.disable']);
  });

  it('remover quem nunca foi promotor é aceito sem efeito e sem auditoria', async () => {
    const session = await loginOperator(app, 'aurora');
    const user = await createUser(app, 'aurora');
    expect((await session.http.delete(`/v1/admin/promoters/${user.id}`)).status).toBe(204);
    expect(await auditRows(auroraId, user.id)).toEqual([]);
  });

  it('permissão negada não altera nada nem gera auditoria', async () => {
    const finance = await loginOperator(app, 'aurora', { role: 'FINANCE' });
    const user = await createUser(app, 'aurora');
    await promote(finance, user.id, 1000);
    expect((await detail(finance, user.id)).promoterCommissionBps).toBeNull();
    expect(await auditRows(auroraId, user.id)).toEqual([]);
  });
});

describe('cadastro pelo link de convite', () => {
  it('vincula o novo jogador ao promotor; a lista e o detalhe mostram o vínculo', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await promote(session, promoter.id, 1000);

    const res = await register(String(promoter.displayId));
    expect(res.status).toBe(201);
    // O jogador não vê o vínculo na resposta pública (campos de promotor seguem null).
    expect(res.body).toMatchObject({ promoter: null, promoterName: null, promoterPhone: null });
    // Traz só o código de convite DELE (nunca o de quem indicou) e nada do vínculo.
    expect(res.body.inviteCode).not.toBe(promoter.inviteCode);
    expect(JSON.stringify(res.body)).not.toMatch(/referredBy/);

    expect((await detail(session, res.body.id)).referredBy).toEqual({
      id: promoter.id,
      displayId: promoter.displayId,
      name: promoter.name,
      promoterCommissionBps: 1000,
    });
    const referrals = (await session.http.get(`/v1/admin/promoters/${promoter.id}/referrals`)).body;
    expect(referrals.total).toBe(1);
    expect((referrals.items as AdminUserListItem[]).map((item) => item.id)).toEqual([res.body.id]);
    const ref = { id: promoter.id, displayId: promoter.displayId, name: promoter.name, commissionBps: 1000 };
    expect((referrals.items as AdminUserListItem[])[0]!.promoter).toEqual(ref);
    const listed = (await session.http.get('/v1/admin/users')).body.items as AdminUserListItem[];
    expect(listed.find((item) => item.id === res.body.id)!.promoter).toEqual(ref);
    expect(listed.find((item) => item.id === promoter.id)!.promoter).toBeNull();
    expect((await session.http.get(`/v1/admin/promoters/${promoter.id}`)).body.referralsCount).toBe(1);
  });

  it('lista de usuários filtra pelos indicados de um promotor (id de jogador comum não lista ninguém)', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    const other = await createUser(app, 'aurora');
    const plain = await createUser(app, 'aurora');
    await promote(session, promoter.id, 1000);
    await promote(session, other.id, 700);
    const mine = await register(String(promoter.displayId));
    await register(String(other.displayId));
    await register(String(plain.displayId));

    const ids = async (promoterId: string) =>
      ((await session.http.get(`/v1/admin/users?promoterId=${promoterId}`)).body.items as AdminUserListItem[]).map(
        (item) => item.id,
      );
    expect(await ids(promoter.id)).toEqual([mine.body.id]);
    expect(await ids(plain.id)).toEqual([]);
    expect((await session.http.get('/v1/admin/users?promoterId=nao-e-uuid')).status).toBe(400);
  });

  it('opções do filtro: todos os promotores da banca, por nome; basta users.read', async () => {
    const manager = await loginOperator(app, 'aurora');
    const bia = await createUser(app, 'aurora', { name: 'Bia Promotora' });
    const ana = await createUser(app, 'aurora', { name: 'Ana Promotora' });
    await createUser(app, 'aurora', { name: 'Caio Jogador' });
    await promote(manager, bia.id, 1000);
    await promote(manager, ana.id, 500);
    const boreal = await loginOperator(app, 'boreal');
    await promote(boreal, (await createUser(app, 'boreal')).id, 1000);

    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    const res = await support.http.get('/v1/admin/promoters/options');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual([
      { id: ana.id, displayId: ana.displayId, name: 'Ana Promotora' },
      { id: bia.id, displayId: bia.displayId, name: 'Bia Promotora' },
    ]);
  });

  it('código desconhecido, de usuário bloqueado ou de outra banca: cadastro segue sem vínculo; jogador comum indica', async () => {
    const session = await loginOperator(app, 'aurora');
    const plain = await createUser(app, 'aurora');
    const blocked = await createUser(app, 'aurora');
    await promote(session, blocked.id, 1000);
    await session.http.patch(`/v1/admin/users/${blocked.id}/status`, { status: 'BLOCKED' });
    const boreal = await loginOperator(app, 'boreal');
    const foreign = await createUser(app, 'boreal');
    await promote(boreal, foreign.id, 1000);

    for (const code of ['999999999', String(blocked.displayId), String(foreign.displayId)]) {
      const res = await register(code);
      expect(res.status, code).toBe(201);
      expect((await detail(session, res.body.id)).referredBy, code).toBeNull();
    }
    // Indicação comum: o jogador que não é promotor também indica (ganha só a % de indicação).
    const byPlain = await register(String(plain.displayId));
    expect((await detail(session, byPlain.body.id)).referredBy).toMatchObject({
      id: plain.id,
      promoterCommissionBps: null,
    });
  });

  it('cada usuário tem um código de convite de 5 caracteres, único e sem ambíguos', async () => {
    const people = await Promise.all(Array.from({ length: 30 }, () => createUser(app, 'aurora')));
    const codes = people.map((p) => p.inviteCode);
    expect(codes.every((code) => /^[A-HJ-NP-Z2-9]{5}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    // Fixo: consultar de novo devolve o mesmo código; a API não deixa trocar.
    const again = await api(app, 'aurora').get(`/v1/users/${people[0]!.id}`);
    expect(again.body.inviteCode).toBe(people[0]!.inviteCode);
    expect((await api(app, 'aurora').patch(`/v1/users/${people[0]!.id}`, { inviteCode: 'ABCDE' })).status).toBe(400);
    await expect(
      asTenant(runtimePool, auroraId, (c) =>
        c.query("UPDATE users SET invite_code = 'ABCDE' WHERE id = $1", [people[0]!.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    // O banco recusa código fora do formato e código repetido (único no sistema todo, entre bancas).
    const foreign = await createUser(app, 'boreal');
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query('UPDATE users SET invite_code = $2 WHERE id = $1', [people[1]!.id, 'abcd0']),
      ),
    ).rejects.toThrow(/users_invite_code_format/);
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query('UPDATE users SET invite_code = $2 WHERE id = $1', [people[1]!.id, foreign.inviteCode]),
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('o link usa o código (maiúsculas ou minúsculas); links antigos com o ID continuam valendo', async () => {
    const session = await loginOperator(app, 'aurora');
    const referrer = await createUser(app, 'aurora');
    for (const code of [
      referrer.inviteCode,
      referrer.inviteCode.toLowerCase(),
      ` ${referrer.inviteCode} `,
      String(referrer.displayId),
    ]) {
      const res = await register(code);
      expect(res.status, code).toBe(201);
      expect((await detail(session, res.body.id)).referredBy?.id, code).toBe(referrer.id);
    }
    // O painel mostra o código no detalhe e acha o usuário por ele.
    expect((await detail(session, referrer.id)).inviteCode).toBe(referrer.inviteCode);
    const found = await session.http.get(`/v1/admin/users?search=${referrer.inviteCode.toLowerCase()}`);
    expect(found.body.items.map((u: { id: string }) => u.id)).toEqual([referrer.id]);
  });

  it('formato inválido do código é 400 e não cria usuário', async () => {
    // 5 caracteres com ambíguos (O, 0, I, 1), tamanho errado, ID exibido curto demais ou fora do int4.
    for (const code of [
      'abc',
      '12a',
      '-1',
      '',
      'ABCD',
      'ABCDEF',
      'ABCD0',
      'ABCDO',
      'ABCD1',
      'ABCDI',
      '12345',
      '1'.repeat(11),
      '2147483648',
      'AB-CD',
    ]) {
      const res = await register(code);
      expect(res.status, code).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('um jogador não se torna promotor nem escolhe o vínculo por outros caminhos', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await promote(session, promoter.id, 1000);
    const player = await createUser(app, 'aurora');

    for (const body of [
      { referredByUserId: promoter.id },
      { promoterCommissionBps: 5000 },
      { inviteCode: String(promoter.displayId) },
    ]) {
      expect((await api(app, 'aurora').patch(`/v1/users/${player.id}`, body)).status, JSON.stringify(body)).toBe(400);
    }
    for (const extra of [{ promoterCommissionBps: 5000 }, { referredByUserId: promoter.id }]) {
      expect((await api(app, 'aurora').post('/v1/users', syntheticUser(extra))).status).toBe(400);
    }
    expect((await detail(session, player.id)).referredBy).toBeNull();
    expect((await detail(session, player.id)).promoterCommissionBps).toBeNull();
  });
});

describe('banco de dados', () => {
  /** Como a role de runtime, dentro da banca Aurora. */
  const asRuntime = <T>(fn: (c: import('pg').PoolClient) => Promise<T>) => asTenant(runtimePool, auroraId, fn);

  it('a role de runtime não altera o vínculo (só nasce no cadastro) nem promove no INSERT', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await createUser(app, 'aurora');
    await promote(session, promoter.id, 1000);
    const player = (await register(String(promoter.displayId))).body;

    await expect(
      asRuntime((c) => c.query('UPDATE users SET referred_by_user_id = NULL WHERE id = $1', [player.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRuntime((c) =>
        c.query(
          `INSERT INTO users (tenant_id, name, phone, document, birth_date, password_hash, promoter_commission_bps, updated_at)
           VALUES ($1, 'Sem Permissao', '11900000000', $2, '1990-01-01', '$argon2id$x', 1000, now())`,
          [auroraId, cpfFrom('123456789')],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a role de runtime altera a comissão (é como o painel promove)', async () => {
    const user = await createUser(app, 'aurora');
    const res = await asRuntime((c) =>
      c.query('UPDATE users SET promoter_commission_bps = 700 WHERE id = $1', [user.id]),
    );
    expect(res.rowCount).toBe(1);
  });

  it('o banco recusa comissão fora da faixa, auto-indicação e indicação por usuário bloqueado', async () => {
    const user = await createUser(app, 'aurora');
    const plain = await createUser(app, 'aurora');
    await asTenant(migratorPool, auroraId, (c) =>
      c.query("UPDATE users SET status = 'BLOCKED' WHERE id = $1", [plain.id]),
    );
    const failing = (sql: string, params: unknown[]) => asTenant(migratorPool, auroraId, (c) => c.query(sql, params));

    for (const bps of [0, 10001, -1]) {
      await expect(
        failing('UPDATE users SET promoter_commission_bps = $2 WHERE id = $1', [user.id, bps]),
      ).rejects.toThrow(/users_promoter_commission_range/);
    }
    await expect(failing('UPDATE users SET referred_by_user_id = id WHERE id = $1', [user.id])).rejects.toThrow(
      /users_not_self_referred/,
    );
    await expect(
      failing(
        `INSERT INTO users (tenant_id, name, phone, document, birth_date, password_hash, referred_by_user_id, updated_at)
         VALUES ($1, 'Indicado Invalido', '11900000001', $2, '1990-01-01', '$argon2id$x', $3, now())`,
        [auroraId, cpfFrom('123456780'), plain.id],
      ),
    ).rejects.toThrow(/referrer must be an active user/);
  });
});
