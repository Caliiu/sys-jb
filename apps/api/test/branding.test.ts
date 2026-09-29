import type { INestApplication } from '@nestjs/common';
import { type AdminBranding, BRANDING_LIMITS, type SaveBrandingRequest } from '@sysjb/contracts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_TENANTS } from './env.js';
import {
  ADMIN_KEY,
  api,
  asTenant,
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

/** Volta a identidade das bancas de teste ao que o global-setup criou (outros testes dependem do nome). */
afterEach(async () => {
  await migratorPool.query('DELETE FROM tenant_logos');
  for (const t of Object.values(TEST_TENANTS)) {
    await migratorPool.query(
      `UPDATE tenants SET name = $1, primary_color = '#112233', secondary_color = '#FFEEDD',
         invite_bar_text = DEFAULT, invite_bar_enabled = true, support_phone = NULL, logo_updated_at = NULL WHERE slug = $2`,
      [t.name, t.slug],
    );
  }
});

/** PNG 1×1 válido. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1').toString('base64');

const BRANDING: SaveBrandingRequest = {
  name: 'Aurora da Sorte',
  primaryColor: '#0a7c3e',
  secondaryColor: '#E8F5EE',
  inviteBarText: 'Convide e ganhe R$ 10',
  inviteBarEnabled: true,
  supportPhone: null,
};

describe('Identidade visual no painel', () => {
  it('lê a identidade atual', async () => {
    const session = await loginOperator(app, 'aurora');
    const res = await session.http.get('/v1/admin/branding');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      name: TEST_TENANTS.aurora.name,
      primaryColor: '#112233',
      secondaryColor: '#FFEEDD',
      inviteBarText: 'Indique um amigo e ganhe bônus',
      inviteBarEnabled: true,
      supportPhone: null,
      logoUrl: null,
      hasCustomLogo: false,
    });
  });

  it('altera nome, cores, texto e logo; o app da banca passa a usar na hora; tudo auditado', async () => {
    const session = await loginOperator(app, 'aurora');
    const saved = await session.http.put('/v1/admin/branding', { ...BRANDING, logo: PNG });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const body = saved.body as AdminBranding;
    expect(body).toMatchObject({
      name: 'Aurora da Sorte',
      primaryColor: '#0A7C3E',
      secondaryColor: '#E8F5EE',
      inviteBarText: 'Convide e ganhe R$ 10',
      hasCustomLogo: true,
    });
    expect(body.logoUrl).toMatch(/^\/marca\/logo\?v=[0-9a-z]+$/);

    // App da banca (pelo hostname) e o painel (pela sessão) veem a identidade nova.
    const tenant = await api(app, 'aurora').get('/v1/tenant');
    expect(tenant.body).toEqual({
      name: 'Aurora da Sorte',
      slug: 'aurora',
      logoUrl: body.logoUrl,
      primaryColor: '#0A7C3E',
      secondaryColor: '#E8F5EE',
      inviteBarText: 'Convide e ganhe R$ 10',
      inviteBarEnabled: true,
      supportPhone: null,
    });
    expect((await session.http.get('/v1/admin/me')).body.tenant.name).toBe('Aurora da Sorte');

    // A logo, pública no app (aparece no login) e para qualquer operador no painel.
    const publicLogo = await api(app, 'aurora').get('/v1/tenant/logo');
    expect(publicLogo.status).toBe(200);
    expect(publicLogo.headers['content-type']).toBe('image/png');
    expect(Buffer.from(publicLogo.body as Buffer).equals(Buffer.from(PNG, 'base64'))).toBe(true);
    const support = await loginOperator(app, 'aurora', { role: 'SUPPORT' });
    expect((await support.http.get('/v1/admin/branding/logo')).status).toBe(200);

    // Sem mudança: sem auditoria. Sem `logo`: mantém a atual.
    const same = await session.http.put('/v1/admin/branding', BRANDING);
    expect((same.body as AdminBranding).hasCustomLogo).toBe(true);

    // null remove a logo enviada.
    const removed = await session.http.put('/v1/admin/branding', { ...BRANDING, logo: null });
    expect(removed.body).toMatchObject({ logoUrl: null, hasCustomLogo: false });
    expect((await api(app, 'aurora').get('/v1/tenant/logo')).status).toBe(404);

    const audit = await session.http.get('/v1/admin/audit');
    expect(audit.body.items.map((e: { action: string; details: unknown }) => [e.action, e.details])).toEqual([
      ['branding.update', { fields: ['Logo'] }],
      ['branding.update', { fields: ['Nome', 'Cor principal', 'Cor secundária', 'Texto da barra de convite', 'Logo'] }],
    ]);
  });

  it('liga e desliga a barra de convite (o app recebe na hora), com auditoria', async () => {
    const session = await loginOperator(app, 'aurora');
    const off = await session.http.put('/v1/admin/branding', {
      ...BRANDING,
      name: TEST_TENANTS.aurora.name,
      primaryColor: '#112233',
      secondaryColor: '#FFEEDD',
      inviteBarText: 'Indique um amigo e ganhe bônus',
      inviteBarEnabled: false,
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect((off.body as AdminBranding).inviteBarEnabled).toBe(false);
    expect((await api(app, 'aurora').get('/v1/tenant')).body.inviteBarEnabled).toBe(false);
    // Outra banca não muda.
    expect((await api(app, 'boreal').get('/v1/tenant')).body.inviteBarEnabled).toBe(true);

    const audit = await session.http.get('/v1/admin/audit');
    expect(audit.body.items[0].details).toEqual({ fields: ['Barra de convite ligada'] });
  });

  it('valida os campos', async () => {
    const session = await loginOperator(app, 'aurora');
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...BRANDING, name: ' x ' }, 'name'],
      [{ ...BRANDING, name: 'x'.repeat(BRANDING_LIMITS.nameMax + 1) }, 'name'],
      [{ ...BRANDING, primaryColor: 'red' }, 'primaryColor'],
      [{ ...BRANDING, secondaryColor: '#FFF' }, 'secondaryColor'],
      [{ ...BRANDING, inviteBarText: '   ' }, 'inviteBarText'],
      [{ ...BRANDING, inviteBarText: 'x'.repeat(BRANDING_LIMITS.inviteBarMax + 1) }, 'inviteBarText'],
      [{ ...BRANDING, logo: GIF }, 'logo'],
      [{ ...BRANDING, logo: 'não é base64' }, 'logo'],
      [{ ...BRANDING, logo: Buffer.alloc(BRANDING_LIMITS.logoMaxBytes + 1).toString('base64') }, 'logo'],
      [{ ...BRANDING, inviteBarEnabled: 'sim' }, 'inviteBarEnabled'],
      [{ ...BRANDING, slug: 'outra' }, 'slug'],
      [{ ...BRANDING, domain: 'evil.test' }, 'domain'],
    ];
    for (const [body, field] of cases) {
      const res = await session.http.put('/v1/admin/branding', body);
      expect(res.status, `${field}: ${JSON.stringify(res.body)}`).toBe(400);
      expect(res.body.details.map((d: { field: string }) => d.field)).toContain(field);
    }
    expect((await api(app, 'aurora').get('/v1/tenant')).body.name).toBe(TEST_TENANTS.aurora.name);
  });

  it('só o Gerente consulta e altera', async () => {
    for (const role of ['FINANCE', 'SUPPORT'] as const) {
      const session = await loginOperator(app, 'aurora', { role });
      expect((await session.http.get('/v1/admin/branding')).status).toBe(403);
      expect((await session.http.put('/v1/admin/branding', BRANDING)).status).toBe(403);
    }
  });

  it('cada Gerente altera só a própria banca', async () => {
    const boreal = await loginOperator(app, 'boreal');
    await boreal.http.put('/v1/admin/branding', { ...BRANDING, logo: PNG });
    expect((await api(app, 'aurora').get('/v1/tenant')).body.name).toBe(TEST_TENANTS.aurora.name);
    expect((await api(app, 'aurora').get('/v1/tenant/logo')).status).toBe(404);
    expect((await api(app, 'boreal').get('/v1/tenant')).body.name).toBe('Aurora da Sorte');
  });

  it('logo pública exige a credencial da banca', async () => {
    expect((await api(app, 'aurora', ADMIN_KEY).get('/v1/tenant/logo')).status).toBe(401);
  });
});

describe('Identidade visual: travas do banco', () => {
  it('a role de runtime só altera a banca do contexto, e só as colunas de identidade', async () => {
    const boreal = await tenantId('boreal');
    // Sem contexto (ou com outra banca), o UPDATE não alcança a linha.
    const noContext = await runtimePool.query(`UPDATE tenants SET name = 'Invadida' WHERE slug = 'boreal'`);
    expect(noContext.rowCount).toBe(0);
    const other = await asTenant(runtimePool, auroraId, (c) =>
      c.query(`UPDATE tenants SET name = 'Invadida' WHERE id = $1`, [boreal]),
    );
    expect(other.rowCount).toBe(0);
    // Colunas fora da identidade: sem privilégio.
    for (const column of ['slug', 'domain', 'active', 'logo_url']) {
      await expect(
        asTenant(runtimePool, auroraId, (c) =>
          c.query(`UPDATE tenants SET ${column} = ${column} WHERE id = $1`, [auroraId]),
        ),
      ).rejects.toThrow(/permission denied/);
    }
    // Leitura continua livre (resolução por hostname antes do contexto).
    expect((await runtimePool.query('SELECT slug FROM tenants')).rowCount).toBeGreaterThanOrEqual(3);
  });

  it('logo de outro formato ou acima de 1 MB é recusada pelo banco', async () => {
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query(`INSERT INTO tenant_logos (tenant_id, image, image_type) VALUES ($1, '\\x01', 'image/svg+xml')`, [
          auroraId,
        ]),
      ),
    ).rejects.toThrow(/tenant_logos_image_type/);
    await expect(
      asTenant(migratorPool, auroraId, (c) =>
        c.query(`INSERT INTO tenant_logos (tenant_id, image, image_type) VALUES ($1, $2, 'image/png')`, [
          auroraId,
          Buffer.alloc(BRANDING_LIMITS.logoMaxBytes + 1),
        ]),
      ),
    ).rejects.toThrow(/tenant_logos_image_size/);
  });
});
