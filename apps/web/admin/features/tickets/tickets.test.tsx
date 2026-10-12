import type { AdminTicketDetail, AdminTicketList, AdminTicketListItem } from '@sysjb/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTicketsQuery } from '@/lib/admin/tickets-query';
import type { TicketDetailState } from './components/ticket-detail-sheet';
import type { TicketsResult } from './index';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
const redirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/bilhetes',
  redirect: (href: string) => redirect(href),
  unauthorized: () => {
    throw new Error('unauthorized');
  },
}));

const searchPlayersAction = vi.fn();
vi.mock('@/app/admin/actions', () => ({
  searchPlayersAction: (...args: unknown[]) => searchPlayersAction(...args),
}));

const gate = { ok: true as const, session: { operator: { permissions: ['tickets.read'] } } };
vi.mock('@/lib/admin/admin-context', () => ({
  requireAdmin: async () => gate,
  can: (operator: { permissions: string[] }, permission: string) => operator.permissions.includes(permission),
}));
const api = {
  listTickets: vi.fn(),
  searchTicket: vi.fn(),
  getTicket: vi.fn(),
  ticketDrawOptions: vi.fn(),
  listPromoterOptions: vi.fn(),
  getUser: vi.fn(),
};
vi.mock('@/lib/admin/admin-api', () => ({ adminApi: api }));

const { Tickets, ticketsPdfHref } = await import('./index');
const { default: TicketsPage } = await import('@/app/admin/(panel)/bilhetes/page');

const NOW = '2026-10-09T15:00:00.000Z';
const TODAY = '2026-10-09';
const PLAYER = { id: '11111111-1111-4111-8111-111111111111', displayId: 1020, name: 'José Ávila' };
const PROMOTER = { id: '33333333-3333-4333-8333-333333333333', displayId: 7, name: 'Ana Promo' };
const DRAW = { id: '44444444-4444-4444-8444-444444444444', name: 'LT PT RIO', drawTime: '09:00' };

const item = (over: Partial<AdminTicketListItem> = {}): AdminTicketListItem => ({
  game: 'lotteries',
  puleNumber: 4512,
  createdAt: '2026-10-09T12:05:00.000Z',
  drawDate: '2026-10-09',
  lottery: 'LT PT RIO 09HS',
  drawCode: 'PTRIO09',
  totalCents: 1000,
  player: PLAYER,
  canceledAt: null,
  quoteTable: '800/1/8000',
  prizeCents: 800000,
  status: 'WON',
  ...over,
});

const ITEMS = [
  item(),
  item({
    game: 'fazendinha',
    puleNumber: 77,
    lottery: 'FAZENDINHA 14HS',
    drawCode: 'FZ14',
    quoteTable: null,
    prizeCents: 0,
    status: 'PENDING',
    player: { id: '22222222-2222-4222-8222-222222222222', displayId: 33, name: 'Maria Lima' },
  }),
  item({ puleNumber: 4513, canceledAt: '2026-10-09T12:10:00.000Z', prizeCents: 0, status: 'CANCELED' }),
  item({ puleNumber: 4514, prizeCents: 0, status: 'LOST' }),
];

const list = (over: Partial<AdminTicketList> = {}): AdminTicketList => ({
  items: ITEMS,
  page: 1,
  pageSize: 25,
  total: 4,
  totalPages: 1,
  totalCents: 3000,
  ...over,
});

const detailTicket = (over: Partial<AdminTicketDetail> = {}): AdminTicketDetail => ({
  ...item(),
  drawHour: 9,
  lotteryGame: 'tradicional',
  settledAt: '2026-10-09T12:40:00.000Z',
  expectedPrizeCents: 800000,
  correctedPrizeCents: null,
  result: { prizes: ['1234', '5678', '9012', '3456', '7890'], revision: 1, receivedAt: '2026-10-09T12:20:00.000Z' },
  items: [
    {
      position: 1,
      modality: 'milhar',
      modalityLabel: 'MILHAR',
      guesses: ['1234', '4321'],
      placement: 'p1',
      placementLabel: '1 PRÊMIO',
      stakeCents: 1000,
      quoteCents: 800000,
      possiblePrizeCents: 800000,
      prizeCents: 800000,
      status: 'WON',
    },
  ],
  ...over,
});

