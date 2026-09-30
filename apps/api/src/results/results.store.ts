import type { PrismaClient } from '@sysjb/database';
import type { NormalizedResult } from './result-normalizer.js';

export type ResultSource = 'WEBHOOK' | 'CONSULTA';

export type StoreOutcome = { status: 'created' } | { status: 'updated'; revision: number } | { status: 'unchanged' };

/**
 * Grava o resultado numa instrução só (INSERT ... ON CONFLICT), segura contra entregas repetidas e simultâneas do
 * mesmo resultado. O que não é perda de informação não vira correção:
 * - uma lista de prêmios que é o começo da já gravada (ex.: consulta com 5 prêmios, webhook já trouxe 7) mantém a gravada;
 * - campo calculado não informado (null) mantém o gravado.
 * Conteúdo igual não altera nada (o trigger ignora a alteração e o RETURNING volta vazio). Conteúdo diferente vira
 * uma nova revisão, com a anterior guardada pelo trigger em lottery_result_revisions.
 */
export async function storeResult(
  db: Pick<PrismaClient, '$queryRaw'>,
  result: NormalizedResult,
  source: ResultSource,
): Promise<StoreOutcome> {
  const rows = await db.$queryRaw<Array<{ revision: number }>>`
    INSERT INTO "lottery_results" AS t
      ("draw_date", "lottery", "extraction", "prizes", "sum_value", "multiplication", "skipped", "super5", "source")
    VALUES (${result.date}::date, ${result.lottery}, ${result.extraction}::smallint, ${result.prizes}::text[],
            ${result.sum}, ${result.multiplication}, ${result.skipped}, ${result.super5}, ${source})
    ON CONFLICT ("draw_date", "lottery", "extraction") DO UPDATE SET
      "prizes" = CASE
        WHEN cardinality(EXCLUDED."prizes") < cardinality(t."prizes")
         AND t."prizes"[1:cardinality(EXCLUDED."prizes")] = EXCLUDED."prizes" THEN t."prizes"
        ELSE EXCLUDED."prizes" END,
      "sum_value" = COALESCE(EXCLUDED."sum_value", t."sum_value"),
      "multiplication" = COALESCE(EXCLUDED."multiplication", t."multiplication"),
      "skipped" = COALESCE(EXCLUDED."skipped", t."skipped"),
      "super5" = COALESCE(EXCLUDED."super5", t."super5"),
      "source" = EXCLUDED."source"
    RETURNING t."revision"`;
  const revision = rows[0]?.revision;
  if (revision === undefined) return { status: 'unchanged' };
  return revision === 1 ? { status: 'created' } : { status: 'updated', revision };
}
