import type { AdminTicketListItem } from '@sysjb/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTicketsQuery } from '@/lib/admin/tickets-query';
import { renderWithProviders, router } from '@/test/render';

const searchPlayersAction = vi.fn();
vi.mock('@/app/admin/actions', () => ({
  searchPlayersAction: (...args: unknown[]) => searchPlayersAction(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/bilhetes' }));

const { default: TicketsPage } = await import('./TicketsPage');

// 30/09/2026 12:00 em Brasília.
const NOW = '2026-09-30T15:00:00.000Z';
const PLAYER = { id: '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100002, name: 'Ana Souza Lima' };
const PROMOTER = { id: 'c'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100001, name: 'Paula Promotora' };
const DRAW = { id: 'd'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', name: 'LT PT RIO 09HS', drawTime: '09:20' };

const ticket = (over: Partial<AdminTicketListItem> = {}): AdminTicketListItem => ({
  game: 'lotteries',
  puleNumber: 10001,
  createdAt: '2026-09-30T12:05:00.000Z',
  drawDate: '2026-10-01',
  lottery: 'LT PT RIO 09HS',
  drawCode: 'PTRIO09',
  totalCents: 1250,
  player: PLAYER,
  canceledAt: null,
  ...over,
});

const show = (raw: Record<string, string>, extra: Partial<Parameters<typeof TicketsPage>[0]> = {}) =>
  renderWithProviders(
    <TicketsPage
      query={parseTicketsQuery(raw, NOW)}
      today="2026-09-30"
      promoters={[PROMOTER]}
      draws={[DRAW]}
      player={null}
      result={null}
      {...extra}
    />,
  );

beforeEach(() => vi.clearAllMocks());

describe('Pules', () => {
  it('filtros na ordem da referência, com Pesquisar e Limpar; sem pesquisar, nenhum resultado', () => {
    show({});
    expect(screen.getByRole('heading', { level: 1, name: 'Pules' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Filtros' })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Filtrar pules' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/bilhetes');
    const labels = [...form.querySelectorAll('label')].map((l) => l.textContent);
    expect(labels).toEqual([
      'Data',
      'Promotor',
      'Apostador',
      'Seção',
      'Rota',
      'Grupo de Cobrança',
      'Horário (Extração)',
    ]);
    expect(within(form).getByLabelText('Data')).toHaveValue('2026-09-30');
    expect(within(form).getByLabelText('Data')).toHaveAttribute('max', '2026-09-30');
    expect(within(form).getByRole('option', { name: '100001 - Paula Promotora' })).toBeInTheDocument();
    expect(within(form).getByRole('option', { name: '09:20 - LT PT RIO 09HS' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Pesquisar' })).toHaveAttribute('type', 'submit');
    expect(within(form).getByRole('link', { name: 'Limpar Filtros' })).toHaveAttribute('href', '/bilhetes');
    expect(screen.getByRole('heading', { name: 'Pesquisa por Ticket' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Número do Ticket' })).toHaveAttribute('placeholder', 'Ex: 10001');
    expect(screen.getByRole('button', { name: 'Pesquisar Ticket' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resultados' })).toBeNull();
  });

  it('Seção, Rota e Grupo de Cobrança não vão para a URL (cadastros ainda não existem)', () => {
    show({});
    const form = screen.getByRole<HTMLFormElement>('form', { name: 'Filtrar pules' });
    let sent: string[] = [];
    // No document (depois do onSubmit do React): vê os campos como o navegador os enviaria.
    const capture = (event: Event) => {
      sent = [...new FormData(form).keys()];
      event.preventDefault();
    };
    document.addEventListener('submit', capture);
    fireEvent.submit(form);
    document.removeEventListener('submit', capture);
    expect(sent).toEqual(['data']);
  });

  it('lista do dia: resumo com data e total, tabela e paginação que mantém os filtros', () => {
    const items = [ticket(), ticket({ game: 'fazendinha', puleNumber: 5, totalCents: 100, lottery: 'LT BAHIA 15HS' })];
    show(
      { data: '2026-09-29', apostador: PLAYER.id },
      {
        player: PLAYER,
        result: {
          kind: 'list',
          page: { items, page: 1, pageSize: 25, total: 30, totalPages: 2, totalCents: 4250 },
        },
      },
    );
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getByText(/Data:/)).toHaveTextContent('Data: 29/09/2026');
    expect(within(results).getByText(/Total:/)).toHaveTextContent('Total: R$ 42,50');
    const table = within(results).getByRole('table', { name: 'Pules' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Pule', 'Data/Hora', 'Apostador', 'Extração', 'Sorteio', 'Valor']);
    const [first, second] = within(table).getAllByRole('row').slice(1);
    expect(first).toHaveTextContent('#10001');
    expect(first).toHaveTextContent('Loterias');
    expect(first).toHaveTextContent('30/09/26 09:05');
    expect(first).toHaveTextContent('PTRIO09');
    expect(first).toHaveTextContent('01/10/2026');
    expect(first).toHaveTextContent('R$ 12,50');
    expect(within(first!).getByRole('link', { name: '100002 · Ana Souza Lima' })).toHaveAttribute(
      'href',
      `/usuarios/${PLAYER.id}`,
    );
    expect(second).toHaveTextContent('Fazendinha');
    expect(within(results).getByRole('link', { name: 'Próximo' })).toHaveAttribute(
      'href',
      `/bilhetes?data=2026-09-29&apostador=${PLAYER.id}&page=2`,
    );
    // O apostador escolhido aparece no campo.
    expect(screen.getByRole('button', { name: 'Apostador' })).toHaveTextContent('100002 - Ana Souza Lima');
  });

  it('pesquisa por ticket: os bilhetes do número (um por jogo), sem paginação', () => {
    show({ ticket: '10001' }, { result: { kind: 'ticket', items: [ticket(), ticket({ game: 'fazendinha' })] } });
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getByText(/Ticket:/)).toHaveTextContent('Ticket: 10001');
    expect(within(within(results).getByRole('table')).getAllByRole('row')).toHaveLength(3);
    expect(within(results).queryByRole('navigation', { name: 'Paginação' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Número do Ticket' })).toHaveValue('10001');
  });

  it('pule cancelada: etiqueta "Cancelada" e o valor riscado', () => {
    show(
      { ticket: '10001' },
      { result: { kind: 'ticket', items: [ticket({ canceledAt: '2026-09-30T12:10:00.000Z' }), ticket({ game: 'fazendinha' })] } },
    );
    const table = within(screen.getByRole('region', { name: 'Resultados' })).getByRole('table');
    const [, canceled, valid] = within(table).getAllByRole('row');
    expect(within(canceled!).getByText('Cancelada')).toHaveAttribute('title', 'Cancelada em 30/09/2026 09:10');
    expect(within(canceled!).getByText(/12,50/)).toHaveClass('line-through');
    expect(within(valid!).queryByText('Cancelada')).toBeNull();
  });

  it('sem bilhetes: os avisos', () => {
    const { unmount } = show(
      { data: '2026-09-30' },
      { result: { kind: 'list', page: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1, totalCents: 0 } } },
    );
    expect(screen.getByText('Nenhum resultado encontrado')).toBeInTheDocument();
    unmount();
    show({ ticket: '9' }, { result: { kind: 'ticket', items: [] } });
    expect(screen.getByText('Nenhum pule com esse número.')).toBeInTheDocument();
  });
});

describe('Apostador (busca no servidor)', () => {
  it('abre, busca a partir de 2 caracteres, escolhe e grava o id no formulário', async () => {
    searchPlayersAction.mockResolvedValue({ ok: true, data: [PLAYER] });
    const ui = userEvent.setup();
    show({});
    const button = screen.getByRole('button', { name: 'Apostador' });
    expect(button).toHaveTextContent('Todos');
    await ui.click(button);
    const search = screen.getByRole('searchbox', { name: 'Buscar apostador' });
    await ui.type(search, 'a');
    expect(screen.getByText('Digite ao menos 2 caracteres para buscar.')).toBeInTheDocument();
    await ui.type(search, 'na');
    await ui.click(await screen.findByRole('option', { name: '100002 - Ana Souza Lima' }));
    expect(searchPlayersAction).toHaveBeenLastCalledWith('ana');
    expect(screen.queryByRole('listbox')).toBeNull();
    const form = screen.getByRole<HTMLFormElement>('form', { name: 'Filtrar pules' });
    expect(form.querySelector<HTMLInputElement>('input[name="apostador"]')!.value).toBe(PLAYER.id);
  });

  it('"Todos" limpa a escolha; Esc fecha', async () => {
    const ui = userEvent.setup();
    show({ data: '2026-09-30', apostador: PLAYER.id }, { player: PLAYER });
    const button = screen.getByRole('button', { name: 'Apostador' });
    expect(button).toHaveTextContent('100002 - Ana Souza Lima');
    await ui.click(button);
    await ui.click(within(screen.getByRole('listbox', { name: 'Apostador' })).getByRole('option', { name: 'Todos' }));
    expect(button).toHaveTextContent('Todos');
    await ui.click(button);
    await ui.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('nenhum encontrado e falha da busca avisam; sessão encerrada leva ao login', async () => {
    const ui = userEvent.setup();
    show({});
    await ui.click(screen.getByRole('button', { name: 'Apostador' }));
    const search = screen.getByRole('searchbox', { name: 'Buscar apostador' });

    searchPlayersAction.mockResolvedValueOnce({ ok: true, data: [] });
    await ui.type(search, 'zz');
    expect(await screen.findByText('Nenhum apostador encontrado.')).toBeInTheDocument();

    searchPlayersAction.mockResolvedValueOnce({ ok: false, code: 'UNKNOWN', message: 'x' });
    await ui.type(search, 'z');
    expect(await screen.findByText('Não foi possível buscar. Tente novamente.')).toBeInTheDocument();

    searchPlayersAction.mockResolvedValueOnce({ ok: false, code: 'SESSION_INVALID', message: 'x' });
    await ui.type(search, 'z');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });
});
