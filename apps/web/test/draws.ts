import type { DrawGame, DrawSchedule, PublicDraw, ResultSource } from '@sysjb/contracts';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const TEN: DrawGame[] = ['lotteries', 'lotteries10', 'fazendinha'];

/** Ligação com o resultado do provedor, como no cadastro padrão (a Federal da banca, às 20h, é a das 19h). */
function resultOf(name: string, hour: number): ResultSource | null {
  if (name === 'LT FEDERAL') return { lottery: 'fd', extraction: 19 };
  if (name.startsWith('LT PT RIO')) return { lottery: 'rj', extraction: hour };
  if (name.startsWith('LT NACIONAL')) return { lottery: 'ln', extraction: hour };
  if (name.startsWith('LT BAHIA')) return { lottery: 'ba', extraction: hour };
  return null;
}

const draw = (
  group: string,
  name: string,
  drawTime: string,
  closesAt: string,
  weekdays: number[] = ALL_DAYS,
  games: DrawGame[] = ['lotteries', 'fazendinha'],
): PublicDraw => ({
  id: `id-${name}`,
  group,
  name,
  hour: Number(drawTime.slice(0, 2)),
  drawTime,
  closesAt,
  weekdays,
  games,
  result: resultOf(name, Number(drawTime.slice(0, 2))),
});

/** Parte do cadastro padrão da banca (migration draws), para as telas. Federal: quartas e domingos. */
export const TEST_SCHEDULE: DrawSchedule = {
  draws: [
    draw('RIO/FEDERAL', 'LT PT RIO 09HS', '09:20', '09:18'),
    draw('RIO/FEDERAL', 'LT PT RIO 11HS', '11:20', '11:18'),
    draw('RIO/FEDERAL', 'LT PT RIO 14HS', '14:20', '14:18'),
    draw('RIO/FEDERAL', 'LT PT RIO 16HS', '16:20', '16:18'),
    draw('RIO/FEDERAL', 'LT FEDERAL', '20:00', '19:58', [0, 3]),
    draw('RIO/FEDERAL', 'LT PT RIO 21HS', '21:20', '21:18'),
    draw('NACIONAL', 'LT NACIONAL 12HS', '12:00', '11:57'),
    draw('NACIONAL', 'LT NACIONAL 23HS', '23:00', '22:57'),
    // Bahia vale também na Tradicional 1/10 (como no cadastro padrão).
    draw('BAHIA', 'LT BAHIA 10HS', '10:07', '10:05', ALL_DAYS, TEN),
    draw('BAHIA', 'LT BAHIA 12HS', '12:07', '12:05', ALL_DAYS, TEN),
    draw('BAHIA', 'LT BAHIA 15HS', '15:07', '15:05', ALL_DAYS, TEN),
    // Só Loterias.
    draw('CAPITAL', 'LT CAPITAL 13HS', '13:00', '13:00', ALL_DAYS, ['lotteries']),
  ],
  exceptions: [],
};

export const testDraw = (name: string) => TEST_SCHEDULE.draws.find((d) => d.name === name)!;
