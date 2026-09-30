// Busca agora as previsões do dia na API de horóscopo do provedor e grava no cache (a mesma busca que a API agenda
// para as 00:01 de Brasília). Para testar a integração ou recuperar o dia sem esperar a próxima busca.
// Uso: pnpm horoscope:fetch
// Usa a credencial de runtime (DATABASE_URL): só inclui e atualiza previsões, como a API.
import { existsSync } from 'node:fs';
import { createPrismaClient } from '@sysjb/database';
import { syncHoroscope } from '../src/horoscope/horoscope-sync.js';
import { type HoroscopeConfig, loadHoroscopeConfig } from '../src/horoscope/horoscope.config.js';

const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function fail(message: string): never {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

let config: HoroscopeConfig | null;
try {
  config = loadHoroscopeConfig(process.env);
} catch (error) {
  fail((error as Error).message);
}
if (!config) fail('HOROSCOPE_API_TOKEN não configurado (veja .env.example)');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('DATABASE_URL não definida');

const prisma = createPrismaClient({ connectionString: databaseUrl, max: 2 });
try {
  const outcome = await syncHoroscope(prisma, config);
  if (outcome.status === 'stored') {
    console.log(`Horóscopo de ${outcome.date}: ${outcome.signs} signos gravados (${outcome.changed} atualizado(s)).`);
    for (const r of outcome.rejected) console.error(`Item ${r.index} descartado: ${r.reason}`);
    process.exitCode = outcome.rejected.length > 0 ? 1 : 0;
  } else if (outcome.status === 'not_ready') {
    console.log(`Ainda não disponível: ${outcome.message}`);
    process.exitCode = 1;
  } else {
    console.error(`Falhou: ${outcome.message}`);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
