import type { AdminAuditEntry } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { auditHref, describeAuditDetails, parseAuditQuery } from './audit-query';

const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

const entry = (details: AdminAuditEntry['details']): AdminAuditEntry => ({
  id: '1',
  createdAt: '2026-09-28T12:00:00.000Z',
  action: 'user.update',
  operator: { id: 'o', name: 'Op', email: 'op@example.test' },
  targetType: 'user',
  target: null,
  details,
});

describe('auditoria: filtros da URL', () => {
  it('lê ação, usuário e página; valores inválidos viram "sem filtro"', () => {
    expect(parseAuditQuery({ acao: 'user.block', usuario: ID.toUpperCase(), page: '3' })).toEqual({
      page: 3,
      action: 'user.block',
      userId: ID,
    });
    expect(parseAuditQuery({ acao: 'user.delete', usuario: '123', page: '-1' })).toEqual({
      page: 1,
      action: '',
      userId: '',
    });
  });

  it('monta o endereço omitindo o padrão', () => {
    expect(auditHref({})).toBe('/auditoria');
    expect(auditHref({ action: 'user.block', userId: ID, page: 2 })).toBe(
      `/auditoria?acao=user.block&usuario=${ID}&page=2`,
    );
    expect(auditHref({ action: '', userId: '', page: 1 })).toBe('/auditoria');
  });
});

describe('auditoria: detalhes legíveis', () => {
  it('campos alterados com nomes em português; comissão antes/depois', () => {
    expect(describeAuditDetails(entry({ fields: ['name', 'email', 'document'] }))).toBe('Campos: Nome, E-mail, CPF');
    expect(describeAuditDetails(entry({ fields: ['promoterCommissionBps'], from: null, to: 1000 }))).toBe(
      'Comissão de 10%',
    );
    expect(describeAuditDetails(entry({ fields: ['promoterCommissionBps'], from: 1000, to: 1250 }))).toBe(
      'Comissão de 10% para 12,5%',
    );
    expect(describeAuditDetails(entry({ fields: ['promoterCommissionBps'], from: 1250, to: null }))).toBe(
      'Comissão era 12,5%',
    );
    expect(describeAuditDetails(entry(null))).toBe('—');
    expect(describeAuditDetails(entry({ fields: ['balanceGames'], amount: 2550 }))).toBe(
      'Disponível em Games: + R$ 25,50',
    );
    expect(describeAuditDetails(entry({ fields: ['bonusJb'], amount: 100 }))).toBe('Bônus: + R$ 1,00');
    expect(describeAuditDetails(entry({ fields: ['referralCommissionBps'], from: 0, to: 300 }))).toBe(
      'Indique e ganhe de 0% para 3%',
    );
    expect(describeAuditDetails(entry({ fields: ['month'], month: '2026-08', amount: 31500 }))).toBe(
      'Mês 08/2026: R$ 315,00 pagos',
    );
  });
});
