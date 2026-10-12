import type { AdminPrizeList, AdminPrizeListItem } from '@sysjb/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePrizesQuery } from '@/lib/admin/prizes-query';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };
const redirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/premios',
  redirect: (href: string) => redirect(href),
  unauthorized: () => {
    throw new Error('unauthorized');
  },
}));

const gate = { ok: true as const, session: { operator: { permissions: ['tickets.read'] } } };
vi.mock('@/lib/admin/admin-context', () => ({
  requireAdmin: async () => gate,
  can: (operator: { permissions: string[] }, permission: string) => operator.permissions.includes(permission),
}));
const api = { listPrizes: vi.fn(), listPromoterOptions: vi.fn() };
vi.mock('@/lib/admin/admin-api', () => ({ adminApi: api }));

const { Prizes, prizesPdfHref } = await import('./index');
const { default: PrizesPage } = await import('@/app/admin/(panel)/premios/page');

const NOW = '2026-10-09T15:00:00.000Z';
const TODAY = '2026-10-09';

const item = (over: Partial<AdminPrizeListItem> = {}): AdminPrizeListItem => ({
  id: crypto.randomUUID(),
  status: 'PAID',
  game: 'lotteries',
  puleNumber: 4512,
  drawDate: '2026-10-08',
  lottery: 'LT PT RIO 09HS',
  drawCode: 'PTRIO09',
  modality: 'milhar',
  modalityLabel: 'MILHAR',
  guess: '1234',
  placement: 'p1',
  placementLabel: '1 PRÊMIO',
  stakeCents: 200,
  prizeCents: 800000,
  settledAt: '2026-10-08T12:30:00.000Z',
  player: { id: '11111111-1111-4111-8111-111111111111', displayId: 1020, name: 'José Ávila' },
  ...over,
});

const ITEMS = [
  item(),
  item({
    status: 'PENDING',
    puleNumber: 77,
    lottery: 'FAZENDINHA 14HS',
    drawCode: 'FZ14',
    modalityLabel: null,
    guess: null,
    placementLabel: null,
    stakeCents: 100,
    prizeCents: 5000,
    settledAt: null,
    player: { id: '22222222-2222-4222-8222-222222222222', displayId: 33, name: 'Maria Lima' },
  }),
];

const list = (over: Partial<AdminPrizeList> = {}): AdminPrizeList => ({
  items: ITEMS,
  page: 1,
  pageSize: 25,
  total: 2,
  totalPages: 1,
  totalPrizeCents: 805000,
  pendingCount: 0,
  reviews: [],
  reviewsTotal: 0,
  ...over,
});

const PROMOTER = { id: '33333333-3333-4333-8333-333333333333', displayId: 7, name: 'Ana Promo' };

function renderPrizes(raw: Record<string, string> = {}, result: Partial<AdminPrizeList> = {}) {
  const query = parsePrizesQuery(raw, NOW);
  return render(<Prizes query={query} nowIso={NOW} today={TODAY} promoters={[PROMOTER]} result={list(result)} />);
}