function renderTickets(
  raw: Record<string, string> = {},
  result: TicketsResult = { kind: 'list', page: list() },
  detail: TicketDetailState | null = null,
) {
  const query = parseTicketsQuery(raw, NOW);
  return render(
    <Tickets
      query={query}
      today={TODAY}
      promoters={[PROMOTER]}
      draws={[DRAW]}
      player={raw.apostador ? { id: PLAYER.id, displayId: PLAYER.displayId, name: PLAYER.name } : null}
      result={result}
      detail={detail}
    />,
  );
}

const table = () => screen.getByRole('table', { name: 'Pules registradas' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  gate.session.operator.permissions = ['tickets.read'];
});

describe('Pules Registradas: filtros', () => {
  it('mostra os filtros da URL e Pesquisar navega com eles, desde a primeira página', async () => {
    renderTickets({ data: '2026-10-08', extracao: DRAW.id, promotor: PROMOTER.id, page: '3', pageSize: '50' });
    const filters = screen.getByRole('form', { name: 'Filtros' });
    expect(within(filters).getByRole('button', { name: 'Data' })).toHaveTextContent('08/10/2026');
    expect(within(filters).getByRole('combobox', { name: 'Loterias' })).toHaveTextContent('LT PT RIO 09:00');
    expect(within(filters).getByRole('combobox', { name: 'Promotor' })).toHaveTextContent('7 · Ana Promo');
    expect(within(filters).getByRole('combobox', { name: 'Apostador' })).toHaveTextContent('Todos os apostadores');

    await userEvent.click(within(filters).getByRole('combobox', { name: 'Loterias' }));
    await userEvent.click(screen.getByRole('option', { name: 'Todas as loterias' }));
    await userEvent.click(within(filters).getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenCalledWith(`/bilhetes?data=2026-10-08&promotor=${PROMOTER.id}&pageSize=50`);
    expect(within(filters).getByRole('link', { name: 'Limpar' })).toHaveAttribute('href', '/bilhetes');
  });

  it('data: atalhos Hoje/Ontem e sem dias futuros', async () => {
    renderTickets();
    const filters = screen.getByRole('form', { name: 'Filtros' });
    const date = within(filters).getByRole('button', { name: 'Data' });
    expect(date).toHaveTextContent('09/10/2026');
    await userEvent.click(date);
    const shortcuts = screen.getByRole('group', { name: 'Atalhos de data' });
    expect(within(shortcuts).getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /10 de outubro/i })).toBeDisabled();
    await userEvent.click(within(shortcuts).getByRole('button', { name: 'Ontem' }));
    expect(date).toHaveTextContent('08/10/2026');
    await userEvent.click(within(filters).getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenCalledWith('/bilhetes?data=2026-10-08');
  });

  it('apostador: busca no servidor pelo nome ou ID e filtra pelo escolhido', async () => {
    searchPlayersAction.mockResolvedValue({ ok: true, data: [PLAYER] });
    renderTickets();
    const filters = screen.getByRole('form', { name: 'Filtros' });
    await userEvent.click(within(filters).getByRole('combobox', { name: 'Apostador' }));
    const input = screen.getByRole('combobox', { name: 'Buscar apostador' });
    await userEvent.type(input, 'j');
    expect(screen.getByText('Digite ao menos 2 caracteres para buscar.')).toBeInTheDocument();
    await userEvent.type(input, 'os');
    await userEvent.click(await screen.findByRole('option', { name: '1020 | José Ávila' }));
    expect(searchPlayersAction).toHaveBeenLastCalledWith('jos');
    expect(within(filters).getByRole('combobox', { name: 'Apostador' })).toHaveTextContent('1020 | José Ávila');
    await userEvent.click(within(filters).getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenCalledWith(`/bilhetes?data=2026-10-09&apostador=${PLAYER.id}`);
  });

  it('apostador: busca sem resultado e falha avisam no próprio campo', async () => {
    searchPlayersAction.mockResolvedValueOnce({ ok: true, data: [] });
    renderTickets({ apostador: PLAYER.id });
    const filters = screen.getByRole('form', { name: 'Filtros' });
    expect(within(filters).getByRole('combobox', { name: 'Apostador' })).toHaveTextContent('1020 | José Ávila');
    await userEvent.click(within(filters).getByRole('combobox', { name: 'Apostador' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar apostador' }), 'zzz');
    expect(await screen.findByText('Nenhum apostador encontrado.')).toBeInTheDocument();
    searchPlayersAction.mockResolvedValueOnce({ ok: false, code: 'INTERNAL', message: 'x' });
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar apostador' }), 'z');
    expect(await screen.findByText('Não foi possível buscar. Tente novamente.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Todos os apostadores' }));
    await userEvent.click(within(filters).getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenCalledWith('/bilhetes?data=2026-10-09');
  });
});

describe('Pules Registradas: tabela e resumo', () => {
  it('colunas, apostador "ID | NOME", Fazendinha, cotação vazia, cancelada riscada e status', () => {
    renderTickets();
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Pule #',
      'Data/Hora',
      'Apostador',
      'Loteria',
      'Data Valendo',
      'Cotação',
      'Valor',
      'Valor Prêmio',
      'Status',
    ]);
    const [won, fazendinha, canceled, lost] = bodyRows();
    expect(cells(won!)).toEqual([
      '#4512',
      '09/10/26 09:05',
      '1020 | José Ávila',
      'LT PT RIO 09HSPTRIO09',
      '09/10/2026',
      '800/1/8000',
      'R$ 10,00',
      'R$ 8.000,00',
      'Premiada',
    ]);
    expect(within(won!).getByRole('link', { name: /José Ávila/ })).toHaveAttribute('href', `/usuarios/${PLAYER.id}`);
    expect(within(won!).getByRole('link', { name: 'Ver a pule 4512' })).toHaveAttribute(
      'href',
      '/bilhetes?data=2026-10-09&pule=lotteries-4512',
    );
    expect(cells(fazendinha!)[0]).toBe('#77Fazendinha');
    expect(cells(fazendinha!)[5]).toBe('—');
    expect(within(fazendinha!).getByRole('link', { name: 'Ver a pule 77 da Fazendinha' })).toHaveAttribute(
      'href',
      '/bilhetes?data=2026-10-09&pule=fazendinha-77',
    );
    expect(within(won!).getByText('Premiada')).toHaveClass('bg-emerald-100');
    expect(within(fazendinha!).getByText('Aguardando apuração')).toHaveClass('bg-amber-100');
    expect(within(canceled!).getByText('Cancelada')).toHaveClass('bg-red-100');
    expect(within(lost!).getByText('Não premiada')).toHaveClass('text-muted-foreground');
    expect(within(canceled!).getByText('R$ 10,00')).toHaveClass('line-through');
    expect(within(won!).getByText('R$ 10,00')).not.toHaveClass('line-through');
  });

  it('resumo do filtro inteiro: data, quantidade e total vendido', () => {
    renderTickets({ data: '2026-10-08' }, { kind: 'list', page: list({ total: 40, totalCents: 123456 }) });
    const summary = screen.getByRole('region', { name: 'Resumo' });
    expect(summary).toHaveTextContent('Data08/10/2026');
    expect(summary).toHaveTextContent('Quantidade de pules40');
    expect(summary).toHaveTextContent('Total vendidoR$ 1.234,56');
  });

  it('pesquisa da página (pule, apostador, loteria) e atalho para buscar a pule em todas as datas', async () => {
    renderTickets();
    const search = screen.getByRole('searchbox', { name: 'Pesquisar nesta página' });
    await userEvent.type(search, 'maria');
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('#77');
    await userEvent.clear(search);
    await userEvent.type(search, 'fz14');
    expect(bodyRows()).toHaveLength(1);
    await userEvent.clear(search);
    await userEvent.type(search, '4513');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /em todas as datas/ })).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, '999');
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma pule desta página bate com a pesquisa.');
    expect(screen.getByRole('link', { name: 'Buscar a pule Nº 999 em todas as datas' })).toHaveAttribute(
      'href',
      '/bilhetes?ticket=999',
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('pesquisa por número: resultados sem paginação, resumo do número e volta à lista do dia', () => {
    renderTickets({ ticket: '77' }, { kind: 'ticket', items: [ITEMS[1]!, item({ puleNumber: 77, totalCents: 500 })] });
    expect(bodyRows()).toHaveLength(2);
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Resumo' });
    expect(summary).toHaveTextContent('Pule pesquisadaNº 77');
    expect(summary).toHaveTextContent('Quantidade de pules2');
    expect(summary).toHaveTextContent('Total vendidoR$ 15,00');
    expect(screen.getByRole('note', { name: 'Pesquisa por número' })).toHaveTextContent(
      'Busca pela pule Nº 77 — todas as datas',
    );
    expect(screen.getByRole('link', { name: 'Voltar à lista do dia' })).toHaveAttribute('href', '/bilhetes');
    // O filtro de data não finge um dia: mostra todas as datas.
    expect(screen.getByRole('button', { name: 'Data' })).toHaveTextContent('Todas as datas');
    expect(screen.getByRole('link', { name: 'Ver a pule 77 da Fazendinha' })).toHaveAttribute(
      'href',
      '/bilhetes?ticket=77&pule=fazendinha-77',
    );
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/bilhetes/pdf?ticket=77');
  });

  it('pesquisa por número: Pesquisar sem escolher dia volta à lista de hoje com os filtros', async () => {
    renderTickets({ ticket: '77' }, { kind: 'ticket', items: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenCalledWith('/bilhetes?data=2026-10-09');
  });

  it('sem resultados: textos da lista do dia e da pesquisa por número', () => {
    const { unmount } = renderTickets({}, { kind: 'list', page: list({ items: [], total: 0, totalCents: 0 }) });
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma pule vendida neste dia com esses filtros.');
    unmount();
    renderTickets({ ticket: '5' }, { kind: 'ticket', items: [] });
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma pule com esse número.');
  });

  it('Imprimir abre a impressão; PDF leva os filtros (sem paginação)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderTickets({ data: '2026-10-08', promotor: PROMOTER.id, page: '2', pageSize: '50' });
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledOnce();
    const pdf = screen.getByRole('link', { name: 'PDF' });
    expect(pdf).toHaveAttribute('href', `/bilhetes/pdf?data=2026-10-08&promotor=${PROMOTER.id}`);
    expect(pdf).toHaveAttribute('target', '_blank');
    expect(ticketsPdfHref(parseTicketsQuery({}, NOW))).toBe('/bilhetes/pdf?data=2026-10-09');
  });
});

describe('Pules Registradas: paginação', () => {
  it('links das páginas com os filtros e resultados por página (10/25/50/100) voltando à primeira', async () => {
    renderTickets(
      { data: TODAY, extracao: DRAW.id, page: '3' },
      { kind: 'list', page: list({ page: 3, totalPages: 8 }) },
    );
    const nav = screen.getByRole('navigation', { name: 'Paginação' });
    expect(within(nav).getAllByText('Página 3 de 8').length).toBeGreaterThan(0);
    expect(within(nav).getByRole('link', { name: 'Página anterior' })).toHaveAttribute(
      'href',
      `/bilhetes?data=2026-10-09&extracao=${DRAW.id}&page=2`,
    );
    expect(within(nav).getByRole('link', { name: 'Última página' })).toHaveAttribute(
      'href',
      `/bilhetes?data=2026-10-09&extracao=${DRAW.id}&page=8`,
    );
    await userEvent.click(within(nav).getByRole('combobox', { name: 'Resultados por página' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['10', '25', '50', '100']);
    await userEvent.click(screen.getByRole('option', { name: '10' }));
    expect(router.push).toHaveBeenCalledWith(`/bilhetes?data=2026-10-09&extracao=${DRAW.id}&pageSize=10`);
  });
});

describe('Pules Registradas: detalhe', () => {
  const opened = (ticket: AdminTicketDetail): TicketDetailState => ({
    key: `${ticket.game}-${ticket.puleNumber}`,
    status: 'ok',
    ticket,
  });

  it('pule da URL: cabeçalho, dados, resultado e apostas; fechar volta para a lista', async () => {
    renderTickets(
      { data: TODAY, page: '2' },
      { kind: 'list', page: list({ page: 2, totalPages: 3 }) },
      opened(detailTicket()),
    );
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: /Pule Nº 4512/ })).toHaveTextContent(
      'Pule Nº 4512LoteriasPremiada',
    );
    expect(sheet).toHaveTextContent('Apostador1020 | JOSÉ ÁVILA');
    expect(sheet).toHaveTextContent('Venda09/10/2026 09:05');
    expect(sheet).toHaveTextContent('Loteria / extraçãoLT PT RIO 09HS · PTRIO09');
    expect(sheet).toHaveTextContent('Data valendo09/10/2026 · 09h');
    expect(sheet).toHaveTextContent('Cotação800/1/8000');
    expect(sheet).toHaveTextContent('ValorR$ 10,00');
    expect(sheet).toHaveTextContent('Prêmio pagoR$ 8.000,00');
    expect(sheet).toHaveTextContent('Apurada em09/10/2026 09:40');
    expect(sheet).not.toHaveTextContent('Cancelada em');
    const result = within(sheet).getByRole('list', { name: 'Resultado do sorteio' });
    expect(
      within(result)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1º 1234', '2º 5678', '3º 9012', '4º 3456', '5º 7890']);
    const rows = within(within(sheet).getByRole('table', { name: 'Apostas da pule' })).getAllByRole('row');
    expect(cells(rows[1]!)).toEqual([
      '1',
      'MILHAR',
      '1234, 4321',
      '1 PRÊMIO',
      'R$ 10,00',
      'R$ 8.000,00R$ 8.000,00',
      'R$ 8.000,00',
      'Premiada',
    ]);
    expect(within(sheet).queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }));
    expect(router.push).toHaveBeenCalledWith('/bilhetes?data=2026-10-09&page=2', { scroll: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('aguardando apuração: prêmio esperado, sem resultado; cancelada e resultado corrigido avisam', () => {
    const { unmount } = renderTickets(
      {},
      undefined,
      opened(
        detailTicket({
          game: 'fazendinha',
          puleNumber: 77,
          status: 'PENDING',
          prizeCents: 0,
          quoteTable: null,
          expectedPrizeCents: 5000,
          settledAt: null,
          result: null,
          items: [
            {
              position: 1,
              modality: 'grupo',
              modalityLabel: 'GRUPO',
              guesses: ['05'],
              placement: 'p1',
              placementLabel: '1 PRÊMIO',
              stakeCents: 100,
              quoteCents: null,
              possiblePrizeCents: 5000,
              prizeCents: 5000,
              status: 'PENDING',
            },
          ],
        }),
      ),
    );
    let sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: /Pule Nº 77/ })).toHaveTextContent(
      'FazendinhaAguardando apuração',
    );
    expect(sheet).toHaveTextContent('Prêmio esperado (a pagar na apuração)R$ 50,00');
    expect(sheet).toHaveTextContent('Apurada emNão apurada');
    expect(sheet).toHaveTextContent('Resultado do sorteioSem resultado ainda');
    expect(sheet).toHaveTextContent('Cotação—');
    const rows = within(within(sheet).getByRole('table', { name: 'Apostas da pule' })).getAllByRole('row');
    expect(cells(rows[1]!)[5]).toBe('R$ 50,00');
    unmount();

    renderTickets(
      {},
      undefined,
      opened(
        detailTicket({
          status: 'CANCELED',
          canceledAt: '2026-10-09T12:10:00.000Z',
          prizeCents: 0,
          expectedPrizeCents: 0,
          correctedPrizeCents: 1200000,
        }),
      ),
    );
    sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('Cancelada em09/10/2026 09:10');
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Resultado corrigido depois do pagamento');
    expect(within(sheet).getByRole('alert')).toHaveTextContent('o prêmio seria R$ 12.000,00 (pago R$ 0,00)');
  });

  it('pule que não existe (ou de outra banca): "Pule não encontrada"; erro: a mensagem', () => {
    const { unmount } = renderTickets({}, undefined, { key: 'lotteries-999', status: 'not-found' });
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'Pule não encontrada' }),
    ).toBeInTheDocument();
    unmount();
    renderTickets({}, undefined, { key: 'lotteries-999', status: 'error', message: 'Serviço indisponível.' });
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Não foi possível carregar a pule' })).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Serviço indisponível.');
  });

  it('clicar no número abre a gaveta na hora (carregando) e muda a URL', async () => {
    renderTickets();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Ver a pule 4512' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Carregando pule…' })).toBeInTheDocument();
  });
});

