import type { INestApplication } from '@nestjs/common';
import type { PublicUser } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletsRepository } from '../src/users/users.repository.js';
import {
  api,
  asTenant,
  cpfFrom,
  createUser,
  formatCpf,
  KEYS,
  migratorPool,
  resetUsers,
  startApp,
  SYNTHETIC_PASSWORD,
  syntheticUser,
  tenantId,
  meOf,
  loginPlayer,
} from './helpers.js';

const CONTRACT_KEYS = [
  'id',
  'inviteCode',
  'name',
  'email',
  'phone',
  'document',
  'avatar',
  'displayId',
  'wallet',
  'promoter',
  'promoterName',
  'promoterPhone',
].sort();

const WALLET_KEYS = [
  'balanceJb',
  'bonusJb',
  'prizesJb',
  'balanceGames',
  'bonusGames',
  'prizesGames',
  'withdrawable',
  'totalAvailableJb',
  'totalAvailableGames',
].sort();

let app: INestApplication;
let auroraId: string;

beforeAll(async () => {
  app = await startApp();
  auroraId = await tenantId('aurora');
});
afterAll(async () => {
  await app.close();
  await migratorPool.end();
});
beforeEach(resetUsers);

async function countRows(tenant: string) {
  return asTenant(migratorPool, tenant, async (c) => {
    const users = await c.query<{ n: string }>('SELECT count(*) AS n FROM users');
    const wallets = await c.query<{ n: string }>('SELECT count(*) AS n FROM wallets');
    return { users: Number(users.rows[0]?.n), wallets: Number(wallets.rows[0]?.n) };
  });
}

