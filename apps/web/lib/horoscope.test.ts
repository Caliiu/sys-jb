import { describe, expect, it } from 'vitest';
import { BICHOS } from './fazendinha';
import { SIGN_INFO, ZODIAC_SIGNS, dailyReading, isZodiacSign, readingFor, signOf } from './horoscope';

/** Datas YYYY-MM-DD a partir de `start`, dia a dia. */
const days = (start: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(`${start}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
  );

describe('signo pela data de nascimento', () => {
  it.each([
    ['1990-03-21', 'aries'],
    ['1990-04-19', 'aries'],
    ['1990-04-20', 'touro'],
    ['1990-06-20', 'gemeos'],
    ['1990-06-21', 'cancer'],
    ['1990-07-23', 'leao'],
    ['1990-09-22', 'virgem'],
    ['1990-09-23', 'libra'],
    ['1990-11-21', 'escorpiao'],
    ['1990-12-21', 'sagitario'],
    ['1990-12-22', 'capricornio'],
    ['1991-01-01', 'capricornio'],
    ['1991-01-19', 'capricornio'],
    ['1991-01-20', 'aquario'],
    ['1991-02-18', 'aquario'],
    ['1991-02-19', 'peixes'],
    ['1991-03-20', 'peixes'],
  ])('%s → %s', (date, sign) => {
    expect(signOf(date)).toBe(sign);
  });

  it('todo dia do ano tem signo; data inválida = null', () => {
    for (const date of days('2000-01-01', 366)) expect(signOf(date)).not.toBeNull();
    expect(signOf('1990-13-01')).toBeNull();
    expect(signOf('17/05/1990')).toBeNull();
    expect(signOf('')).toBeNull();
    expect(isZodiacSign('aries')).toBe(true);
    expect(isZodiacSign('ofiuco')).toBe(false);
  });
});

describe('leitura do dia', () => {
  it('mesma data e signo, mesma leitura; muda com o dia e com o signo', () => {
    const a = dailyReading('aries', '2026-09-30');
    expect(dailyReading('aries', '2026-09-30')).toEqual(a);
    const week = days('2026-09-30', 7).map((d) => dailyReading('aries', d).text);
    expect(new Set(week).size).toBeGreaterThan(3);
    const signs = ZODIAC_SIGNS.map((s) => dailyReading(s, '2026-09-30').text);
    expect(new Set(signs).size).toBe(12);
  });

  it('texto: dia da semana certo, gentílico do signo e sem marcador nem contração quebrada (3 anos × 12 signos)', () => {
    for (const date of days('2026-01-01', 3 * 365)) {
      for (const sign of ZODIAC_SIGNS) {
        const { text } = dailyReading(sign, date);
        expect(text).not.toMatch(/[{}]/);
        expect(text).not.toMatch(/\bde (a|o) (Lua|Sol)\b/);
        // Dia como sujeito é "esta quarta-feira favorece", nunca "nesta quarta-feira favorece".
        expect(text).not.toMatch(/\bnest[ae] [a-zçáé-]+ (pede|favorece|valoriza|desperta|é)\b/);
        expect(text).not.toMatch(/marca nest[ae]/);
        expect(text).toMatch(/^[A-ZÁÊÉ]/);
        expect(text).toContain(SIGN_INFO[sign].demonym);
      }
    }
    // 30/09/2026 é quarta-feira.
    expect(dailyReading('leao', '2026-09-30').text.toLowerCase()).toContain('quarta-feira');
    expect(dailyReading('leao', '2026-10-04').text.toLowerCase()).toContain('domingo');
  });

  it('palpites: as 4 dezenas do grupo, e cada centena/milhar termina na anterior', () => {
    for (const date of days('2026-01-01', 200)) {
      for (const sign of ZODIAC_SIGNS) {
        const { group, tens, hundreds, thousands } = dailyReading(sign, date).tips;
        expect(group).toBeGreaterThanOrEqual(1);
        expect(group).toBeLessThanOrEqual(25);
        expect(BICHOS[group - 1]).toBeDefined();
        expect(tens).toHaveLength(4);
        tens.forEach((ten, i) => {
          expect(ten).toMatch(/^\d{2}$/);
          // Dezena → grupo: 01–04 = 1 … 97–00 = 25.
          expect(Math.ceil((Number(ten) || 100) / 4)).toBe(group);
          expect(hundreds[i]).toMatch(new RegExp(`^\\d${ten}$`));
          expect(thousands[i]).toMatch(new RegExp(`^\\d${hundreds[i]}$`));
        });
      }
    }
  });

  it('grupo 25 (Vaca) termina em 97, 98, 99 e 00', () => {
    const vaca = days('2026-01-01', 400)
      .map((d) => dailyReading('touro', d).tips)
      .find((t) => t.group === 25);
    expect(vaca?.tens).toEqual(['97', '98', '99', '00']);
  });
});

describe('leitura do provedor', () => {
  const official = {
    sign: 'leao' as const,
    text: 'Família: energia investigativa.',
    tens: ['16', '64', '00'],
    colors: ['Amarelo-ouro'],
  };

  it('usa texto, dezenas e cores do provedor; grupo da 1ª dezena; centenas/milhares terminam nelas; determinística', () => {
    const r = readingFor('leao', '2026-09-30', official);
    expect(r).toMatchObject({ source: 'provider', text: official.text, colors: official.colors });
    expect(r.tips.tens).toEqual(['16', '64', '00']);
    expect(r.tips.group).toBe(4);
    r.tips.hundreds.forEach((h, i) => expect(h).toMatch(new RegExp(`^\\d${official.tens[i]}$`)));
    r.tips.thousands.forEach((m, i) => expect(m).toMatch(new RegExp(`^\\d${r.tips.hundreds[i]}$`)));
    expect(readingFor('leao', '2026-09-30', official)).toEqual(r);
    // Dezena 00 = grupo 25.
    expect(readingFor('leao', '2026-09-30', { ...official, tens: ['00'] }).tips.group).toBe(25);
  });

  it('sem previsão (ou sem dezenas): leitura local', () => {
    expect(readingFor('leao', '2026-09-30')).toEqual(dailyReading('leao', '2026-09-30'));
    expect(readingFor('leao', '2026-09-30', { ...official, tens: [] }).source).toBe('local');
  });
});
