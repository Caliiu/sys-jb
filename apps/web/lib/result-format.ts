import { resultGroupOf } from '@sysjb/contracts';
import { BICHOS } from './fazendinha';

/** Número sorteado como no comprovante: sem zeros à esquerda e com ponto de milhar ("0987" -> "987"; "7977" -> "7.977"). */
export function formatResultNumber(number: string): string {
  const digits = number.replace(/^0+(?=\d)/, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Linha de um prêmio: "7.977 G.20" e o bicho do grupo ("PERU"). */
export function resultPrizeParts(number: string): { number: string; bicho: string } {
  const group = resultGroupOf(number);
  return { number: `${formatResultNumber(number)} G.${String(group).padStart(2, '0')}`, bicho: BICHOS[group - 1]! };
}