describe('1. cadastro e contrato público', () => {
  it('persiste usuário e exatamente uma carteira zerada, com todos os campos do contrato', async () => {
    const cpf = cpfFrom('000000001');
    const res = await api(app, 'aurora').post('/v1/users', {
      name: '  Pessoa Sintética Contrato  ',
      phone: '(11) 90000-0001',
      document: formatCpf(cpf),
      birthDate: '1985-01-31',
      password: SYNTHETIC_PASSWORD,
      email: '  Contrato@Exemplo.TEST ',
    });

    expect(res.status).toBe(201);
    const user = res.body as PublicUser;
    expect(Object.keys(user).sort()).toEqual(CONTRACT_KEYS);
    expect(Object.keys(user.wallet).sort()).toEqual(WALLET_KEYS);
    expect(user).toMatchObject({
      name: 'Pessoa Sintética Contrato',
      email: 'contrato@exemplo.test',
      phone: '11900000001',
      document: cpf,
      avatar: null,
      promoter: null,
      promoterName: null,
      promoterPhone: null,
    });
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isSafeInteger(user.displayId) && user.displayId > 0).toBe(true);
    expect(Object.values(user.wallet).every((v) => v === 0)).toBe(true);
    // Nada interno vaza (nem senha/hash, nem data de nascimento).
    expect(JSON.stringify(user)).not.toMatch(/tenant|createdAt|updatedAt|password|argon|birth/i);
    expect(JSON.stringify(user)).not.toContain(SYNTHETIC_PASSWORD);

    const db = await asTenant(
      migratorPool,
      auroraId,
      async (c) => (await c.query('SELECT * FROM wallets WHERE user_id = $1', [user.id])).rows,
    );
    expect(db).toHaveLength(1);
    expect(db[0]).toMatchObject({
      tenant_id: auroraId,
      balance_jb: '0',
      bonus_jb: '0',
      prizes_jb: '0',
      balance_games: '0',
      bonus_games: '0',
      prizes_games: '0',
    });
  });

  it('GET /v1/me devolve o mesmo contrato, com nullables explícitos', async () => {
    const created = await createUser(app, 'aurora');
    const res = await (await loginPlayer(app, 'aurora', created)).http.get('/v1/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
    expect(res.text).toContain('"email":null');
    expect(res.text).toContain('"avatar":null');
    expect(res.text).toContain('"promoterPhone":null');
  });

  it('valida formatos e rejeita payload inválido com 400', async () => {
    const cases: Array<Record<string, unknown>> = [
      syntheticUser({ name: 'A' }),
      syntheticUser({ name: 'x'.repeat(121) }),
      syntheticUser({ phone: '123' }),
      syntheticUser({ phone: '+55 11 91234-5678' }),
      syntheticUser({ phone: 11912345678 }),
      syntheticUser({ document: '1234567890' }),
      syntheticUser({ document: 'abc.def.ghi-jk' }),
      syntheticUser({ email: 'nao-e-email' }),
      syntheticUser({ avatar: 'javascript:alert(1)' }),
      syntheticUser({ avatar: 'ftp://exemplo.test/a.png' }),
      { name: 'Sem Telefone', document: '00000000002' },
    ];
    for (const body of cases) {
      const res = await api(app, 'aurora').post('/v1/users', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    // Resposta de erro não ecoa valores enviados.
    const res = await api(app, 'aurora').post('/v1/users', syntheticUser({ email: 'segredo-invalido' }));
    expect(res.text).not.toContain('segredo-invalido');
    expect(await countRows(auroraId)).toEqual({ users: 0, wallets: 0 });
  });

  it('JSON malformado retorna 400 padronizado, sem stack trace', async () => {
    const res = await api(app, 'aurora')
      .raw()
      .post('/v1/users')
      .set('Host', 'aurora.test')
      .set('Authorization', `Bearer ${KEYS.aurora}`)
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'JSON inválido.' });
    expect(res.text).not.toMatch(/at |stack|node_modules/);
  });

  it('corpo acima de 16 KB retorna 413 padronizado', async () => {
    const res = await api(app, 'aurora').post('/v1/users', syntheticUser({ name: 'x'.repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Payload muito grande.' });
  });
});

describe('2. atomicidade do cadastro', () => {
  it('falha na criação da carteira desfaz o cadastro inteiro', async () => {
    const wallets = app.get(WalletsRepository);
    const spy = vi.spyOn(wallets, 'createForUser').mockRejectedValueOnce(new Error('falha simulada da carteira'));

    const res = await api(app, 'aurora').post('/v1/users', syntheticUser());

    expect(spy).toHaveBeenCalledOnce();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno.' });
    expect(await countRows(auroraId)).toEqual({ users: 0, wallets: 0 });
    spy.mockRestore();
  });

  it('banco rejeita carteira criada com saldo diferente de zero', async () => {
    const user = await createUser(app, 'aurora');
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query('INSERT INTO wallets (tenant_id, user_id, balance_jb, updated_at) VALUES ($1, $2, 100, now())', [
          auroraId,
          user.id,
        ]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('7. campos protegidos e semântica do PATCH', () => {
  const protectedFields: Record<string, unknown> = {
    id: '00000000-0000-4000-8000-000000000000',
    displayId: 1,
    tenantId: '00000000-0000-4000-8000-000000000000',
    wallet: { balanceJb: 100 },
    promoter: 'x',
    promoterName: 'x',
    promoterPhone: '11900000000',
    createdAt: '2020-01-01',
  };

  it('POST rejeita campos protegidos ou desconhecidos', async () => {
    for (const [field, value] of Object.entries(protectedFields)) {
      const res = await api(app, 'aurora').post('/v1/users', syntheticUser({ [field]: value }));
      expect(res.status, field).toBe(400);
      expect(res.body.details).toContainEqual({ field, message: 'Campo não permitido.' });
    }
    expect(await countRows(auroraId)).toEqual({ users: 0, wallets: 0 });
  });

  it('PATCH do perfil rejeita campos protegidos, de cadastro, corpo vazio e null em campo obrigatório', async () => {
    const user = await createUser(app, 'aurora');
    const { http } = await loginPlayer(app, 'aurora', user);
    // Nome, CPF e foto o jogador não altera (o nome e o CPF, só o painel).
    const notAllowed = { ...protectedFields, name: 'Outro Nome', document: cpfFrom('123456789'), avatar: null };
    for (const [field, value] of Object.entries(notAllowed)) {
      const res = await http.patch('/v1/me', { phone: '21999998888', [field]: value });
      expect(res.status, field).toBe(400);
    }
    expect((await http.patch('/v1/me', {})).status).toBe(400);
    expect((await http.patch('/v1/me', { phone: null })).status).toBe(400);
    expect(await meOf(app, 'aurora', user)).toEqual(user);
  });

  it('PATCH do perfil: campo ausente mantém valor; null limpa só o e-mail', async () => {
    const user = await createUser(app, 'aurora', {
      email: 'patch@exemplo.test',
      avatar: 'https://cdn.exemplo.test/a.png',
    });
    const { http } = await loginPlayer(app, 'aurora', user);

    expect((await http.patch('/v1/me', { phone: '(21) 3333-4444' })).status).toBe(200);
    expect(await meOf(app, 'aurora', user)).toEqual({ ...user, phone: '2133334444' });

    expect((await http.patch('/v1/me', { email: null })).status).toBe(200);
    const after = await meOf(app, 'aurora', user);
    expect(after).toMatchObject({ phone: '2133334444', email: null, avatar: user.avatar, displayId: user.displayId });
    expect(after.wallet).toEqual(user.wallet);
  });

  it('não expõe endpoints de exclusão, listagem ou alteração de carteira', async () => {
    const user = await createUser(app, 'aurora');
    const client = api(app, 'aurora');
    const del = await client.raw().delete(`/v1/users/${user.id}`).set('Host', 'aurora.test');
    expect(del.status).toBe(404);
    // Consulta e alteração por id com a credencial de serviço não existem (só /v1/me e o painel).
    expect((await client.get(`/v1/users/${user.id}`)).status).toBe(404);
    expect((await client.patch(`/v1/users/${user.id}`, { name: 'Nome Válido' })).status).toBe(404);
    expect((await client.get('/v1/users')).status).toBe(404);
    expect((await client.patch(`/v1/users/${user.id}/wallet`, { balanceJb: 1 })).status).toBe(404);
  });
});
