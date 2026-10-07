import { describe, expect, it } from 'vitest';
import { casinoClosingHref, formatClosingMonth, parseCasinoClosingMonth } from './casino-closing-query';

// 07/10/2026 08:00 em Brasília.
const NOW = '2026-10-07T11:00:00.000Z';

describe('mês do fechamento cassino na URL', () => {
  it('aceita AAAA-MM até o mês atual', () => {
    expect(parseCasinoClosingMonth({ mes: '2026-09' }, NOW)).toBe('2026-09');
    expect(parseCasinoClosingMonth({ mes: '2026-10' }, NOW)).toBe('2026-10');
    expect(parseCasinoClosingMonth({ mes: ['2025-12', '2026-01'] }, NOW)).toBe('2025-12');
  });

  it('formato errado ou mês futuro: nenhum mês (só os cards)', () => {
    for (const mes of ['2026-11', '2099-01', '2026-13', '2026-9', '1999-01', "2026-09' OR 1=1", '']) {
      expect(parseCasinoClosingMonth({ mes }, NOW), mes).toBeNull();
    }
    expect(parseCasinoClosingMonth({}, NOW)).toBeNull();
  });

  it('virada do mês pelo horário de Brasília', () => {
    // 01/11 01:00 UTC = 31/10 22:00 em Brasília: novembro ainda é futuro.
    expect(parseCasinoClosingMonth({ mes: '2026-11' }, '2026-11-01T01:00:00.000Z')).toBeNull();
    expect(parseCasinoClosingMonth({ mes: '2026-11' }, '2026-11-01T03:00:00.000Z')).toBe('2026-11');
  });

  it('endereço e nome do mês', () => {
    expect(casinoClosingHref('2026-09')).toBe('/relatorios/cassino/fechamento?mes=2026-09');
    expect(casinoClosingHref(null)).toBe('/relatorios/cassino/fechamento');
    expect(formatClosingMonth('2026-03')).toBe('março/2026');
    expect(formatClosingMonth('2025-12')).toBe('dezembro/2025');
  });
});
