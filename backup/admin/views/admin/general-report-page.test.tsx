import type { AdminGeneralReport, AdminGeneralReportRow } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { generalReportHref, parseGeneralReportQuery, sortHref } from '@/lib/admin/general-report-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('@/app/admin/actions', () => ({ searchPlayersAction: vi.fn(async () => []) }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/relatorios/geral' }));

const { default: GeneralReportPage } = await import('./GeneralReportPage');

// 29/05/2026 12:00 em Brasília.
const NOW = '2026-05-29T15:00:00.000Z';
const TODAY = '2026-05-29';
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const PROMOTER = { id: 'c'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100001, name: 'Paula Promotora' };

const row = (over: Partial<AdminGeneralReportRow> = {}): AdminGeneralReportRow => ({
  player: { id: ID, displayId: 100002, name: 'Ana Souza Lima' },
  type: 'player',
  salesCents: 10_000,
  commissionCents: 0,
  referralCommissionCents: 0,
  prizesCents: 4_000,
  otherCents: 1_500,
  netCents: 6_000,
  grossNetCents: 4_500,
  ...over,
});

const report = (items: AdminGeneralReportRow[], over: Partial<AdminGeneralReport> = {}): AdminGeneralReport => ({
  from: TODAY,
  to: TODAY,
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  totalPages: 1,
  ...over,
});

const show = (raw: Record<string, string> = {}, data: AdminGeneralReport = report([])) =>
  renderWithProviders(
    <GeneralReportPage
      query={parseGeneralReportQuery(raw, NOW)}
      today={TODAY}
      promoters={[PROMOTER]}
      player={null}
      report={data}
    />,
  );

describe('filtros do relatório geral na URL', () => {
  it('abre em hoje, vendas decrescente; valores inválidos viram o padrão', () => {
    expect(parseGeneralReportQuery({}, NOW)).toEqual({
      from: TODAY,
      to: TODAY,
      page: 1,
      pageSize: 25,
      promoterId: '',
      userId: '',
      type: '',
      sort: 'sales',
      dir: 'desc',
    });
    expect(
      parseGeneralReportQuery({ tipo: 'admin', ordem: 'constructor', dir: 'up', promotor: 'x', page: '-1' }, NOW),
    ).toMatchObject({ type: '', sort: 'sales', dir: 'desc', promoterId: '', page: 1 });
    expect(parseGeneralReportQuery({ de: '2026-05-01', ate: '2026-05-30' }, NOW)).toMatchObject({ from: TODAY });
  });

  it('lê e devolve os filtros; o padrão fica fora do endereço', () => {
    const query = parseGeneralReportQuery(
      { de: '2026-05-01', ate: TODAY, tipo: 'promotor', ordem: 'comissao-amigo', dir: 'asc', apostador: ID },
      NOW,
    );
    expect(query).toMatchObject({ type: 'promoter', sort: 'referralCommission', dir: 'asc', userId: ID });
    expect(generalReportHref(query)).toBe(
      `/relatorios/geral?de=2026-05-01&ate=${TODAY}&apostador=${ID}&tipo=promotor&ordem=comissao-amigo&dir=asc`,
    );
    expect(generalReportHref(parseGeneralReportQuery({}, NOW))).toBe(`/relatorios/geral?de=${TODAY}&ate=${TODAY}`);
  });

  it('clicar na coluna: a mesma inverte; outra começa decrescente (nome em ordem alfabética); volta à página 1', () => {
    const query = parseGeneralReportQuery({ page: '3' }, NOW);
    expect(sortHref(query, 'sales')).toContain('ordem=vendas&dir=asc');
    expect(sortHref(query, 'sales')).not.toContain('page=');
    expect(sortHref(query, 'prizes')).toContain('ordem=premios&dir=desc');
    expect(sortHref(query, 'name')).toContain('ordem=nome&dir=asc');
    // Voltar para vendas decrescente = o padrão: sem ordem no endereço.
    expect(sortHref({ ...query, dir: 'asc' }, 'sales')).toBe(`/relatorios/geral?de=${TODAY}&ate=${TODAY}`);
  });
});

