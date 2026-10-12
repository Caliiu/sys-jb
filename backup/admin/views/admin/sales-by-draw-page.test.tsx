import type { AdminSalesByDrawReport, SalesByDrawRow } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseSalesByDrawQuery, salesByDrawHref, salesByDrawMaxDate } from '@/lib/admin/sales-by-draw-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('@/app/admin/actions', () => ({ searchPlayersAction: vi.fn(async () => []) }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/relatorios/loterias/vendas-por-extracao',
}));

const { default: SalesByDrawPage } = await import('./SalesByDrawPage');

// 29/05/2026 12:00 em Brasília.
const NOW = '2026-05-29T15:00:00.000Z';
const TODAY = '2026-05-29';
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

const row = (over: Partial<SalesByDrawRow> = {}): SalesByDrawRow => ({
  lottery: 'LT PT RIO 09HS',
  hour: 9,
  drawCode: 'PTRIO09',
  drawTime: '09:20',
  tickets: 3,
  lotteriesCents: 1_000,
  fazendinhaCents: 200,
  salesCents: 1_200,
  prizesCents: 0,
  netCents: 1_200,
  ...over,
});

const ROWS = [
  row(),
  row({
    lottery: 'LT LOOK 14HS',
    hour: 14,
    drawCode: 'LOOK14',
    drawTime: '14:20',
    tickets: 2,
    lotteriesCents: 500,
    fazendinhaCents: 0,
    salesCents: 500,
    prizesCents: 2_000,
    netCents: -1_500,
  }),
];

const report = (rows: SalesByDrawRow[]): AdminSalesByDrawReport => ({
  from: TODAY,
  to: TODAY,
  rows,
  totals: { tickets: 0, lotteriesCents: 0, fazendinhaCents: 0, salesCents: 0, prizesCents: 0, netCents: 0 },
});

const show = (raw: Record<string, string> = {}, data: AdminSalesByDrawReport | null = null) =>
  renderWithProviders(
    <SalesByDrawPage
      query={parseSalesByDrawQuery(raw, NOW)}
      today={TODAY}
      maxDate={salesByDrawMaxDate(NOW)}
      promoters={[]}
      player={null}
      report={data}
    />,
  );

const money = (text: string | null | undefined) => text?.replace(/ /g, ' ');

describe('filtros de vendas por extração na URL', () => {
  it('pesquisa só com período válido; aceita a data do jogo até o fim da janela de apostas', () => {
    expect(parseSalesByDrawQuery({}, NOW)).toEqual({
      searched: false,
      from: TODAY,
      to: TODAY,
      promoterId: '',
      userId: '',
    });
    expect(salesByDrawMaxDate(NOW)).toBe('2026-06-04');
    expect(parseSalesByDrawQuery({ de: TODAY, ate: '2026-06-04' }, NOW).searched).toBe(true);
    expect(parseSalesByDrawQuery({ de: TODAY, ate: '2026-06-05' }, NOW).searched).toBe(false);
    expect(parseSalesByDrawQuery({ de: TODAY, ate: TODAY, apostador: ID, promotor: 'x' }, NOW)).toMatchObject({
      userId: ID,
      promoterId: '',
    });
    expect(salesByDrawHref({ from: TODAY, to: TODAY, promoterId: '', userId: ID })).toBe(
      `/relatorios/loterias/vendas-por-extracao?de=${TODAY}&ate=${TODAY}&apostador=${ID}`,
    );
  });
});

describe('Vendas por extração', () => {
  it('filtros da referência; antes de pesquisar, o pedido para aplicar um filtro', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Vendas por extração' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Filtrar vendas por extração' });
    expect([...form.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'Seção',
      'Rota',
      'Promotor',
      'Apostador',
    ]);
    expect(within(form).getByLabelText('Fim do período')).toHaveAttribute('max', '2026-06-04');
    expect(screen.getByRole('heading', { name: 'Resultados:' })).toBeInTheDocument();
    expect(
      screen.getByText('Para visualizar os dados, por favor, aplique um filtro no painel acima.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('com resultado: extrações por horário e o total; o filtro por nome recalcula o total', async () => {
    show({ de: TODAY, ate: TODAY }, report(ROWS));
    const table = screen.getByRole('table', { name: 'Vendas por extração' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Horário', 'Extração', 'Pules', 'Loterias', 'Fazendinha', 'Total vendas', 'Prêmios', 'Líquido']);
    const total = () => money(within(table).getByRole('rowheader', { name: 'Total' }).parentElement?.textContent);
    expect(total()).toBe('Total5R$ 15,00R$ 2,00R$ 17,00R$ 20,00R$ -3,00');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filtrar extração' }), 'look');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(total()).toBe('Total2R$ 5,00R$ 0,00R$ 5,00R$ 20,00R$ -15,00');

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Filtrar extração' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filtrar extração' }), 'ptrio');
    expect(within(table).getByText('LT PT RIO 09HS')).toBeInTheDocument();
    expect(within(table).queryByText('LT LOOK 14HS')).toBeNull();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Filtrar extração' }), 'zzz');
    expect(screen.getByText('Nenhuma extração com esse nome.')).toBeInTheDocument();
  });

  it('pesquisado sem vendas: a mensagem de vazio', () => {
    show({ de: TODAY, ate: TODAY }, report([]));
    expect(screen.getByText('Nenhuma venda no período.')).toBeInTheDocument();
  });
});
