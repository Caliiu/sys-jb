// Recupera resultados pela API de consulta do provedor (o que o webhook não entregou) e grava com as mesmas regras do
// webhook. Cada consulta gasta a cota mensal do contrato, então só consulta o necessário:
// - não consulta o que já está gravado nem extração que ainda não saiu (dia inteiro = 1 consulta);
// - não repete consulta respondida há menos de RESULTS_API_COOLDOWN_MINUTES;
// - para ao chegar em RESULTS_API_QUOTA_STOP_PERCENT de RESULTS_API_MONTHLY_QUOTA.
// Uso: pnpm results:fetch --lottery rj                     (hoje)
//      pnpm results:fetch --lottery rj --date 2026-09-30 --extraction 21
//      pnpm results:fetch --lottery all --date 2026-09-30  (todas as siglas do catálogo)
//      --force: consulta mesmo já gravado/recente (para conferir correção); a cota continua valendo.
// Usa a credencial de runtime (DATABASE_URL): só inclui e corrige resultados e registra consultas, como a API.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { RESULT_LOTTERIES, RESULT_LOTTERY_CODE_PATTERN, dayOffsetOf, drawDateOf } from '@sysjb/contracts';
import { createPrismaClient } from '@sysjb/database';
import { z } from 'zod';
import type { SkipReason } from '../src/results/consulta-planner.js';
import { type ResultsConsultaConfig, loadResultsConsultaConfig } from '../src/results/results.config.js';
import { type RecoveryEvent, recoverResults } from '../src/results/results-recovery.js';
import { resultKey } from '../src/results/results.service.js';

const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function fail(message: string): never {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

let args: { lottery?: string; date?: string; extraction?: string; force?: boolean };
try {
  args = parseArgs({
    options: {
      lottery: { type: 'string' },
      date: { type: 'string' },
      extraction: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
    strict: true,
  }).values;
} catch (error) {
  fail((error as Error).message);
}

const nowIso = new Date().toISOString();
const input = z
  .strictObject({
    lottery: z
      .string({ error: 'informe a sigla, ex.: --lottery rj (ou --lottery all)' })
      .trim()
      .toLowerCase()
      .refine((v) => v === 'all' || RESULT_LOTTERY_CODE_PATTERN.test(v), 'sigla inválida'),
    date: z
      .string()
      .default(drawDateOf(nowIso, 0))
      .refine((v) => {
        const offset = dayOffsetOf(nowIso, v);
        return offset !== null && offset <= 0;
      }, 'data inválida ou no futuro (use YYYY-MM-DD)'),
    extraction: z.coerce.number().int().min(0).max(23, 'extração de 00 a 23').optional(),
    force: z.boolean(),
  })
  .safeParse(args);
if (!input.success) {
  for (const issue of input.error.issues)
    console.error(`Erro: ${issue.path.join('.') || 'argumentos'}: ${issue.message}`);
  process.exit(1);
}
const { lottery, date, extraction, force } = input.data;
if (lottery === 'all' && extraction !== undefined) fail('--extraction só vale com uma sigla');

let config: ResultsConsultaConfig | null;
try {
  config = loadResultsConsultaConfig(process.env);
} catch (error) {
  fail((error as Error).message);
}
if (!config) fail('RESULTS_API_TOKEN não configurado (veja .env.example)');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('DATABASE_URL não definida');

const SKIP_LABELS: Record<SkipReason, string> = {
  complete: 'já está completo, sem consulta',
  not_yet: 'o que já saiu está gravado; o resto ainda não foi sorteado, sem consulta',
  cooldown: 'consultado há pouco, sem consulta',
};
const time = (d: Date) =>
  d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

function print(event: RecoveryEvent): void {
  switch (event.type) {
    case 'skipped':
      console.log(
        `${event.lottery} ${date}: ${SKIP_LABELS[event.reason]}${event.retryAt ? ` (de novo a partir de ${time(event.retryAt)})` : ''}`,
      );
      break;
    case 'empty':
      console.log(`${event.lottery} ${date}: nenhum resultado`);
      break;
    case 'stored': {
      const { outcome, result } = event;
      const detail =
        outcome.status === 'updated'
          ? `corrigido (revisão ${outcome.revision})`
          : outcome.status === 'created'
            ? 'gravado'
            : 'já estava gravado';
      console.log(`${resultKey(result)}: ${detail} [${result.prizes.join(' ')}]`);
      break;
    }
    case 'rejected':
      console.error(`${event.lottery} ${date}: item recusado (${event.message})`);
      break;
    case 'failed':
      console.error(`${event.lottery} ${date}: ${event.message}`);
      break;
    case 'quota':
      console.error(`Parado: ${event.used} consultas no mês, limite de ${event.limit} atingido.`);
      break;
  }
}

const lotteries = lottery === 'all' ? [...new Set(RESULT_LOTTERIES.map((l) => l.code))] : [lottery];
const prisma = createPrismaClient({ connectionString: databaseUrl, max: 2 });
let summary;
try {
  summary = await recoverResults(prisma, config, { date, lotteries, extraction, force }, { onEvent: print });
} finally {
  await prisma.$disconnect();
}

console.log(
  `Resumo: ${summary.consulted} consulta(s), ${summary.skipped} sem consulta, ${summary.created} novo(s), ` +
    `${summary.updated} corrigido(s), ${summary.unchanged} sem mudança, ${summary.rejected} recusado(s), ` +
    `${summary.failed} com falha.`,
);
console.log(
  config.monthlyQuota === null
    ? `Cota: ${summary.used} consulta(s) no mês (RESULTS_API_MONTHLY_QUOTA não informada: sem limite).`
    : `Cota: ${summary.used} de ${config.monthlyQuota} no mês (para em ${summary.limit}, ${config.quotaStopPercent}%).`,
);
process.exit(summary.failed > 0 || summary.rejected > 0 || summary.stopped ? 1 : 0);