describe('Relatório geral', () => {
  it('filtros da referência, com Pesquisar e Limpar Filtros', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Relatório geral' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Filtrar relatório geral' });
    expect(form).toHaveAttribute('action', '/relatorios/geral');
    expect([...form.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'Promotor',
      'Apostador',
      'Tipo',
      'Seção',
      'Rota',
      'Grupo de Cobrança',
    ]);
    expect(within(form).getByRole('group', { name: 'Período' })).toBeInTheDocument();
    expect(within(form).getByLabelText('Tipo')).toHaveAttribute('name', 'tipo');
    for (const label of ['Seção', 'Rota', 'Grupo de Cobrança']) {
      expect(within(form).getByLabelText(label)).not.toHaveAttribute('name');
    }
    expect(within(form).getByRole('link', { name: 'Limpar Filtros' })).toHaveAttribute('href', '/relatorios/geral');
  });

  it('sem movimento: período, colunas e "Nenhum resultado encontrado"', () => {
    show();
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getByText(/^Período:/).textContent).toBe('Período: 29/05/2026 – 29/05/2026');
    const table = within(results).getByRole('table', { name: 'Relatório geral' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'ID',
      'Apostador',
      'Tipo',
      'Vendas',
      'Comissão',
      'Comissão Amigo',
      'Prêmios',
      'Outros',
      'Líquido',
      'Líquido Geral',
    ]);
    expect(within(results).getByText('Nenhum resultado encontrado')).toBeInTheDocument();
    expect(within(results).getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('Nenhum registro');
  });

  it('linhas com os valores; Vendas marcada como a ordem atual; Líquido Geral não ordena', () => {
    show(
      {},
      report([
        row(),
        row({
          player: { id: PROMOTER.id, displayId: 100001, name: 'Paula Promotora' },
          type: 'promoter',
          salesCents: 0,
          commissionCents: 70,
          referralCommissionCents: 30,
          prizesCents: 0,
          otherCents: 0,
          netCents: -100,
          grossNetCents: -100,
        }),
      ]),
    );
    const table = screen.getByRole('table', { name: 'Relatório geral' });
    const [, first, second] = within(table).getAllByRole('row');
    const cells = (tr: HTMLElement) =>
      within(tr)
        .getAllByRole('cell')
        .map((c) => c.textContent?.replace(/ /g, ' '));
    expect(cells(first!)).toEqual([
      '100002',
      'Ana Souza Lima',
      'Apostador',
      'R$ 100,00',
      'R$ 0,00',
      'R$ 0,00',
      'R$ 40,00',
      'R$ 15,00',
      'R$ 60,00',
      'R$ 45,00',
    ]);
    expect(cells(second!).slice(2, 6)).toEqual(['Promotor', 'R$ 0,00', 'R$ 0,70', 'R$ 0,30']);
    expect(within(second!).getAllByRole('cell')[8]!.className).toContain('text-admin-danger');
    expect(within(first!).getByRole('link', { name: 'Ana Souza Lima' })).toHaveAttribute('href', `/usuarios/${ID}`);

    const headers = within(table).getAllByRole('columnheader');
    expect(headers.find((h) => h.textContent === 'Vendas')).toHaveAttribute('aria-sort', 'descending');
    expect(headers.find((h) => h.textContent === 'Prêmios')).toHaveAttribute('aria-sort', 'none');
    expect(within(headers.find((h) => h.textContent === 'Prêmios')!).getByRole('link')).toHaveAttribute(
      'href',
      `/relatorios/geral?de=${TODAY}&ate=${TODAY}&ordem=premios&dir=desc`,
    );
    const grossNet = headers.find((h) => h.textContent === 'Líquido Geral')!;
    expect(grossNet).not.toHaveAttribute('aria-sort');
    expect(within(grossNet).queryByRole('link')).toBeNull();
    expect(screen.getByTitle(/Créditos e ajustes feitos pelo painel/)).toHaveTextContent('Outros');
  });

  it('a ordem escolhida segue numa nova pesquisa (campos escondidos)', () => {
    show({ ordem: 'outros', dir: 'asc' });
    const form = screen.getByRole<HTMLFormElement>('form', { name: 'Filtrar relatório geral' });
    expect(form.elements.namedItem('ordem')).toHaveValue('outros');
    expect(form.elements.namedItem('dir')).toHaveValue('asc');
  });
});
