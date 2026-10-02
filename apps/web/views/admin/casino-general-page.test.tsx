import type { AdminCasinoGeneralReport, CasinoGeneralRow } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { casinoGeneralHref, parseCasinoGeneralQuery } from '@/lib/admin/casino-general-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('@/app/admin/actions', () => ({ searchPlayersAction: vi.fn(async () => []) }));
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/relatorios/cassino/geral',
}));

const { default: CasinoGeneralPage } = await import('./CasinoGeneralPage');

// 29/05/2026 12:00 em Brasília.
const NOW = '2026-05-29T15:00:00.000Z';
const TODAY = '2026-05-29';
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

const row = (over: Partial<CasinoGeneralRow> = {}): CasinoGeneralRow => ({
  player: { id: ID, displayId: 1001, name: 'Ana Souza' },
  type: 'player',
  turnoverCents: 5_000,
  payoutCents: 2_000,
  netCents: 3_000,
  ...over,
});

const report = (rows: CasinoGeneralRow[], available = true): AdminCasinoGeneralReport => ({
  from: TODAY,
  to: TODAY,
  rows,
  totals: rows.reduce(
    (t, r) => ({
      turnoverCents: t.turnoverCents + r.turnoverCents,
      payoutCents: t.payoutCents + r.payoutCents,
      netCents: t.netCents + r.netCents,
    }),
    { turnoverCents: 0, payoutCents: 0, netCents: 0 },
  ),
  available,
});

const show = (raw: Record<string, string> = {}, data: AdminCasinoGeneralReport | null = null) =>
  renderWithProviders(
    <CasinoGeneralPage
      query={parseCasinoGeneralQuery(raw, NOW)}
      today={TODAY}
      promoters={[{ id: ID, displayId: 7, name: 'Promotor Zé' }]}
      player={null}
      report={data}
    />,
  );

const money = (text: string | null | undefined) => text?.replace(/ /g, ' ');

describe('filtros do geral cassino na URL', () => {
  it('pesquisa só com período válido (até hoje); id ou tipo inválido = todos', () => {
    expect(parseCasinoGeneralQuery({}, NOW)).toEqual({
      searched: false,
      from: TODAY,
      to: TODAY,
      promoterId: '',
      userId: '',
      type: '',
    });
    expect(parseCasinoGeneralQuery({ de: TODAY, ate: '2026-05-30' }, NOW).searched).toBe(false);
    expect(parseCasinoGeneralQuery({ de: '2026-05-30', ate: TODAY }, NOW).searched).toBe(false);
    expect(parseCasinoGeneralQuery({ de: '2025-05-28', ate: TODAY }, NOW).searched).toBe(false);
    expect(
      parseCasinoGeneralQuery(
        { de: '2026-05-01', ate: TODAY, apostador: ID.toUpperCase(), promotor: 'x', tipo: 'promotor' },
        NOW,
      ),
    ).toEqual({ searched: true, from: '2026-05-01', to: TODAY, promoterId: '', userId: ID, type: 'promoter' });
    // Chaves herdadas de Object não viram tipo.
    expect(parseCasinoGeneralQuery({ de: TODAY, ate: TODAY, tipo: 'constructor' }, NOW).type).toBe('');
    expect(casinoGeneralHref({ from: TODAY, to: TODAY, promoterId: ID, userId: '', type: 'player' })).toBe(
      `/relatorios/cassino/geral?de=${TODAY}&ate=${TODAY}&promotor=${ID}&tipo=apostador`,
    );
  });
});

describe('Geral cassino', () => {
  it('filtros da referência; antes de pesquisar, o pedido para aplicar um filtro', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Geral cassino' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Filtrar geral cassino' });
    expect([...form.querySelectorAll('label')].map((l) => l.textContent)).toEqual(
      expect.arrayContaining(['Promotor', 'Apostador', 'Tipo', 'Seção', 'Rota']),
    );
    expect(within(form).getByLabelText('Fim do período')).toHaveAttribute('max', TODAY);
    // Seção e Rota ainda não têm cadastro: não vão para a URL.
    expect(within(form).getByLabelText('Seção')).not.toHaveAttribute('name');
    expect(within(form).getByLabelText('Rota')).not.toHaveAttribute('name');
    expect(within(form).getByLabelText('Tipo')).toHaveAttribute('name', 'tipo');
    expect(within(form).getByRole('option', { name: '7 - Promotor Zé' })).toBeInTheDocument();
    expect(
      screen.getByText('Para visualizar os dados, por favor, aplique um filtro no painel acima.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('mantém os filtros pesquisados nos campos', () => {
    show({ de: TODAY, ate: TODAY, promotor: ID, tipo: 'promotor' }, report([]));
    const form = screen.getByRole('form', { name: 'Filtrar geral cassino' });
    expect(within(form).getByLabelText('Tipo')).toHaveValue('promotor');
    expect(within(form).getByLabelText('Promotor')).toHaveValue(ID);
  });

  it('com resultado: uma linha por usuário, com o total; negativo em destaque', () => {
    const loss = row({
      player: { id: 'f2a1c0de-0000-4000-8000-000000000001', displayId: 1002, name: 'Bruno Lima' },
      type: 'promoter',
      turnoverCents: 1_000,
      payoutCents: 4_000,
      netCents: -3_000,
    });
    show({ de: TODAY, ate: TODAY }, report([row(), loss]));
    expect(screen.getByText('29/05/2026')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Geral cassino' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['ID', 'Apostador', 'Tipo', 'Turnover', 'Payout', 'Líquido']);
    expect(within(table).getByRole('link', { name: 'Ana Souza' })).toHaveAttribute('href', `/usuarios/${ID}`);
    expect(within(table).getByText('Promotor')).toBeInTheDocument();
    const total = within(table).getByRole('rowheader', { name: 'Total' }).parentElement;
    expect(money(total?.textContent)).toBe('TotalR$ 60,00R$ 60,00R$ 0,00');
    expect([...table.querySelectorAll('tbody .text-admin-danger')].map((td) => money(td.textContent))).toEqual([
      'R$ -30,00',
    ]);
    expect(screen.queryByText(/ainda não tem registro/)).toBeNull();
  });

  it('pesquisado sem cassino no sistema: vazio e o aviso de que ainda não há registro', () => {
    show({ de: TODAY, ate: TODAY }, report([], false));
    expect(screen.getByText('Nenhum jogo de cassino no período.')).toBeInTheDocument();
    expect(screen.getByText(/O cassino ainda não tem registro no sistema/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
