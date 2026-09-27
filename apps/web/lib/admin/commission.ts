import { MAX_COMMISSION_BPS, MIN_COMMISSION_BPS } from '@sysjb/contracts';

/** 1250 -> "12,5%"; 1000 -> "10%"; 1 -> "0,01%". A comissão é sempre inteira (centésimos de %). */
export function formatCommission(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return `${whole}%`;
  return `${whole},${String(fraction).padStart(2, '0').replace(/0$/, '')}%`;
}

/** Texto do campo para o valor salvo (sem o "%"): 1250 -> "12,5". */
export function commissionInputValue(bps: number): string {
  return formatCommission(bps).replace('%', '');
}

const INPUT = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

/**
 * "12,5" | "12.5" | "10%" -> centésimos de % (inteiro), ou null se inválido (vazio, mais de 2 casas,
 * fora de 0,01% a 100%). Só aritmética inteira: nada de ponto flutuante em dinheiro.
 */
export function parseCommission(text: string): number | null {
  const match = INPUT.exec(text.trim().replace(/\s*%$/, ''));
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bps >= MIN_COMMISSION_BPS && bps <= MAX_COMMISSION_BPS ? bps : null;
}

export const COMMISSION_HELP = 'Entre 0,01% e 100%, com até 2 casas decimais.';
