import { screen, within } from '@testing-library/react';
import type { AdminAuditEntry, Page } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import type { AuditQuery } from '@/lib/admin/audit-query';
import { renderWithProviders } from '@/test/render';
import AuditPage from './AuditPage';

const ANA = { id: '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100002, name: 'Ana Souza Lima' };
const operator = { id: 'op-1', name: 'Gerente Sintético', email: 'gerente@example.test' };

const entries: AdminAuditEntry[] = [
  {
    id: 'e2',
    createdAt: '2026-09-28T13:05:00.000Z',
    action: 'promoter.update',
    operator,
    targetType: 'user',
    target: ANA,
    details: { fields: ['promoterCommissionBps'], from: 1000, to: 1250 },
  },
  {
    id: 'e1',
    createdAt: '2026-09-28T12:00:00.000Z',
    action: 'user.block',
    operator,
    targetType: 'user',
    target: null,
    details: null,
  },
  {
    id: 'e0',
    createdAt: '2026-09-01T12:00:00.000Z',
    action: 'commission.close',
    operator,
    targetType: 'tenant',
    target: null,
    details: { fields: ['month'], month: '2026-08', amount: 31500 },
  },
];

const page = (items: AdminAuditEntry[]): Page<AdminAuditEntry> => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  totalPages: 1,
});
const noFilter: AuditQuery = { page: 1, action: '', userId: '' };

describe('Registro de auditoria', () => {
  it('mostra data, operador, ação, usuário (link) e o que mudou', () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Registro de auditoria' })).toBeInTheDocument();

    const [first, second] = screen.getAllByRole('row').slice(1);
    expect(first).toHaveTextContent('28/09/2026 10:05');
    expect(first).toHaveTextContent('Gerente Sintético');
    expect(first).toHaveTextContent('gerente@example.test');
    expect(first).toHaveTextContent('Comissão alterada');
    expect(first).toHaveTextContent('Comissão de 10% para 12,5%');
    expect(within(first!).getByRole('link', { name: 'Ana Souza Lima' })).toHaveAttribute('href', `/usuarios/${ANA.id}`);
    expect(first).toHaveTextContent('ID 100002');

    expect(second).toHaveTextContent('Usuário bloqueado');
    expect(second).toHaveTextContent('Usuário removido');

    const third = screen.getAllByRole('row')[3]!;
    expect(third).toHaveTextContent('Comissões do mês fechadas');
    expect(third).toHaveTextContent('Banca');
    expect(third).toHaveTextContent('Mês 08/2026: R$ 315,00 pagos');
    expect(screen.queryByRole('link', { name: 'Limpar' })).toBeNull();
  });

  it('filtro por ação é um formulário GET que mantém o usuário filtrado', () => {
    renderWithProviders(
      <AuditPage query={{ page: 1, action: 'promoter.update', userId: ANA.id }} result={page([entries[0]!])} />,
    );
    const form = screen.getByRole('form', { name: 'Filtrar auditoria' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/auditoria');
    expect(within(form).getByRole('combobox', { name: 'Ação' })).toHaveValue('promoter.update');
    expect(form.querySelector('input[type="hidden"][name="usuario"]')).toHaveValue(ANA.id);
    expect(screen.getByText(/Mostrando só o usuário/)).toHaveTextContent('Ana Souza Lima (ID 100002)');
    expect(screen.getByRole('link', { name: 'Limpar' })).toHaveAttribute('href', '/auditoria');
  });

  it('vazio: avisa, com mensagem diferente quando há filtro', () => {
    const { unmount } = renderWithProviders(<AuditPage query={noFilter} result={page([])} />);
    expect(screen.getByText('Nenhuma alteração registrada ainda.')).toBeInTheDocument();
    unmount();
    renderWithProviders(<AuditPage query={{ ...noFilter, action: 'user.block' }} result={page([])} />);
    expect(screen.getByText('Nenhum registro com esses filtros.')).toBeInTheDocument();
  });
});
