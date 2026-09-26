import { describe, expect, it } from 'vitest';
import { formatBirthDate, formatDate, formatDateTime, formatShortDateTime, formatTime } from './datetime';

describe('formatação de datas (fuso de Brasília)', () => {
  it('data e hora convertidas de UTC para Brasília', () => {
    expect(formatDateTime('2026-09-25T17:30:00.000Z')).toBe('25/09/2026 14:30');
    expect(formatDate('2026-09-26T02:00:00.000Z')).toBe('25/09/2026'); // ainda dia 25 em Brasília
  });

  it('data de nascimento é de calendário: não sofre deslocamento de fuso', () => {
    expect(formatBirthDate('1990-05-17')).toBe('17/05/1990');
    expect(formatBirthDate('2000-01-01')).toBe('01/01/2000');
  });
});

describe('formatTime e formatShortDateTime', () => {
  it('hora e data curta no fuso de Brasília', () => {
    expect(formatTime('2026-09-26T14:10:00.000Z')).toBe('11:10');
    expect(formatShortDateTime('2026-09-26T14:10:00.000Z')).toBe('26/09/26 11:10');
    expect(formatShortDateTime('2026-01-02T02:05:00.000Z')).toBe('01/01/26 23:05');
  });
});
