import type { CrmInactiveList, CrmNeverDepositedList } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseCrmQuery } from '@/lib/admin/crm-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/crm/inativos' }));

const { default: CrmPage } = await import('./CrmPage');

const PROMOTER = { id: 'c'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100001, name: 'Paula Promotora' };
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

const INACTIVE: CrmInactiveList = {
  items: [
    {
      player: { id: ID, displayId: 100012, name: 'Rita Sintética' },
      type: 'player',
      promoter: PROMOTER,
      phone: '11987654321',
      relationshipDays: 40,
      createdAt: '2026-08-27T15:00:00.000Z',
      totalDepositedCents: 7500,
      daysWithoutDeposit: 3,
      deposits: 2,
      lastDepositAt: '2026-10-03T15:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
  minDays: 1,
  maxDays: 7,
};

const showInactive = (data: CrmInactiveList = INACTIVE, raw: Record<string, string> = {}) =>
  renderWithProviders(<CrmPage query={parseCrmQuery('inactive', raw)} promoters={[PROMOTER]} data={data} />);

describe('CRM > Apostadores inativos', () => {
  it('filtros da referência: atalhos, faixa de dias e promotor; o atalho da faixa atual fica marcado', () => {
    showInactive();
    expect(screen.getByRole('heading', { level: 1, name: 'Apostadores inativos' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Filtrar apostadores inativos' });
    expect(form).toHaveAttribute('action', '/crm/inativos');
    const shortcuts = within(form).getByRole('navigation', { name: 'Atalhos de dias' });
    expect(
      within(shortcuts)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['7 dias', '15 dias', '30 dias', '60 dias']);
    expect(within(shortcuts).getByRole('link', { name: '7 dias' })).toHaveAttribute('aria-current', 'true');
    expect(within(shortcuts).getByRole('link', { name: '30 dias' })).toHaveAttribute(
      'href',
      '/crm/inativos?min=1&max=30',
    );
    expect(within(form).getByLabelText('Qtd. dias sem depositar mínima')).toHaveValue(1);
    expect(within(form).getByLabelText('Qtd. dias sem depositar máxima')).toHaveValue(7);
    expect(
      within(within(form).getByLabelText('Promotor'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Todos', '100001 - Paula Promotora']);
  });

  it('resultados: faixa, colunas da referência, linha com links (apostador, promotor, WhatsApp) e Exportar Excel', () => {
    showInactive();
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getByText(/^Dias Mín Sem Depositar:/).textContent).toBe('Dias Mín Sem Depositar: 1');
    expect(within(results).getByText(/^Dias Máx Sem Depositar:/).textContent).toBe('Dias Máx Sem Depositar: 7');
    const table = within(results).getByRole('table', { name: 'Apostadores inativos' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Nome',
      'Tipo',
      'Promotor Associado',
      'Código',
      'Telefone',
      'Valor total depositado',
      'Qtd. de dias sem depositar',
      'Qtd. de dias de relacionamento',
      'Qtd. de depósitos feitos',
    ]);
    const [, row] = within(table).getAllByRole('row');
    expect([...row!.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      'Rita Sintética',
      'Apostador',
      '100001 - Paula Promotora',
      '100012',
      '(11) 98765-4321',
      'R$ 75,00',
      '3',
      '40',
      '2',
    ]);
    expect(within(row!).getByRole('link', { name: 'Rita Sintética' })).toHaveAttribute('href', `/usuarios/${ID}`);
    expect(within(row!).getByRole('link', { name: 'WhatsApp (11) 98765-4321' })).toHaveAttribute(
      'href',
      'https://wa.me/5511987654321',
    );
    expect(within(results).getByRole('link', { name: 'Exportar Excel' })).toHaveAttribute(
      'href',
      '/crm/inativos/exportar?min=1&max=7',
    );
  });

  it('ordem: a coluna ativa marcada; clicar ordena (e volta à página 1)', () => {
    showInactive(INACTIVE, { ordem: 'depositado', dir: 'asc', page: '2' });
    const header = screen.getByRole('columnheader', { name: /Valor total depositado/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(within(header).getByRole('link')).toHaveAttribute(
      'href',
      '/crm/inativos?min=1&max=7&ordem=depositado&dir=desc',
    );
    expect(screen.getByRole('columnheader', { name: /^Nome/ })).toHaveAttribute('aria-sort', 'none');
    // A ordem continua numa nova pesquisa.
    const form = screen.getByRole('form', { name: 'Filtrar apostadores inativos' });
    expect(form.querySelector('input[name="ordem"]')).toHaveValue('depositado');
  });

  it('sem registros: o aviso da referência e sem Exportar', () => {
    showInactive({ ...INACTIVE, items: [], total: 0 });
    expect(screen.getByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Exportar Excel' })).toBeNull();
  });
});

describe('CRM > Nunca depositantes', () => {
  it('mesma tela, com dias de relacionamento e a data do cadastro', () => {
    const data: CrmNeverDepositedList = {
      items: [
        {
          player: INACTIVE.items[0]!.player,
          type: 'player',
          promoter: null,
          phone: '11987654321',
          relationshipDays: 40,
          createdAt: '2026-08-27T15:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      minDays: 0,
      maxDays: 7,
    };
    renderWithProviders(<CrmPage query={parseCrmQuery('never-deposited', {})} promoters={null} data={data} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Nunca depositantes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Qtd. dias de relacionamento mínima')).toHaveValue(0);
    expect(screen.getByText(/^Dias Mín de Relacionamento:/).textContent).toBe('Dias Mín de Relacionamento: 0');
    const table = screen.getByRole('table', { name: 'Nunca depositantes' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Nome',
      'Tipo',
      'Promotor Associado',
      'Código',
      'Telefone',
      'Data do cadastro',
      'Qtd. de dias de relacionamento',
    ]);
    expect(screen.getByRole('columnheader', { name: 'Data do cadastro' })).not.toHaveAttribute('aria-sort');
    expect(within(table).getByText('27/08/2026 12:00')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
  });
});
