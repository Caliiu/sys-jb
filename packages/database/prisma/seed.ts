// Seed idempotente: duas bancas fictícias para desenvolvimento local.
// Executa com a credencial de migração (DATABASE_MIGRATOR_URL). Não cria usuários.
import { existsSync } from 'node:fs';
import { createPrismaClient } from '../src/index.js';

const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) throw new Error('DATABASE_MIGRATOR_URL não definida');

const tenants = [
  {
    // Identidade do app original (trv-clone). O logo é servido pelo web em /brands/.
    slug: 'trevo',
    name: 'Trevo da Sorte',
    domain: 'trevo.localhost',
    logoUrl: '/brands/trevo-da-sorte.svg',
    primaryColor: '#DF2120',
    secondaryColor: '#F4F1EA',
  },
  {
    slug: 'aurora',
    name: 'Banca Aurora',
    domain: 'aurora.localhost',
    logoUrl: null,
    primaryColor: '#B4235A',
    secondaryColor: '#FDE7EF',
  },
  {
    slug: 'boreal',
    name: 'Banca Boreal',
    domain: 'boreal.localhost',
    logoUrl: null,
    primaryColor: '#0F5E9C',
    secondaryColor: '#E3F0FB',
  },
] as const;

const prisma = createPrismaClient({ connectionString: url, max: 1 });
try {
  for (const t of tenants) {
    await prisma.tenant.upsert({
      where: { slug: t.slug },
      create: { ...t, active: true },
      update: {
        name: t.name,
        domain: t.domain,
        logoUrl: t.logoUrl,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
      },
    });
    console.log(`banca ok: ${t.slug} (${t.domain})`);
  }
} finally {
  await prisma.$disconnect();
}
