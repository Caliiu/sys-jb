import type { AdminUserListItem } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { formatBrl } from '../currency';
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
  region: null,
  unitCommissionBps: 0,
  quoteTable: { id: 't', name: '800/1/8000', label: '800/1/8000', isDefault: true, own: false },
  giftMilharEnabled: false,
  retainPrizes: false,
  dailyLimitEnabled: false,
  dailyLimitCents: null,
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
    const unitHeader = 'Região;Comissão;Tabela;M.Brinde;Reter prêmio;Limite diário';
    expect(csv.slice(1).split('\r\n')).toEqual([
      `ID;Cadastro;Nome;Telefone;CPF;Promotor;Comissão do promotor;Indicado por;Status;${unitHeader}`,
      '100002;25/09/2026 14:30;Ana Souza Lima;(11) 91234-5678;529.982.247-25;Paula;7,5%;Paula;Ativo;;0%;800/1/8000;Não;Não;',
      '100003;25/09/2026 14:30;Bruno;(11) 91234-5678;529.982.247-25;;;;Bloqueado;;0%;800/1/8000;Não;Não;',
      '',
    ]);
  });

  it('configurações da unidade: região, comissão, tabela própria, milhar brinde, reter prêmio e limite ligado', () => {
    const unit = item({
      region: 'SP',
      unitCommissionBps: 250,
      quoteTable: { id: 'v', name: 'VIP', label: '900/1/9000', isDefault: false, own: true },
      giftMilharEnabled: true,
      retainPrizes: true,
      dailyLimitEnabled: true,
      dailyLimitCents: 15_050,
    });
    // Limite gravado mas desligado: coluna vazia.
    const off = item({ dailyLimitEnabled: false, dailyLimitCents: 10_000 });
    const [, first, second] = usersCsv([unit, off]).slice(1).split('\r\n');
    expect(first!.split(';').slice(9)).toEqual(['SP', '2,5%', 'VIP', 'Sim', 'Sim', formatBrl(15_050)]);
    expect(second!.split(';').slice(9)).toEqual(['', '0%', '800/1/8000', 'Não', 'Não', '']);
  });
});
