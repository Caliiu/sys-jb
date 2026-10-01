import type { AdminPlayerStatement, AdminStatementEntry } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseStatementQuery, statementHref } from '@/lib/admin/statement-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('@/app/admin/actions', () => ({ searchPlayersAction: vi.fn(async () => ({ ok: true, data: [] })) }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/extrato' }));

const { default: StatementPage } = await import('./StatementPage');

// 29/05/2026 12:00 em Brasília.
const NOW = '2026-05-29T15:00:00.000Z';
const TODAY = '2026-05-29';
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const PLAYER = { id: ID, displayId: 100002, name: 'Ana Souza Lima' };

const entry = (over: Partial<AdminStatementEntry>): AdminStatementEntry => ({
  id: crypto.randomUUID(),
  createdAt: '2026-05-29T13:00:00.000Z',
  kind: 'OPERATOR_CREDIT',
  puleNumber: null,
  note: null,
  operatorName: null,
  balanceCents: 0,
  bonusCents: 0,
  prizesCents: 0,
  gamesCents: 0,
  totalCents: 0,
  balanceAfterCents: 0,
  ...over,
});

const STATEMENT: AdminPlayerStatement = {
  from: TODAY,
  to: TODAY,
  player: PLAYER,
  openingCents: 0,
  closingCents: 10_100,
  creditsCents: 10_500,
  debitsCents: -400,
  page: 1,
  pageSize: 25,
  total: 3,
  totalPages: 1,
  items: [
    entry({ kind: 'FAZENDINHA_BET', puleNumber: 77, balanceCents: -100, totalCents: -100, balanceAfterCents: 10_100 }),
    entry({
      kind: 'OPERATOR_CREDIT',
      gamesCents: 2_000,
      note: 'Promoção',
      operatorName: 'Maria',
      balanceAfterCents: 10_200,
    }),
    entry({
      kind: 'OPERATOR_CREDIT',
      balanceCents: 10_000,
      totalCents: 10_000,
      note: 'Depósito em mãos',
      operatorName: 'Maria',
      balanceAfterCents: 10_200,
    }),
  ],
};

const show = (raw: Record<string, string> = {}, statement: AdminPlayerStatement | null = null) =>
  renderWithProviders(
    <StatementPage
      query={parseStatementQuery(raw, NOW)}
      today={TODAY}
      player={raw.apostador ? PLAYER : null}
      statement={statement}
    />,
  );

const text = (el: Element | null | undefined) => el?.textContent?.replace(/ /g, ' ');

describe('filtros do extrato na URL', () => {
  it('só pesquisa com período válido e um apostador', () => {
    expect(parseStatementQuery({}, NOW)).toEqual({
      searched: false,
      from: TODAY,
      to: TODAY,
      userId: '',
      page: 1,
      pageSize: 25,
    });
    expect(parseStatementQuery({ de: TODAY, ate: TODAY }, NOW).searched).toBe(false);
    expect(parseStatementQuery({ de: TODAY, ate: TODAY, apostador: 'x' }, NOW).searched).toBe(false);
    expect(parseStatementQuery({ de: TODAY, ate: '2026-05-30', apostador: ID }, NOW).searched).toBe(false);
    expect(parseStatementQuery({ de: TODAY, ate: TODAY, apostador: ID.toUpperCase() }, NOW)).toMatchObject({
      searched: true,
      userId: ID,
    });
    expect(statementHref({ from: TODAY, to: TODAY, userId: ID, page: 2, pageSize: 25 })).toBe(
      `/extrato?de=${TODAY}&ate=${TODAY}&apostador=${ID}&page=2`,
    );
  });
});

describe('Extrato apostador', () => {
  it('filtros da referência: período e apostador obrigatório; antes de pesquisar, o pedido de filtro', async () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Extrato apostador' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Filtrar extrato' });
    expect(within(form).getByRole('group', { name: 'Período' })).toBeInTheDocument();
    const playerButton = within(form).getByRole('button', { name: /Apostador/ });
    expect(playerButton).toHaveTextContent('Selecione um apostador');
    // Obrigatório: sem a opção "Todos".
    await userEvent.click(playerButton);
    expect(screen.queryByRole('option', { name: 'Todos' })).toBeNull();
    expect(
      screen.getByText('Para visualizar os dados, por favor, aplique um filtro no painel acima.'),
    ).toBeInTheDocument();
  });

  it('extrato: resumo do período e os lançamentos com o saldo depois de cada um', () => {
    show({ de: TODAY, ate: TODAY, apostador: ID }, STATEMENT);
    const region = screen.getByRole('region', { name: 'Extrato' });
    expect(within(region).getByRole('link', { name: '100002 - Ana Souza Lima' })).toHaveAttribute(
      'href',
      `/usuarios/${ID}`,
    );
    for (const [label, value] of [
      ['Saldo inicial', 'R$ 0,00'],
      ['Entradas', 'R$ 105,00'],
      ['Saídas', 'R$ -4,00'],
      ['Saldo final', 'R$ 101,00'],
    ]) {
      expect(text(within(region).getByText(`${label}:`, { exact: false }))).toBe(`${label}: ${value}`);
    }

    const table = within(region).getByRole('table', { name: 'Lançamentos' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Data/Hora', 'Lançamento', 'Detalhe', 'Saldo', 'Bônus', 'Prêmios', 'Games', 'Total', 'Saldo após']);
    const rows = within(table).getAllByRole('row').slice(1);
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => text(cell));
    expect(cells(rows[0]!).slice(1)).toEqual([
      'Aposta Fazendinha',
      'Pule #77',
      'R$ -1,00',
      '—',
      '—',
      '—',
      'R$ -1,00',
      'R$ 101,00',
    ]);
    expect(cells(rows[1]!).slice(1, 3)).toEqual(['Crédito pelo painel', 'Promoção · por Maria']);
    expect(cells(rows[1]!)[6]).toBe('R$ 20,00');
    expect(within(region).getByRole('navigation', { name: 'Paginação' })).toHaveTextContent(
      'Mostrando 1 a 3 de 3 lançamentos',
    );
  });

  it('pesquisado sem lançamentos: o saldo do período e a mensagem de vazio', () => {
    show(
      { de: TODAY, ate: TODAY, apostador: ID },
      { ...STATEMENT, items: [], total: 0, openingCents: 500, closingCents: 500 },
    );
    expect(screen.getByText('Nenhum lançamento no período.')).toBeInTheDocument();
    expect(text(screen.getByText('Saldo final:', { exact: false }))).toBe('Saldo final: R$ 5,00');
  });
});
