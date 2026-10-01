import { describe, expect, it } from 'vitest';
import { presetRange } from './period';
import { isPrizesPeriod, parsePrizesQuery, parseReais, prizesHref, reaisText } from './prizes-query';

// 30/09/2026 12:00 em Brasília.
const NOW = '2026-09-30T15:00:00.000Z';
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

describe('valores em reais dos filtros', () => {
  it.each([
    ['100', 10_000],
    ['100,5', 10_050],
    ['100,50', 10_050],
    ['1.500', 150_000],
    ['1.500,75', 150_075],
    ['1500.5', 150_050],
    ['R$ 2.000,00', 200_000],
    ['0', 0],
  ])('%s -> %i centavos', (text, cents) => {
    expect(parseReais(text)).toBe(cents);
  });

  it.each(['', 'abc', '-5', '1,234', '1.50.0', '10.000.000,01', '1e3', '12,5,0'])('"%s" = sem limite', (text) => {
    expect(parseReais(text)).toBeNull();
  });

  it('volta para o campo sem decimais quando inteiro', () => {
    expect(reaisText(150_000)).toBe('1500');
    expect(reaisText(150_075)).toBe('1500,75');
    expect(reaisText(5)).toBe('0,05');
    expect(reaisText(null)).toBe('');
  });
});

describe('período', () => {
  it('até hoje, início antes do fim e no máximo 93 dias', () => {
    expect(isPrizesPeriod(NOW, '2026-09-30', '2026-09-30')).toBe(true);
    expect(isPrizesPeriod(NOW, '2026-06-30', '2026-09-30')).toBe(true);
    expect(isPrizesPeriod(NOW, '2026-06-29', '2026-09-30')).toBe(false);
    expect(isPrizesPeriod(NOW, '2026-09-30', '2026-10-01')).toBe(false);
    expect(isPrizesPeriod(NOW, '2026-09-30', '2026-09-29')).toBe(false);
    expect(isPrizesPeriod(NOW, '2026-02-30', '2026-09-30')).toBe(false);
  });

  it('atalhos a partir de hoje, inclusive virada de mês e de ano', () => {
    const today = '2026-09-30';
    expect(presetRange('yesterday', today)).toEqual({ from: '2026-09-29', to: '2026-09-29' });
    expect(presetRange('today', today)).toEqual({ from: today, to: today });
    expect(presetRange('7d', today)).toEqual({ from: '2026-09-24', to: today });
    expect(presetRange('30d', today)).toEqual({ from: '2026-09-01', to: today });
    expect(presetRange('month', today)).toEqual({ from: '2026-09-01', to: today });
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(presetRange('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('lastMonth', '2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(presetRange('yesterday', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' });
  });
});

describe('filtros da URL', () => {
  it('sem período válido: não pesquisou e abre em hoje', () => {
    expect(parsePrizesQuery({}, NOW)).toMatchObject({ searched: false, from: '2026-09-30', to: '2026-09-30' });
    for (const raw of [
      { de: '2026-09-01' },
      { de: '2026-09-01', ate: '2026-10-01' },
      { de: '2026-01-01', ate: '2026-09-30' },
    ]) {
      expect(parsePrizesQuery(raw, NOW).searched, JSON.stringify(raw)).toBe(false);
    }
  });

  it('lê os filtros com tolerância (UUID inválido e valor inválido viram "todos")', () => {
    const query = parsePrizesQuery(
      {
        de: '2026-09-01',
        ate: '2026-09-30',
        extracao: ID.toUpperCase(),
        promotor: 'x',
        apostador: ID,
        min: '1.000',
        max: 'abc',
        page: '3',
        pageSize: '50',
      },
      NOW,
    );
    expect(query).toEqual({
      searched: true,
      from: '2026-09-01',
      to: '2026-09-30',
      page: 3,
      pageSize: 50,
      promoterId: '',
      userId: ID,
      drawId: ID,
      minPrizeCents: 100_000,
      maxPrizeCents: null,
    });
  });

  it('faixa invertida é trocada em vez de não achar nada', () => {
    expect(parsePrizesQuery({ de: '2026-09-30', ate: '2026-09-30', min: '500', max: '100' }, NOW)).toMatchObject({
      minPrizeCents: 10_000,
      maxPrizeCents: 50_000,
    });
  });

  it('o endereço leva o período sempre e omite o resto que é padrão', () => {
    expect(prizesHref({ from: '2026-09-01', to: '2026-09-30' })).toBe('/premios?de=2026-09-01&ate=2026-09-30');
    const query = parsePrizesQuery(
      { de: '2026-09-01', ate: '2026-09-30', apostador: ID, min: '1500,5', max: '2000', pageSize: '50' },
      NOW,
    );
    expect(prizesHref({ ...query, page: 2 })).toBe(
      `/premios?de=2026-09-01&ate=2026-09-30&apostador=${ID}&min=1500%2C50&max=2000&pageSize=50&page=2`,
    );
  });
});
