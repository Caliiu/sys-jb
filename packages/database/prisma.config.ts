import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 não carrega .env sozinho. O .env fica na raiz do monorepo.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Migrations e seed usam SEMPRE a credencial de migração (dona das tabelas),
// nunca a credencial de runtime da API.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_MIGRATOR_URL ?? '',
  },
});
