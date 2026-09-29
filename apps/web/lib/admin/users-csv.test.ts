import type { AdminUserListItem } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { csvCell, usersCsv } from './users-csv';

const item = (over: Partial<AdminUserListItem> = {}): AdminUserListItem => ({
  id: '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b',
  displayId: 100002,
  name: 'Ana Souza Lima',
  document: '52998224725',
  phone: '11912345678',
  status: 'ACTIVE',
  referredBy: null,
  promoter: null,
  createdAt: '2026-09-25T17:30:00.000Z',
  ...over,
});

describe('csvCell', () => {
  it('texto comum passa igual; ";", aspas e quebras de linha vão entre aspas', () => {
    expect(csvCell('Ana')).toBe('Ana');
    expect(csvCell('Ana; Bia')).toBe('"Ana; Bia"');
    expect(csvCell('Ana "Bia"')).toBe('"Ana ""Bia"""');
    expect(csvCell('Ana\nBia')).toBe('"Ana\nBia"');
  });

  it('nunca vira fórmula na planilha', () => {
    for (const value of ['=1+1', '+55', '-2', '@SOMA(A1)']) expect(csvCell(value)).toBe(`'${value}`);
  });
});

describe('usersCsv', () => {
  it('BOM, cabeçalho e linhas separadas por ";" com CPF, telefone, promotor e status formatados', () => {
    const promoter = { id: 'p', displayId: 100001, name: 'Paula', commissionBps: 750 };
    const csv = usersCsv([
      item({ promoter, referredBy: { id: 'p', displayId: 100001, name: 'Paula' } }),
      item({ displayId: 100003, name: 'Bruno', status: 'BLOCKED' }),
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'ID;Cadastro;Nome;Telefone;CPF;Promotor;Comissão do promotor;Indicado por;Status',
      '100002;25/09/2026 14:30;Ana Souza Lima;(11) 91234-5678;529.982.247-25;Paula;7,5%;Paula;Ativo',
      '100003;25/09/2026 14:30;Bruno;(11) 91234-5678;529.982.247-25;;;;Bloqueado',
      '',
    ]);
  });
});
