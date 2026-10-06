import type { INestApplication } from '@nestjs/common';
import type { CrmInactiveList, CrmNeverDepositedList } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

type Tenant = 'aurora' | 'boreal';

/** Cadastro feito há `daysAgo` dias (dados sintéticos; a data é ajustada direto no banco). */
async function signup(name: string, daysAgo = 0, extra: Record<string, unknown> = {}, tenant: Tenant = 'aurora') {
  const user = await createUser(app, tenant, { name, ...extra });
  const id = await tenantId(tenant);
  await asTenant(migratorPool, id, (c) =>
    c.query(`UPDATE users SET created_at = now() - make_interval(days => $2) WHERE id = $1`, [user.id, daysAgo]),
  );
  return user;
}

/** Recarga Pix paga há `daysAgo` dias (ou só criada, sem pagar). */
async function deposit(userId: string, cents: number, daysAgo: number, paid = true, tenant: Tenant = 'aurora') {
  const id = await tenantId(tenant);
  await asTenant(migratorPool, id, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO pix_deposits (tenant_id, user_id, gateway, destination, amount_cents, expires_at, created_at)
       VALUES ($1, $2, 'MISTICPAY', 'LOTTERIES', $3, now(), now() - make_interval(days => $4)) RETURNING id`,
      [id, userId, cents, daysAgo],
    );
    if (paid) {
      await c.query(
        `UPDATE pix_deposits SET status = 'PAID', paid_at = now() - make_interval(days => $2) WHERE id = $1`,
        [rows[0]!.id, daysAgo],
      );
    }
  });
}

const inactive = async (http: Awaited<ReturnType<typeof loginOperator>>['http'], query: string) => {
  const res = await http.get(`/v1/admin/crm/inactive?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as CrmInactiveList;
};
const never = async (http: Awaited<ReturnType<typeof loginOperator>>['http'], query: string) => {
  const res = await http.get(`/v1/admin/crm/never-deposited?${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as CrmNeverDepositedList;
};
const names = (list: { items: Array<{ player: { name: string } }> }) => list.items.map((row) => row.player.name);

describe('CRM: apostadores inativos', () => {
  it('quem já depositou e está na faixa de dias sem depositar; totais, contagem e dias de relacionamento', async () => {
    const session = await loginOperator(app, 'aurora');
    const ana = await signup('Ana Sintética', 40);
    await deposit(ana.id, 5000, 10);
    await deposit(ana.id, 2500, 3);
    await deposit(ana.id, 9999, 1, false); // pendente: não conta
    const bia = await signup('Bia Sintética', 60);
    await deposit(bia.id, 1000, 20);
    const caio = await signup('Caio Sintético', 5);
    await deposit(caio.id, 1000, 0, false); // só pendente: não é inativo (nunca pagou)

    const week = await inactive(session.http, 'minDays=1&maxDays=7');
    expect(week).toMatchObject({ minDays: 1, maxDays: 7, total: 1, totalPages: 1 });
    expect(week.items[0]).toMatchObject({
      player: { id: ana.id, name: 'Ana Sintética', displayId: ana.displayId },
      type: 'player',
      promoter: null,
      phone: ana.phone,
      totalDepositedCents: 7500,
      deposits: 2,
      daysWithoutDeposit: 3,
      relationshipDays: 40,
    });

    // Padrão: há mais tempo sem depositar primeiro.
    expect(names(await inactive(session.http, 'minDays=1&maxDays=30'))).toEqual(['Bia Sintética', 'Ana Sintética']);
    expect(names(await inactive(session.http, 'minDays=1&maxDays=30&sort=name&dir=asc'))).toEqual([
      'Ana Sintética',
      'Bia Sintética',
    ]);
    expect(names(await inactive(session.http, 'minDays=1&maxDays=30&sort=totalDeposited&dir=desc'))).toEqual([
      'Ana Sintética',
      'Bia Sintética',
    ]);
    expect(names(await inactive(session.http, 'minDays=0&maxDays=60'))).not.toContain('Caio Sintético');
  });

  it('só contas ativas da banca; promotor associado e filtro pelo promotor', async () => {
    const session = await loginOperator(app, 'aurora');
    const promoter = await signup('Paula Promotora', 90);
    await session.http.put(`/v1/admin/promoters/${promoter.id}`, { commissionBps: 700 });
    const referred = await signup('Rita Indicada', 30, { inviteCode: promoter.inviteCode });
    await deposit(referred.id, 3000, 5);
    const loose = await signup('Lia Solta', 30);
    await deposit(loose.id, 3000, 5);
    const blocked = await signup('Beto Bloqueado', 30);
    await deposit(blocked.id, 3000, 5);
    await session.http.patch(`/v1/admin/users/${blocked.id}/status`, { status: 'BLOCKED' });
    const outsider = await signup('Olga Outra Banca', 30, {}, 'boreal');
    await deposit(outsider.id, 3000, 5, true, 'boreal');

    const all = await inactive(session.http, 'minDays=1&maxDays=7&sort=name&dir=asc');
    expect(names(all)).toEqual(['Lia Solta', 'Rita Indicada']);
    expect(all.items[1]!.promoter).toEqual({ id: promoter.id, displayId: promoter.displayId, name: 'Paula Promotora' });

    const network = await inactive(session.http, `minDays=1&maxDays=7&promoterId=${promoter.id}`);
    expect(names(network)).toEqual(['Rita Indicada']);
    expect((await session.http.get(`/v1/admin/crm/inactive?minDays=1&maxDays=7&promoterId=${loose.id}`)).status).toBe(
      404,
    );
  });

  it('paginação com o total da faixa', async () => {
    const session = await loginOperator(app, 'aurora');
    for (let i = 1; i <= 3; i += 1) {
      const user = await signup(`Jogador ${i}`, 30);
      await deposit(user.id, 1000, i);
    }
    const page = await inactive(session.http, 'minDays=1&maxDays=7&pageSize=2&page=2');
    expect(page).toMatchObject({ total: 3, totalPages: 2, page: 2, pageSize: 2 });
    expect(names(page)).toEqual(['Jogador 1']);
  });
});

describe('CRM: nunca depositantes', () => {
  it('cadastrados na faixa de dias, ativos e sem nenhum depósito pago', async () => {
    const session = await loginOperator(app, 'aurora');
    await signup('Novo Hoje', 0);
    await signup('Novo Semana', 6);
    const pending = await signup('So Pendente', 3);
    await deposit(pending.id, 1000, 1, false);
    const payer = await signup('Ja Pagou', 3);
    await deposit(payer.id, 1000, 1);
    await signup('Antigo', 45);

    const week = await never(session.http, 'minDays=0&maxDays=7');
    // Padrão: cadastros mais antigos primeiro.
    expect(names(week)).toEqual(['Novo Semana', 'So Pendente', 'Novo Hoje']);
    expect(week.items[0]).toMatchObject({ relationshipDays: 6, type: 'player', promoter: null });
    expect(names(await never(session.http, 'minDays=30&maxDays=60'))).toEqual(['Antigo']);
  });
});

describe('CRM: validação e acesso', () => {
  it('faixa e ordenação conferidas; todo perfil do painel consulta; sem sessão, não', async () => {
    const session = await loginOperator(app, 'aurora');
    for (const query of [
      'minDays=8&maxDays=7',
      'minDays=-1&maxDays=7',
      'minDays=0&maxDays=3651',
      'minDays=0&maxDays=7&sort=password',
      'minDays=0&maxDays=7&extra=1',
      'maxDays=7',
    ]) {
      expect((await session.http.get(`/v1/admin/crm/inactive?${query}`)).status, query).toBe(400);
    }
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get('/v1/admin/crm/never-deposited?minDays=0&maxDays=7')).status).toBe(200);
    expect((await support.http.get('/v1/admin/crm/inactive?minDays=0&maxDays=7')).status).toBe(200);
  });

  it('isolamento: a outra banca não aparece', async () => {
    const session = await loginOperator(app, 'aurora');
    await signup('Da Aurora', 1);
    await signup('Da Boreal', 1, {}, 'boreal');
    expect(names(await never(session.http, 'minDays=0&maxDays=7'))).toEqual(['Da Aurora']);
  });
});
