import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { TEST_MIGRATOR_URL, TEST_TENANTS } from './env.js';

/** Recria o schema do banco de teste, aplica as migrations versionadas e cria as bancas fictícias. */
export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: TEST_MIGRATOR_URL });
  await admin.connect();
  try {
    await admin.query('DROP SCHEMA IF EXISTS public CASCADE');
    await admin.query('CREATE SCHEMA public');
  } finally {
    await admin.end();
  }

  const databaseDir = fileURLToPath(new URL('../../../packages/database', import.meta.url));
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: databaseDir,
    env: { ...process.env, DATABASE_MIGRATOR_URL: TEST_MIGRATOR_URL },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  const seed = new pg.Client({ connectionString: TEST_MIGRATOR_URL });
  await seed.connect();
  try {
    for (const t of Object.values(TEST_TENANTS)) {
      await seed.query(
        `INSERT INTO tenants (name, slug, domain, primary_color, secondary_color, active, updated_at)
         VALUES ($1, $2, $3, '#112233', '#FFEEDD', $4, now())`,
        [t.name, t.slug, t.domain, t.active],
      );
    }
  } finally {
    await seed.end();
  }
}
