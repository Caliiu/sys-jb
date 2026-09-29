import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminAuditEntry, Page } from '@sysjb/contracts';
import { describe, expect, it, vi } from 'vitest';
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
const noFilter: AuditQuery = { page: 1, pageSize: 25, action: '', userId: '', period: '' };
const summary = { today: 3, last7Days: 12, last30Days: 40, total: 1250 };

describe('Registro de auditoria', () => {
  it('mostra quando e quem alterou, a ação (selo), a unidade (link) e o que mudou', () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Registro de Auditoria' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registro de alterações' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Registro de auditoria' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Alterado em', 'Ação', 'Unidade', 'Detalhes']);

    const [first, second, third] = within(table).getAllByRole('row').slice(1);
    expect(first).toHaveTextContent('28/09/26 10:05');
    // O e-mail do operador fica na dica (title), ao lado do nome.
    expect(within(first!).getByText('Gerente Sintético')).toHaveAttribute('title', 'gerente@example.test');
    expect(first).toHaveTextContent('Comissão alterada');
    expect(first).toHaveTextContent('Comissão de 10% para 12,5%');
    expect(within(first!).getByRole('link', { name: '100002 · Ana Souza Lima' })).toHaveAttribute(
      'href',
      `/usuarios/${ANA.id}`,
    );

    expect(second).toHaveTextContent('Usuário bloqueado');
    expect(second).toHaveTextContent('Unidade removida');

    expect(third).toHaveTextContent('Comissões do mês fechadas');
    expect(third).toHaveTextContent('Banca');
    expect(third).toHaveTextContent('Mês 08/2026: R$ 315,00 pagos');
    expect(screen.queryByRole('link', { name: 'Limpar filtros' })).toBeNull();
  });

  it('no celular, a mesma lista em cartões', () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} />);
    const cards = within(screen.getByRole('list', { name: 'Registro de auditoria' })).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Comissão alterada');
    expect(cards[0]).toHaveTextContent('por Gerente Sintético');
    expect(within(cards[0]!).getByRole('link', { name: '100002 · Ana Souza Lima' })).toBeInTheDocument();
  });

  it('cards de período: contagens, link que filtra (mantendo os outros filtros) e o atual marcado', () => {
    const query = { ...noFilter, action: 'user.block' as const, period: '7d' as const, page: 3 };
    renderWithProviders(<AuditPage query={query} result={page(entries)} summary={summary} />);
    const periods = screen.getByRole('navigation', { name: 'Períodos' });
    const today = within(periods).getByRole('link', { name: /Hoje/ });
    expect(today).toHaveTextContent('3');
    expect(today).toHaveAttribute('href', '/auditoria?acao=user.block&periodo=hoje');
    const week = within(periods).getByRole('link', { name: /Últimos 7 dias/ });
    expect(week).toHaveAttribute('aria-current', 'true');
    expect(within(periods).getByRole('link', { name: /Total/ })).toHaveTextContent('1.250');
    expect(within(periods).getByRole('link', { name: /Total/ })).toHaveAttribute('href', '/auditoria?acao=user.block');
  });

  it('sem resumo (falha da API), os cards não aparecem', () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} summary={null} />);
    expect(screen.queryByRole('navigation', { name: 'Períodos' })).toBeNull();
  });

  it('filtro por ação é um formulário GET que mantém unidade, período e tamanho da página', () => {
    renderWithProviders(
      <AuditPage
        query={{ page: 1, pageSize: 50, action: 'promoter.update', userId: ANA.id, period: 'today' }}
        result={page([entries[0]!])}
      />,
    );
    const form = screen.getByRole('form', { name: 'Filtrar auditoria' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/auditoria');
    expect(within(form).getByRole('combobox', { name: 'Ação' })).toHaveValue('promoter.update');
    expect(within(form).getByRole('combobox', { name: 'Resultados por página' })).toHaveValue('50');
    expect(form.querySelector('input[type="hidden"][name="usuario"]')).toHaveValue(ANA.id);
    expect(form.querySelector('input[type="hidden"][name="periodo"]')).toHaveValue('hoje');
    expect(screen.getByText(/Mostrando só a unidade/)).toHaveTextContent('Ana Souza Lima (ID 100002)');
    expect(screen.getByRole('link', { name: 'Remover filtro de unidade' })).toHaveAttribute(
      'href',
      '/auditoria?acao=promoter.update&periodo=hoje&pageSize=50',
    );
    expect(screen.getByRole('link', { name: 'Limpar filtros' })).toHaveAttribute('href', '/auditoria');
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('mudar a ação envia o formulário', async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {});
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ação' }), 'user.block');
    expect(submit).toHaveBeenCalledOnce();
    submit.mockRestore();
  });

  it('vazio: avisa, com mensagem diferente quando há filtro', () => {
    const { unmount } = renderWithProviders(<AuditPage query={noFilter} result={page([])} />);
    expect(screen.getByText('Nenhuma alteração registrada ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    unmount();
    renderWithProviders(<AuditPage query={{ ...noFilter, period: 'today' }} result={page([])} />);
    expect(screen.getByText('Nenhum registro com esses filtros.')).toBeInTheDocument();
  });
});