const table = () => screen.getByRole('table', { name: 'Pules premiadas' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);

beforeEach(() => {
  vi.clearAllMocks();
  gate.session.operator.permissions = ['tickets.read'];
});

describe('Pules Premiadas: filtros', () => {
  it('mostra os filtros da URL e Pesquisar navega com eles, desde a primeira página', async () => {
    renderPrizes({ de: '2026-10-01', ate: '2026-10-08', status: 'aguardando', promotor: PROMOTER.id, page: '3' });
    const filters = screen.getByRole('form', { name: 'Filtros' });
    expect(within(filters).getByRole('button', { name: 'Período' })).toHaveTextContent('01/10/2026 a 08/10/2026');
    expect(within(filters).getByRole('combobox', { name: 'Promotor' })).toHaveTextContent('7 · Ana Promo');
    expect(within(filters).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Aguardando apuração');

    await userEvent.click(within(filters).getByRole('combobox', { name: 'Status' }));
    await userEvent.click(screen.getByRole('option', { name: 'Pagos' }));
    await userEvent.click(within(filters).getByRole('combobox', { name: 'Promotor' }));
    await userEvent.click(screen.getByRole('option', { name: 'Todos os promotores' }));
    await userEvent.click(within(filters).getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenCalledWith('/premios?de=2026-10-01&ate=2026-10-08&status=pagos');
    expect(within(filters).getByRole('link', { name: 'Limpar' })).toHaveAttribute('href', '/premios');
  });

  it('atalhos de período (Hoje, Ontem, 7D, Mês...) preenchem o intervalo', async () => {
    renderPrizes();
    const filters = screen.getByRole('form', { name: 'Filtros' });
    const period = within(filters).getByRole('button', { name: 'Período' });
    expect(period).toHaveTextContent('09/10/2026');

    await userEvent.click(period);
    // O mês do fim (hoje) fica à direita: setembro e outubro, não outubro e novembro.
    expect(screen.getAllByRole('grid').map((g) => g.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/setembro/i),
      expect.stringMatching(/outubro/i),
    ]);
    const presets = screen.getByRole('group', { name: 'Atalhos de período' });
    expect(within(presets).getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(presets)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Ontem', 'Hoje', '7D', '30D', 'Mês', 'Mês Ant.']);
    await userEvent.click(within(presets).getByRole('button', { name: '7D' }));
    expect(period).toHaveTextContent('03/10/2026 a 09/10/2026');
    await userEvent.click(within(filters).getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenCalledWith('/premios?de=2026-10-03&ate=2026-10-09');

    await userEvent.click(period);
    await userEvent.click(screen.getByRole('button', { name: 'Mês Ant.' }));
    await userEvent.click(within(filters).getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenLastCalledWith('/premios?de=2026-09-01&ate=2026-09-30');
  });

  it('mantém o tamanho da página ao pesquisar', async () => {
    renderPrizes({ de: TODAY, ate: TODAY, pageSize: '100' });
    await userEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    expect(router.push).toHaveBeenCalledWith('/premios?de=2026-10-09&ate=2026-10-09&pageSize=100');
  });
});

describe('Pules Premiadas: tabela e resumo', () => {
  it('linhas com as colunas da tela, status e "—" nos campos de registro antigo', () => {
    renderPrizes();
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Data',
      'Apostador',
      'Pule',
      'Loteria',
      'Modalidade',
      'Número',
      'Colocação',
      'Valor',
      'Valor Prêmio',
      'Status',
    ]);
    const [paid, pending] = bodyRows();
    const cells = (row: HTMLElement) =>
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent);
    expect(cells(paid!)).toEqual([
      '08/10/2026',
      '1020 · José Ávila',
      '#4512',
      'LT PT RIO 09HSPTRIO09',
      'MILHAR',
      '1234',
      '1 PRÊMIO',
      'R$ 2,00',
      'R$ 8.000,00',
      'Pago',
    ]);
    expect(within(paid!).getByRole('link', { name: /José Ávila/ })).toHaveAttribute(
      'href',
      '/usuarios/11111111-1111-4111-8111-111111111111',
    );
    expect(cells(pending!).slice(4, 7)).toEqual(['—', '—', '—']);
    expect(within(pending!).getByText('Aguardando apuração')).toHaveClass('bg-amber-100');
    expect(within(paid!).getByText('Pago')).toHaveClass('bg-emerald-100');
  });

  it('resumo do filtro inteiro; sem pendentes nem corrigidos, sem avisos', () => {
    renderPrizes({ de: '2026-10-01', ate: '2026-10-08' }, { total: 40 });
    const summary = screen.getByRole('region', { name: 'Resumo' });
    expect(summary).toHaveTextContent('Período01/10/2026 a 08/10/2026');
    expect(summary).toHaveTextContent('Quantidade de prêmios40');
    expect(summary).toHaveTextContent('Total em prêmiosR$ 8.050,00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa as pules aguardando apuração e os resultados corrigidos depois do pagamento', () => {
    renderPrizes(
      {},
      {
        pendingCount: 3,
        reviewsTotal: 250,
        reviews: [
          {
            game: 'fazendinha',
            puleNumber: 90,
            drawDate: '2026-10-07',
            lottery: 'FAZENDINHA 14HS',
            drawCode: 'FZ14',
            paidCents: 10000,
            correctedCents: 0,
            settledAt: '2026-10-07T18:00:00.000Z',
            checkedAt: '2026-10-07T20:00:00.000Z',
            player: { id: '22222222-2222-4222-8222-222222222222', displayId: 33, name: 'Maria Lima' },
          },
        ],
      },
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveTextContent('3 pules aguardando apuração');
    expect(alerts[1]).toHaveTextContent('Resultado corrigido depois do pagamento (250)');
    expect(alerts[1]).toHaveTextContent('Mostrando as 1 mais recentes.');
    const review = within(alerts[1]!).getByRole('listitem');
    expect(review).toHaveTextContent('#90 · Fazendinha · FAZENDINHA 14HS · jogo 07/10/2026');
    expect(review).toHaveTextContent('Pago R$ 100,00 · corrigido R$ 0,00 · −R$ 100,00');
  });

  it('Pesquisar filtra só as linhas da página (pule, apostador, loteria, número)', async () => {
    renderPrizes();
    const search = screen.getByRole('searchbox', { name: 'Pesquisar nesta página' });
    expect(search).toHaveAttribute('placeholder', expect.stringMatching(/pule, apostador, loteria ou número/));
    await userEvent.type(search, 'maria');
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('#77');
    await userEvent.clear(search);
    await userEvent.type(search, 'ptrio09');
    expect(bodyRows()[0]).toHaveTextContent('#4512');
    await userEvent.clear(search);
    await userEvent.type(search, '1234');
    expect(bodyRows()).toHaveLength(1);
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma pule desta página bate com a pesquisa.');
    expect(bodyRows()).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('sem resultados: o texto depende da situação filtrada', () => {
    const { unmount } = renderPrizes({}, { items: [], total: 0 });
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma pule premiada no período.');
    unmount();
    const paid = renderPrizes({ status: 'pagos' }, { items: [], total: 0 });
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma pule premiada paga no período.');
    paid.unmount();
    renderPrizes({ status: 'aguardando' }, { items: [], total: 0, pendingCount: 8 });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nenhuma pule premiada aguardando apuração. As pules aguardando apuração que não tiveram prêmio não aparecem aqui.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('8 pules aguardando apuração');
    expect(screen.getByRole('alert')).toHaveTextContent('com ou sem prêmio');
  });

  it('Imprimir abre a impressão; PDF leva os filtros (sem paginação)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPrizes({ de: '2026-10-01', ate: '2026-10-08', status: 'pagos', page: '2', pageSize: '50' });
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledOnce();
    const pdf = screen.getByRole('link', { name: 'PDF' });
    expect(pdf).toHaveAttribute('href', '/premios/pdf?de=2026-10-01&ate=2026-10-08&status=pagos');
    expect(pdf).toHaveAttribute('target', '_blank');
    expect(prizesPdfHref(parsePrizesQuery({ promotor: PROMOTER.id }, NOW))).toBe(
      `/premios/pdf?de=2026-10-09&ate=2026-10-09&promotor=${PROMOTER.id}`,
    );
  });
});

describe('Pules Premiadas: paginação', () => {
  it('links das páginas com os filtros; anterior/primeira desabilitadas na primeira', () => {
    renderPrizes({ de: TODAY, ate: TODAY, status: 'pagos' }, { page: 1, totalPages: 8, total: 200 });
    const nav = screen.getByRole('navigation', { name: 'Paginação' });
    expect(within(nav).getAllByText('Página 1 de 8').length).toBeGreaterThan(0);
    expect(within(nav).getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(within(nav).getByRole('button', { name: 'Primeira página' })).toBeDisabled();
    expect(within(nav).getByRole('link', { name: 'Ir para a página 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Próxima página' })).toHaveAttribute(
      'href',
      '/premios?de=2026-10-09&ate=2026-10-09&status=pagos&page=2',
    );
    expect(within(nav).getByRole('link', { name: 'Última página' })).toHaveAttribute(
      'href',
      '/premios?de=2026-10-09&ate=2026-10-09&status=pagos&page=8',
    );
  });

  it('linhas por página (25/50/100) volta à primeira página', async () => {
    renderPrizes({ de: TODAY, ate: TODAY, page: '3' }, { page: 3, totalPages: 8 });
    const nav = screen.getByRole('navigation', { name: 'Paginação' });
    expect(within(nav).getByRole('link', { name: 'Página anterior' })).toHaveAttribute(
      'href',
      '/premios?de=2026-10-09&ate=2026-10-09&page=2',
    );
    await userEvent.click(within(nav).getByRole('combobox', { name: 'Resultados por página' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['25', '50', '100']);
    await userEvent.click(screen.getByRole('option', { name: '100' }));
    expect(router.push).toHaveBeenCalledWith('/premios?de=2026-10-09&ate=2026-10-09&pageSize=100');
  });
});

describe('Pules Premiadas: página do servidor', () => {
  const searchParams = (raw: Record<string, string>) => Promise.resolve(raw);

  it('sem tickets.read: 403 do template, sem consultar a API', async () => {
    gate.session.operator.permissions = ['users.read'];
    render(await PrizesPage({ searchParams: searchParams({}) }));
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByText('Sem permissão')).toBeInTheDocument();
    expect(api.listPrizes).not.toHaveBeenCalled();
  });

  it('página além do fim leva à última', async () => {
    api.listPromoterOptions.mockResolvedValue({ ok: true, data: [] });
    api.listPrizes.mockResolvedValue({ ok: true, data: list({ page: 9, totalPages: 4 }) });
    await expect(PrizesPage({ searchParams: searchParams({ de: TODAY, ate: TODAY, page: '9' }) })).rejects.toThrow(
      'redirect:/premios?de=2026-10-09&ate=2026-10-09&page=4',
    );
  });

  it('carrega a lista e as opções de promotor', async () => {
    api.listPromoterOptions.mockResolvedValue({ ok: true, data: [PROMOTER] });
    api.listPrizes.mockResolvedValue({ ok: true, data: list() });
    render(await PrizesPage({ searchParams: searchParams({}) }));
    expect(screen.getByRole('heading', { name: 'Pules Premiadas' })).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(2);
  });
});
