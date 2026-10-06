import type { CrmInactiveRow } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { crmInactiveCsv, crmNeverDepositedCsv } from './crm-csv';

const ROW: CrmInactiveRow = {
  player: { id: 'u1', displayId: 100012, name: '=HYPERLINK("http://x")' },
  type: 'player',
  promoter: { id: 'p1', displayId: 100001, name: 'Paula; Promotora' },
  phone: '11987654321',
  relationshipDays: 40,
  createdAt: '2026-08-27T15:00:00.000Z',
  totalDepositedCents: 750050,
  daysWithoutDeposit: 3,
  deposits: 2,
  lastDepositAt: '2026-10-03T15:00:00.000Z',
};

describe('CSV do CRM', () => {
  it('inativos: cabeçalho, valores formatados, BOM e CRLF; nome que parece fórmula vira texto', () => {
    const csv = crmInactiveCsv([ROW]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, line] = csv.slice(1).trimEnd().split('\r\n');
    expect(header).toBe(
      'Código;Nome;Tipo;Promotor associado;Telefone;Valor total depositado;Dias sem depositar;Último depósito;' +
        'Dias de relacionamento;Depósitos feitos',
    );
    expect(line).toBe(
      `100012;"'=HYPERLINK(""http://x"")";Apostador;"100001 - Paula; Promotora";(11) 98765-4321;7.500,50;3;` +
        `03/10/2026 12:00;40;2`,
    );
  });

  it('nunca depositantes: sem promotor fica vazio', () => {
    const csv = crmNeverDepositedCsv([{ ...ROW, player: { ...ROW.player, name: 'Ana' }, promoter: null }]);
    const [header, line] = csv.slice(1).trimEnd().split('\r\n');
    expect(header).toBe('Código;Nome;Tipo;Promotor associado;Telefone;Cadastro;Dias de relacionamento');
    expect(line).toBe('100012;Ana;Apostador;;(11) 98765-4321;27/08/2026 12:00;40');
  });
});
