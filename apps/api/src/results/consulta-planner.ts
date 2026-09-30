import { brasiliaNow, dayOffsetOf, resultExtractionsOf } from '@sysjb/contracts';

/**
 * Minutos depois da hora da extração a partir dos quais o resultado costuma estar publicado (o sorteio "09" do Rio
 * corre por volta de 09:20). Antes disso, consultar só gastaria cota com "nenhum resultado".
 */
export const RESULT_AVAILABLE_AFTER_MINUTES = 30;

export interface PlanInput {
  /** YYYY-MM-DD (Brasília), hoje ou passado. */
  date: string;
  lottery: string;
  /** Pedida explicitamente; sem ela, o dia inteiro (uma consulta traz todas as extrações). */
  extraction?: number;
  nowIso: string;
  /** Extrações da data e sigla que já estão gravadas. */
  stored: ReadonlySet<number>;
  /** Última consulta respondida (OK ou nenhum resultado) desta data e sigla; null = nenhuma. */
  lastAnsweredAt: Date | null;
  cooldownMinutes: number;
  /** Ignora "já gravado", "ainda não saiu" e a espera entre consultas (a cota continua valendo). */
  force: boolean;
}

export type SkipReason =
  /** Tudo o que existe para a data já está gravado. */
  | 'complete'
  /** O que já saiu está gravado (ou nada saiu ainda); o resto ainda não foi sorteado. */
  | 'not_yet'
  /** A mesma consulta foi respondida há pouco. */
  | 'cooldown';

export type Plan =
  | { consult: true; extraction?: number; missing: number[] | null }
  | { consult: false; reason: SkipReason; retryAt?: Date };

/** Extrações que já deveriam ter resultado publicado em `date`, pela hora atual em Brasília. */
function drawnBy(extractions: readonly number[], date: string, nowIso: string): number[] {
  const offset = dayOffsetOf(nowIso, date);
  if (offset === null || offset > 0) return [];
  if (offset < 0) return [...extractions];
  const now = brasiliaNow(nowIso);
  const minutes = now.hour * 60 + now.minute;
  return extractions.filter((extraction) => extraction * 60 + RESULT_AVAILABLE_AFTER_MINUTES <= minutes);
}

/**
 * Decide se vale gastar uma consulta. Sem extração pedida, a consulta é do dia inteiro (1 requisição traz todas as
 * extrações), feita só se faltar alguma que já saiu. Sigla fora do catálogo: não dá para saber o que falta, então só
 * a espera entre consultas vale.
 */
export function planConsulta(input: PlanInput): Plan {
  const { date, lottery, extraction, nowIso, stored, force } = input;
  let missing: number[] | null = null;

  if (!force) {
    const expected = extraction !== undefined ? [extraction] : resultExtractionsOf(lottery);
    if (expected !== null) {
      const drawn = drawnBy(expected, date, nowIso);
      missing = drawn.filter((e) => !stored.has(e));
      if (missing.length === 0) {
        return { consult: false, reason: drawn.length === expected.length ? 'complete' : 'not_yet' };
      }
    }
    if (input.lastAnsweredAt) {
      const retryAt = new Date(input.lastAnsweredAt.getTime() + input.cooldownMinutes * 60_000);
      if (retryAt.getTime() > Date.parse(nowIso)) return { consult: false, reason: 'cooldown', retryAt };
    }
  }
  return extraction !== undefined ? { consult: true, extraction, missing } : { consult: true, missing };
}
