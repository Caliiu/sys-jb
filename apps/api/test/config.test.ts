import { describe, expect, it } from 'vitest';
import { digestKey, loadConfig, parseAdminKey, parseServiceKeys } from '../src/config/config.js';

const tenantKeys = parseServiceKeys(`aurora=${'a'.repeat(32)},boreal=${'b'.repeat(32)}`);

describe('credencial do painel administrativo', () => {
  it('ausente ou vazia desativa o painel', () => {
    expect(parseAdminKey(undefined, tenantKeys)).toBeNull();
    expect(parseAdminKey('', tenantKeys)).toBeNull();
    expect(parseAdminKey('   ', tenantKeys)).toBeNull();
  });

  it('válida devolve só o digest (o texto da chave não fica na configuração)', () => {
    const key = 'p'.repeat(40);
    expect(parseAdminKey(key, tenantKeys)?.equals(digestKey(key))).toBe(true);
  });

  it('exige o tamanho mínimo e não pode repetir a chave de uma banca', () => {
    expect(() => parseAdminKey('curta', tenantKeys)).toThrow(/ao menos 32/);
    expect(() => parseAdminKey('b'.repeat(32), tenantKeys)).toThrow(/igual à credencial de uma banca/);
  });

  it('a mensagem de erro nunca contém a chave', () => {
    const key = 'curta-e-secreta';
    expect(() => parseAdminKey(key, tenantKeys)).toThrow(expect.not.stringContaining(key));
  });

  it('loadConfig lê ADMIN_SERVICE_KEY do ambiente', () => {
    const env = {
      DATABASE_URL: 'postgresql://x',
      TENANT_SERVICE_KEYS: `aurora=${'a'.repeat(32)}`,
      AUTH_SECRET: 's'.repeat(32),
    };
    expect(loadConfig(env).adminKeyDigest).toBeNull();
    expect(loadConfig({ ...env, ADMIN_SERVICE_KEY: 'p'.repeat(40) }).adminKeyDigest).not.toBeNull();
    expect(() => loadConfig({ ...env, ADMIN_SERVICE_KEY: 'a'.repeat(32) })).toThrow();
  });
});
