import { resultGroupOf } from '@sysjb/contracts';
import { BICHOS } from './fazendinha';

/**
 * Número sorteado com todos os dígitos (o zero à esquerda faz parte da milhar) e ponto de milhar ("0987" -> "0.987";
 * "7977" -> "7.977"; a centena do 7º prêmio, "245", fica como veio).
 */
export function formatResultNumber(number: string): string {
  return number.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Linha de um prêmio: "7.977 G.20" e o bicho do grupo ("PERU"). */
export function resultPrizeParts(number: string): { number: string; bicho: string } {
  const group = resultGroupOf(number);
  return { number: `${formatResultNumber(number)} G.${String(group).padStart(2, '0')}`, bicho: BICHOS[group - 1]! };
}
