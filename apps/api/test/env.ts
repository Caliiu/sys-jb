import { existsSync } from 'node:fs';

const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não definida (veja .env.example)`);
  return value;
}

/** Credencial de migração do banco de TESTE (dona das tabelas). */
export const TEST_MIGRATOR_URL = required('TEST_DATABASE_MIGRATOR_URL');
/** Credencial de runtime do banco de TESTE (sysjb_app). */
export const TEST_APP_URL = required('TEST_DATABASE_URL');

if (!/\/sysjb_test(\?|$)/.test(TEST_MIGRATOR_URL) || !/\/sysjb_test(\?|$)/.test(TEST_APP_URL)) {
  throw new Error('Os testes só rodam contra o banco sysjb_test');
}

/** Bancas fictícias usadas pelos testes. */
export const TEST_TENANTS = {
  aurora: { slug: 'aurora', name: 'Banca Aurora Teste', domain: 'aurora.test', active: true },
  boreal: { slug: 'boreal', name: 'Banca Boreal Teste', domain: 'boreal.test', active: true },
  cometa: { slug: 'cometa', name: 'Banca Cometa Inativa', domain: 'cometa.test', active: false },
} as const;
