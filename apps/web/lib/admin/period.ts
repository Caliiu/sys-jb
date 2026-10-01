import { dayOffsetOf } from '@sysjb/contracts';

/** Atalhos de período dos filtros do painel (Pules Premiadas, Resumo da Operação). */
export type PeriodPreset = 'yesterday' | 'today' | '7d' | '30d' | 'month' | 'lastMonth';

export const PERIOD_PRESETS: ReadonlyArray<{ id: PeriodPreset; label: string }> = [
  { id: 'yesterday', label: 'Ontem' },
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'month', label: 'Mês' },
  { id: 'lastMonth', label: 'Mês Ant.' },
];

/** Período de um atalho, a partir de hoje (YYYY-MM-DD, Brasília). */
export function presetRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  const shift = (days: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const [year, month] = today.split('-').map(Number) as [number, number];
  switch (preset) {
    case 'yesterday':
      return { from: shift(-1), to: shift(-1) };
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: shift(-6), to: today };
    case '30d':
      return { from: shift(-29), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'lastMonth': {
      // Dia 0 do mês atual = último dia do anterior.
      const last = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
      return { from: `${last.slice(0, 8)}01`, to: last };
    }
  }
}

/**
 * Período válido: datas reais, início antes do fim, até `maxDays` dias (contando os dois) e fim até hoje (ou até
 * `futureDays` dias à frente, para o que é pela data do jogo).
 */
export function isValidPeriod(nowIso: string, from: string, to: string, maxDays: number, futureDays = 0): boolean {
  const start = dayOffsetOf(nowIso, from);
  const end = dayOffsetOf(nowIso, to);
  return (
    start !== null &&
    end !== null &&
    from >= '2000-01-01' &&
    end <= futureDays &&
    start <= end &&
    end - start + 1 <= maxDays
  );
}
