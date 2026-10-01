import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const noFilter: AuditQuery = { page: 1, pageSize: 25, action: '', userId: '', period: '' };
// 30/09/2026 12:00 em Brasília.
const NOW = '2026-09-30T15:00:00.000Z';

describe('Registro de auditoria', () => {
  it('mostra quando e quem alterou, a ação (selo), o apostador (link) e o que mudou', () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} nowIso={NOW} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Log de auditoria' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filtros' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Registro de auditoria' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Alterado em', 'Ação', 'Apostador', 'Detalhes']);

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
    expect(second).toHaveTextContent('Apostador removido');

    expect(third).toHaveTextContent('Comissões do mês fechadas');
    expect(third).toHaveTextContent('Banca');
    expect(third).toHaveTextContent('Mês 08/2026: R$ 315,00 pagos');
    expect(screen.getByText('Mostrando 1 a 3 de 3 registros')).toBeInTheDocument();
  });

  it('no celular, a mesma lista em cartões', () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} nowIso={NOW} />);
    const cards = within(screen.getByRole('list', { name: 'Registro de auditoria' })).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Comissão alterada');
    expect(cards[0]).toHaveTextContent('por Gerente Sintético');
    expect(within(cards[0]!).getByRole('link', { name: '100002 · Ana Souza Lima' })).toBeInTheDocument();
  });

  it('atalhos de período: link que filtra mantendo os outros filtros, o atual marcado e as datas no resumo', () => {
    const query = { ...noFilter, action: 'user.block' as const, period: '7d' as const, page: 3 };
    renderWithProviders(<AuditPage query={query} result={page(entries)} nowIso={NOW} />);
    const periods = screen.getByRole('navigation', { name: 'Período' });
    expect(
      within(periods)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Hoje', '7D', '30D', 'Tudo']);
    expect(within(periods).getByRole('link', { name: 'Hoje' })).toHaveAttribute(
      'href',
      '/auditoria?acao=user.block&periodo=hoje',
    );
    expect(within(periods).getByRole('link', { name: '7D' })).toHaveAttribute('aria-current', 'true');
    expect(within(periods).getByRole('link', { name: 'Tudo' })).toHaveAttribute('href', '/auditoria?acao=user.block');
    expect(screen.getByText(/Período:/)).toHaveTextContent('Período: 24/09/2026 – 30/09/2026');
  });

  it('sem período: todo o histórico', () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} nowIso={NOW} />);
    expect(screen.getByText(/Período:/)).toHaveTextContent('Período: Todo o histórico');
    expect(screen.getByRole('link', { name: 'Tudo' })).toHaveAttribute('aria-current', 'true');
  });

  it('filtros: formulário GET com Pesquisar e Limpar, mantendo apostador, período e tamanho da página', () => {
    renderWithProviders(
      <AuditPage
        query={{ page: 1, pageSize: 50, action: 'promoter.update', userId: ANA.id, period: 'today' }}
        result={page([entries[0]!])}
        nowIso={NOW}
      />,
    );
    const form = screen.getByRole('form', { name: 'Filtrar auditoria' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/auditoria');
    expect(within(form).getByRole('combobox', { name: 'Ação' })).toHaveValue('promoter.update');
    expect(within(form).getByRole('combobox', { name: 'Resultados por página' })).toHaveValue('50');
    expect(form.querySelector('input[type="hidden"][name="usuario"]')).toHaveValue(ANA.id);
    expect(form.querySelector('input[type="hidden"][name="periodo"]')).toHaveValue('hoje');
    expect(within(form).getByRole('button', { name: 'Pesquisar' })).toHaveAttribute('type', 'submit');
    expect(within(form).getByRole('link', { name: 'Limpar Filtros' })).toHaveAttribute('href', '/auditoria');
    expect(screen.getByText(/Mostrando só o apostador/)).toHaveTextContent('Ana Souza Lima (ID 100002)');
    expect(screen.getByRole('link', { name: 'Remover filtro de apostador' })).toHaveAttribute(
      'href',
      '/auditoria?acao=promoter.update&periodo=hoje&pageSize=50',
    );
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
  });

  it('Pesquisar deixa os campos vazios fora da URL', () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} nowIso={NOW} />);
    const form = screen.getByRole<HTMLFormElement>('form', { name: 'Filtrar auditoria' });
    let sent: string[] = [];
    // No document (depois do onSubmit do React, que fica na raiz): vê os campos como o navegador os enviaria.
    const capture = (event: Event) => {
      sent = [...new FormData(form).keys()];
      event.preventDefault();
    };
    document.addEventListener('submit', capture);
    fireEvent.submit(form);
    document.removeEventListener('submit', capture);
    expect(sent).toEqual(['pageSize']);
  });

  it('Ocultar esconde os filtros', async () => {
    renderWithProviders(<AuditPage query={noFilter} result={page(entries)} nowIso={NOW} />);
    const toggle = screen.getByRole('button', { name: 'Ocultar' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('Mostrar');
    expect(screen.queryByRole('form', { name: 'Filtrar auditoria' })).toBeNull();
  });

  it('vazio: avisa, com mensagem diferente quando há filtro', () => {
    const { unmount } = renderWithProviders(<AuditPage query={noFilter} result={page([])} nowIso={NOW} />);
    expect(screen.getByText('Nenhuma alteração registrada ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    unmount();
    renderWithProviders(<AuditPage query={{ ...noFilter, period: 'today' }} result={page([])} nowIso={NOW} />);
    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
  });
});