describe('Pules Registradas: página do servidor', () => {
  const searchParams = (raw: Record<string, string>) => Promise.resolve(raw);
  const options = () => {
    api.listPromoterOptions.mockResolvedValue({ ok: true, data: [PROMOTER] });
    api.ticketDrawOptions.mockResolvedValue({ ok: true, data: [DRAW] });
  };

  it('sem tickets.read: 403 do template, sem consultar a API', async () => {
    gate.session.operator.permissions = ['users.read'];
    render(await TicketsPage({ searchParams: searchParams({}) }));
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByText('Sem permissão')).toBeInTheDocument();
    expect(api.listTickets).not.toHaveBeenCalled();
  });

  it('sem data na URL: as vendas de hoje, com as opções dos filtros', async () => {
    options();
    api.listTickets.mockResolvedValue({ ok: true, data: list() });
    render(await TicketsPage({ searchParams: searchParams({}) }));
    expect(screen.getByRole('heading', { name: 'Pules Registradas' })).toBeInTheDocument();
    expect(api.listTickets).toHaveBeenCalledWith(gate.session, expect.objectContaining({ date: TODAY, page: 1 }));
    expect(api.searchTicket).not.toHaveBeenCalled();
    expect(api.getTicket).not.toHaveBeenCalled();
    expect(bodyRows()).toHaveLength(4);
  });

  it('página além do fim leva à última', async () => {
    options();
    api.listTickets.mockResolvedValue({ ok: true, data: list({ page: 9, totalPages: 4 }) });
    await expect(TicketsPage({ searchParams: searchParams({ data: TODAY, page: '9' }) })).rejects.toThrow(
      'redirect:/bilhetes?data=2026-10-09&page=4',
    );
  });

  it('?ticket= pesquisa o número em todas as datas; ?pule= abre o detalhe (404 = não encontrada)', async () => {
    options();
    api.searchTicket.mockResolvedValue({ ok: true, data: [ITEMS[0]] });
    api.getTicket.mockResolvedValue({
      ok: false,
      status: 404,
      error: { statusCode: 404, code: 'NOT_FOUND', message: 'x' },
    });
    render(await TicketsPage({ searchParams: searchParams({ ticket: '4512', pule: 'fazendinha-4512' }) }));
    expect(api.searchTicket).toHaveBeenCalledWith(gate.session, 4512);
    expect(api.listTickets).not.toHaveBeenCalled();
    expect(api.getTicket).toHaveBeenCalledWith(gate.session, 'fazendinha', 4512);
    // A gaveta aberta (modal) esconde o resto da tela da árvore de acessibilidade.
    const hiddenTable = screen.getByRole('table', { name: 'Pules registradas', hidden: true });
    expect(within(hiddenTable).getAllByRole('row', { hidden: true })).toHaveLength(2);
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'Pule não encontrada' }),
    ).toBeInTheDocument();
  });

  it('?pule= inválido é ignorado; apostador da URL vem com o nome', async () => {
    options();
    api.listTickets.mockResolvedValue({ ok: true, data: list() });
    api.getUser.mockResolvedValue({ ok: true, data: { ...PLAYER, email: null } });
    render(await TicketsPage({ searchParams: searchParams({ apostador: PLAYER.id, pule: 'outro-1' }) }));
    expect(api.getTicket).not.toHaveBeenCalled();
    expect(api.getUser).toHaveBeenCalledWith(gate.session, PLAYER.id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Apostador' })).toHaveTextContent('1020 | José Ávila');
  });
});
