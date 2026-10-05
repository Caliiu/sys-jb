import type { AdminPrizeList, AdminPrizeListItem, AdminPrizeReview } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePrizesQuery } from '@/lib/admin/prizes-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('@/app/admin/actions', () => ({ searchPlayersAction: vi.fn(async () => []) }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/premios' }));

const { default: PrizesPage } = await import('./PrizesPage');

// 30/09/2026 12:00 em Brasília.
const NOW = '2026-09-30T15:00:00.000Z';
const TODAY = '2026-09-30';
const PLAYER = { id: '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100002, name: 'Ana Souza Lima' };
const PROMOTER = { id: 'c'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100001, name: 'Paula Promotora' };
const DRAW = { id: 'd'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', name: 'LT PT RIO 09HS', drawTime: '09:20' };

const prize = (over: Partial<AdminPrizeListItem> = {}): AdminPrizeListItem => ({
  game: 'lotteries',
  puleNumber: 10001,
  drawDate: '2026-09-29',
  lottery: 'LT PT RIO 09HS',
  drawCode: 'PTRIO09',
  stakeCents: 200,
  prizeCents: 400_000,
  settledAt: '2026-09-29T12:30:00.000Z',
  player: PLAYER,
  ...over,
});

const page = (items: AdminPrizeListItem[], over: Partial<AdminPrizeList> = {}): AdminPrizeList => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  totalPages: 1,
  totalPrizeCents: items.reduce((sum, item) => sum + item.prizeCents, 0),
  reviews: [],
  reviewsTotal: 0,
  pendingCount: 0,
  ...over,
});

const review = (over: Partial<AdminPrizeReview> = {}): AdminPrizeReview => ({
  game: 'lotteries',
  puleNumber: 10002,
  drawDate: '2026-09-29',
  lottery: 'LT PT RIO 09HS',
  drawCode: 'PTRIO09',
  paidCents: 0,
  correctedCents: 800_000,
  settledAt: '2026-09-29T12:30:00.000Z',
  checkedAt: '2026-09-29T13:30:00.000Z',
  player: PLAYER,
  ...over,
});

const show = (raw: Record<string, string>, extra: Partial<Parameters<typeof PrizesPage>[0]> = {}) =>
  renderWithProviders(
    <PrizesPage
      query={parsePrizesQuery(raw, NOW)}
      today={TODAY}
      promoters={[PROMOTER]}
      draws={[DRAW]}
      player={null}
      result={null}
      {...extra}
    />,
  );

const dateInput = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

beforeEach(() => vi.clearAllMocks());

