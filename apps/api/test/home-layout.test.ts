import type { INestApplication } from '@nestjs/common';
import { DEFAULT_HOME_LAYOUT, type HomeLayout } from '@sysjb/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, asTenant, loginOperator, migratorPool, resetUsers, runtimePool, startApp, tenantId } from './helpers.js';

let app: INestApplication;

beforeAll(async () => {
  app = await startApp();
});
afterAll(async () => {
  await app.close();
  await Promise.all([migratorPool.end(), runtimePool.end()]);
});
beforeEach(resetUsers);

const clone = (layout: HomeLayout): HomeLayout => JSON.parse(JSON.stringify(layout)) as HomeLayout;

/** Cassino primeiro, Fazendinha antes de Loterias, Sonhos oculto, Atendimento oculto. */
function customLayout(): HomeLayout {
  const layout = clone(DEFAULT_HOME_LAYOUT);
  const casino = layout.blocks.splice(3, 1)[0]!;
  layout.blocks.unshift(casino);
  const primary = layout.blocks.find((b) => b.id === 'primary')!;
  primary.cards.reverse();
  layout.blocks.find((b) => b.id === 'utility')!.cards.find((c) => c.id === 'sonhos')!.visible = false;
  layout.blocks.find((b) => b.id === 'support')!.visible = false;
  return layout;
}

describe('Cards do início', () => {
  it('sem nada salvo vale a ordem padrão (painel e app)', async () => {
    const session = await loginOperator(app, 'aurora');
    const admin = await session.http.get('/v1/admin/branding/home');
    expect(admin.status).toBe(200);
    expect(admin.body).toEqual(DEFAULT_HOME_LAYOUT);
    const player = await api(app, 'aurora').get('/v1/tenant/home-layout');
    expect(player.status).toBe(200);
    expect(player.headers['cache-control']).toBe('no-store');
    expect(player.body).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('salva ordem e visibilidade; o app recebe na hora; auditoria descreve o que mudou', async () => {
    const session = await loginOperator(app, 'aurora');
    const layout = customLayout();
    const saved = await session.http.put('/v1/admin/branding/home', layout);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toEqual(layout);
    expect((await api(app, 'aurora').get('/v1/tenant/home-layout')).body).toEqual(layout);
    // Outra banca continua no padrão.
    expect((await api(app, 'boreal').get('/v1/tenant/home-layout')).body).toEqual(DEFAULT_HOME_LAYOUT);

    // Repetir não audita de novo.
    await session.http.put('/v1/admin/branding/home', layout);
    const audit = await session.http.get('/v1/admin/audit');
    expect(audit.body.items.map((e: { action: string; details: unknown }) => [e.action, e.details])).toEqual([
      [
        'home.layout.update',
        { fields: ['Ordem dos blocos', 'Ordem em Loterias e Fazendinha', 'Sonhos oculto', 'Atendimento oculto'] },
      ],
    ]);
  });

  it('recusa layout incompleto, repetido, com card de outro bloco ou campos extras', async () => {
    const session = await loginOperator(app, 'aurora');
    const missingBlock = clone(DEFAULT_HOME_LAYOUT);
    missingBlock.blocks.pop();
    const repeated = clone(DEFAULT_HOME_LAYOUT);
    repeated.blocks[5] = clone(DEFAULT_HOME_LAYOUT).blocks[0]!;
    const movedCard = clone(DEFAULT_HOME_LAYOUT);
    movedCard.blocks[1]!.cards.push({ id: 'bingo', visible: true });
    const missingCard = clone(DEFAULT_HOME_LAYOUT);
    missingCard.blocks[2]!.cards.pop();
    const unknownBlock = clone(DEFAULT_HOME_LAYOUT) as unknown as { blocks: Array<{ id: string }> };
    unknownBlock.blocks[0]!.id = 'banner';
    for (const body of [
      missingBlock,
      repeated,
      movedCard,
      missingCard,
      unknownBlock,
      { ...DEFAULT_HOME_LAYOUT, extra: 1 },
      { blocks: 'x' },
    ]) {
      const res = await session.http.put('/v1/admin/branding/home', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await api(app, 'aurora').get('/v1/tenant/home-layout')).body).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('só o Gerente consulta e altera', async () => {
    for (const role of ['FINANCE', 'SUPPORT'] as const) {
      const session = await loginOperator(app, 'aurora', { role });
      expect((await session.http.get('/v1/admin/branding/home')).status).toBe(403);
      expect((await session.http.put('/v1/admin/branding/home', DEFAULT_HOME_LAYOUT)).status).toBe(403);
    }
  });

  it('bloco ou card novo no catálogo entra no fim, visível; o que saiu é descartado', async () => {
    const id = await tenantId('aurora');
    // Gravado antes de existir "support" e com um card que não existe mais.
    const old = {
      blocks: [
        {
          id: 'games',
          visible: false,
          cards: [
            { id: 'bingo', visible: true },
            { id: 'antigo', visible: true },
          ],
        },
        { id: 'draw', visible: true, cards: [] },
      ],
    };
    await asTenant(migratorPool, id, (c) =>
      c.query('INSERT INTO tenant_settings (tenant_id, home_layout) VALUES ($1, $2)', [id, JSON.stringify(old)]),
    );
    const layout = (await api(app, 'aurora').get('/v1/tenant/home-layout')).body as HomeLayout;
    expect(layout.blocks.map((b) => b.id)).toEqual(['games', 'draw', 'primary', 'utility', 'casino', 'support']);
    expect(layout.blocks[0]).toEqual({
      id: 'games',
      visible: false,
      cards: [
        { id: 'bingo', visible: true },
        { id: 'raspadinha', visible: true },
      ],
    });
  });
});
