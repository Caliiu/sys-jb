import { DRAW_MAX_DAY_OFFSET, type DrawSchedule, drawDateOf, drawRunsOn } from '@sysjb/contracts';

export interface NextDraw {
  label: string;
  /** Início do sorteio (ISO 8601). */
  startsAt: string;
}

/**
 * Próximo sorteio da banca (Loterias ou Fazendinha) que ainda não começou: o de horário mais cedo a partir
 * de agora, de hoje até o fim da janela de apostas, respeitando dias da semana e exceções. null se não houver.
 */
export function nextDraw(nowIso: string, schedule: DrawSchedule): NextDraw | null {
  const now = Date.parse(nowIso);
  for (let offset = 0; offset <= DRAW_MAX_DAY_OFFSET; offset++) {
    const date = drawDateOf(nowIso, offset);
    let best: { label: string; at: number } | null = null;
    for (const draw of schedule.draws) {
      if (draw.games.length === 0 || !drawRunsOn(draw, date, schedule.exceptions)) continue;
      // Brasília não tem horário de verão desde 2019: UTC-3 o ano todo.
      const at = Date.parse(`${date}T${draw.drawTime}:00-03:00`);
      if (at > now && (!best || at < best.at)) best = { label: draw.name, at };
    }
    if (best) return { label: best.label, startsAt: new Date(best.at).toISOString() };
  }
  return null;
}