describe('Pules Premiadas', () => {
  it('filtros da referência, com Pesquisar e Limpar; sem pesquisar, nenhum resultado', () => {
    show({});
    expect(screen.getByRole('heading', { level: 1, name: 'Pules Premiadas' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Filtrar pules premiadas' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/premios');
    expect(within(form).getByRole('group', { name: 'Período (Data do Jogo)' })).toBeInTheDocument();
    expect([...form.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'Extração',
      'Promotor',
      'Apostador',
      'Seção',
      'Rota',
      'Grupo de Cobrança',
      'Prêmio Mínimo (R$)',
      'Prêmio Máximo (R$)',
    ]);
    expect(
      within(form)
        .getAllByRole('button', { pressed: false })
        .concat(within(form).getAllByRole('button', { pressed: true }))
        .map((b) => b.textContent)
        .sort(),
    ).toEqual(['30D', '7D', 'Hoje', 'Mês', 'Mês Ant.', 'Ontem'].sort());
    expect(within(form).getByRole('button', { name: 'Pesquisar' })).toHaveAttribute('type', 'submit');
    expect(within(form).getByRole('link', { name: 'Limpar Filtros' })).toHaveAttribute('href', '/premios');
    // Abre em hoje, com "Hoje" marcado.
    expect(dateInput('Início do período').value).toBe(TODAY);
    expect(dateInput('Fim do período').value).toBe(TODAY);
    expect(within(form).getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
    // Cadastros que ainda não existem não vão para a URL.
    for (const label of ['Seção', 'Rota', 'Grupo de Cobrança']) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('name');
    }
    expect(screen.queryByRole('region', { name: 'Resultados' })).not.toBeInTheDocument();
  });

  it('atalhos preenchem as datas enviadas; o calendário não passa de hoje', async () => {
    show({});
    await userEvent.click(screen.getByRole('button', { name: 'Mês Ant.' }));
    expect(dateInput('Início do período')).toHaveValue('2026-08-01');
    expect(dateInput('Fim do período')).toHaveValue('2026-08-31');
    expect(dateInput('Início do período')).toHaveAttribute('name', 'de');
    expect(dateInput('Fim do período')).toHaveAttribute('name', 'ate');
    expect(screen.getByRole('button', { name: 'Mês Ant.' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: '7D' }));
    expect(dateInput('Início do período')).toHaveValue('2026-09-24');
    expect(dateInput('Fim do período')).toHaveAttribute('max', TODAY);
    expect(dateInput('Início do período')).toHaveAttribute('max', TODAY);
  });

  it('mantém os filtros pesquisados nos campos', () => {
    show({
      de: '2026-09-01',
      ate: '2026-09-15',
      extracao: DRAW.id,
      promotor: PROMOTER.id,
      min: '1.500,50',
      max: '10000',
    });
    expect(dateInput('Início do período')).toHaveValue('2026-09-01');
    expect(dateInput('Fim do período')).toHaveValue('2026-09-15');
    expect(screen.getByLabelText('Extração')).toHaveValue(DRAW.id);
    expect(screen.getByLabelText('Promotor')).toHaveValue(PROMOTER.id);
    expect(screen.getByLabelText('Prêmio Mínimo (R$)')).toHaveValue('1500,50');
    expect(screen.getByLabelText('Prêmio Máximo (R$)')).toHaveValue('10000');
  });

  it('resultado: período, quantidade, total em prêmios e a tabela', () => {
    show(
      { de: '2026-09-01', ate: '2026-09-30' },
      { result: page([prize(), prize({ game: 'fazendinha', puleNumber: 77, prizeCents: 1_800, stakeCents: 100 })]) },
    );
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getByText(/Período:/).textContent).toBe('Período: 01/09/2026 – 30/09/2026');
    expect(within(results).getByText(/Pules:/).textContent).toBe('Pules: 2');
    expect(within(results).getByText(/Total em prêmios:/).textContent).toMatch(/R\$\s4\.018,00/);

    const table = within(results).getByRole('table', { name: 'Pules premiadas' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Pule', 'Data do Jogo', 'Apostador', 'Extração', 'Apostado', 'Prêmio']);
    const [first] = within(table).getAllByRole('row').slice(1);
    expect(first).toHaveTextContent('#10001');
    expect(first).toHaveTextContent('Loterias');
    expect(first).toHaveTextContent('29/09/2026');
    expect(first).toHaveTextContent(/R\$\s4\.000,00/);
    expect(within(first!).getByRole('link', { name: /Ana Souza Lima/ })).toHaveAttribute(
      'href',
      `/usuarios/${PLAYER.id}`,
    );
  });

  it('um dia só mostra uma data; sem pules, a mensagem de vazio', () => {
    show({ de: TODAY, ate: TODAY }, { result: page([]) });
    expect(screen.getByText(/Período:/).textContent).toBe('Período: 30/09/2026');
    expect(screen.getByText('Nenhuma pule premiada no período.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Resultado corrigido/ })).not.toBeInTheDocument();
  });

  it('pules aguardando apuração e o aviso de resultado corrigido depois do pagamento', () => {
    show(
      { de: '2026-09-01', ate: '2026-09-30' },
      {
        result: page([prize()], {
          pendingCount: 3,
          reviews: [review(), review({ puleNumber: 10003, paidCents: 800_000, correctedCents: 0 })],
          reviewsTotal: 5,
        }),
      },
    );
    expect(screen.getByText(/Aguardando apuração:/).textContent).toBe('Aguardando apuração: 3');

    const notice = screen.getByRole('region', { name: 'Resultado corrigido depois do pagamento (5)' });
    expect(within(notice).getByText(/Mostrando as 2 mais recentes/)).toBeInTheDocument();
    const rows = within(within(notice).getByRole('list', { name: 'Pules com resultado corrigido' })).getAllByRole(
      'listitem',
    );
    expect(rows[0]).toHaveTextContent('#10002');
    expect(rows[0]).toHaveTextContent(/Pago R\$\s0,00 · corrigido R\$\s8\.000,00 · \+R\$\s8\.000,00/);
    expect(rows[1]).toHaveTextContent(/−R\$\s8\.000,00/);
    expect(within(rows[0]!).getByRole('link', { name: /Ana Souza Lima/ })).toHaveAttribute(
      'href',
      `/usuarios/${PLAYER.id}`,
    );
  });
});
