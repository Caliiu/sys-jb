import type {
  AdminGiftMilharSettings,
  AdminQuoteTableSummary,
  AdminUserDetail,
  AdminUserListItem,
  Page,
} from '@sysjb/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseUnitsQuery } from '@/lib/admin/units';
import type { GiftMilharState } from './components/gift-milhar-card';
import type { UnitDetailState } from './components/unit-settings-sheet';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
const redirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/unidades',
  redirect: (href: string) => redirect(href),
  unauthorized: () => {
    throw new Error('unauthorized');
  },
}));

const updateUnitSettingsAction = vi.fn();
const saveGiftMilharSettingsAction = vi.fn();
vi.mock('@/app/admin/actions', () => ({
  updateUnitSettingsAction: (...args: unknown[]) => updateUnitSettingsAction(...args),
  saveGiftMilharSettingsAction: (...args: unknown[]) => saveGiftMilharSettingsAction(...args),
}));

const gate = { ok: true as const, session: { operator: { permissions: [] as string[] } } };
vi.mock('@/lib/admin/admin-context', () => ({
  requireAdmin: async () => gate,
  can: (operator: { permissions: string[] }, permission: string) => operator.permissions.includes(permission),
}));
const api = {
  listUsers: vi.fn(),
  getUser: vi.fn(),
  listQuoteTables: vi.fn(),
  getGiftMilharSettings: vi.fn(),
};
vi.mock('@/lib/admin/admin-api', () => ({ adminApi: api }));

const { Units } = await import('./index');
const { default: UnitsPage } = await import('@/app/admin/(panel)/unidades/page');

const UNIT_ID = '11111111-1111-4111-8111-111111111111';
const TABLE_ID = '55555555-5555-4555-8555-555555555555';
const DEFAULT_TABLE_ID = '66666666-6666-4666-8666-666666666666';

const unitItem = (over: Partial<AdminUserListItem> = {}): AdminUserListItem => ({
  id: UNIT_ID,
  displayId: 1020,
  name: 'José Ávila',
  document: '12345678909',
  phone: '21999990000',
  status: 'ACTIVE',
  createdAt: '2026-01-10T12:00:00.000Z',
  referredBy: null,
  promoter: null,
  region: 'RJ',
  unitCommissionBps: 1250,
  quoteTable: { id: TABLE_ID, name: 'Tabela VIP', label: '900/1/9000', isDefault: false, own: true },
  giftMilharEnabled: true,
  retainPrizes: false,
  dailyLimitEnabled: true,
  dailyLimitCents: 50000,
  ...over,
});

const ITEMS = [
  unitItem(),
  unitItem({
    id: '22222222-2222-4222-8222-222222222222',
    displayId: 33,
    name: 'Maria Lima',
    region: null,
    unitCommissionBps: 0,
    quoteTable: { id: DEFAULT_TABLE_ID, name: 'Padrão', label: '800/1/8000', isDefault: true, own: false },
    giftMilharEnabled: false,
    retainPrizes: true,
    dailyLimitEnabled: false,
    dailyLimitCents: 20000,
  }),
];

const page = (over: Partial<Page<AdminUserListItem>> = {}): Page<AdminUserListItem> => ({
  items: ITEMS,
  page: 1,
  pageSize: 25,
  total: 2,
  totalPages: 1,
  ...over,
});

const detailUnit = (over: Partial<AdminUserDetail> = {}): AdminUserDetail =>
  ({
    ...unitItem(),
    email: null,
    birthDate: '1990-01-01',
    inviteCode: 'ABC123',
    lastLoginAt: null,
    wallet: { balanceCents: 0, bonusCents: 0, prizeCents: 0 },
    promoterCommissionBps: null,
    casinoCommissionBps: 0,
    todaySpentCents: 12345,
    ...over,
  }) as AdminUserDetail;

const TABLES: AdminQuoteTableSummary[] = [
  { id: DEFAULT_TABLE_ID, name: 'Padrão', isDefault: true, usersCount: 10, updatedAt: '2026-01-01T00:00:00.000Z' },
  { id: TABLE_ID, name: 'Tabela VIP', isDefault: false, usersCount: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
];

const GIFT: AdminGiftMilharSettings = { enabled: true, minPuleCents: 1000, stakeCents: 10, placement: 'p1' };

const opened = (unit: AdminUserDetail): UnitDetailState => ({ id: unit.id, status: 'ok', unit });

function renderUnits({
  raw = {},
  detail = null,
  giftMilhar = { status: 'ok', settings: GIFT },
  manageUnits = true,
  manageQuotes = true,
  quoteTables = TABLES,
}: {
  raw?: Record<string, string>;
  detail?: UnitDetailState | null;
  giftMilhar?: GiftMilharState | null;
  manageUnits?: boolean;
  manageQuotes?: boolean;
  quoteTables?: AdminQuoteTableSummary[] | null;
} = {}) {
  return render(
    <Units
      query={parseUnitsQuery(raw)}
      result={page()}
      detail={detail}
      quoteTables={quoteTables}
      giftMilhar={giftMilhar}
      permissions={{ manageUnits, manageQuotes }}
    />,
  );
}

const table = () => screen.getByRole('table', { name: 'Unidades' });
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((c) => c.textContent);
const giftCard = () => screen.getByText('Milhar Brinde da banca').closest('[data-slot="card"]') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  gate.session.operator.permissions = [];
});

describe('Unidades: lista', () => {
  it('colunas: unidade, região, comissão, tabela, brinde, reter prêmios e limite diário', () => {
    renderUnits();
    expect(
      within(table())
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Unidade',
      'Região',
      'Comissão',
      'Tabela de cotação',
      'Milhar Brinde',
      'Reter prêmios',
      'Limite diário',
    ]);
    const [first, second] = within(table()).getAllByRole('row').slice(1);
    expect(cells(first!)).toEqual([
      '1020 | José Ávila',
      'RJ',
      '12,5%',
      'Tabela VIP900/1/9000',
      'Ligado',
      'Não',
      'R$ 500,00',
    ]);
    expect(cells(second!)).toEqual([
      '33 | Maria Lima',
      '—',
      '0%',
      'PadrãoPadrão da banca · 800/1/8000',
      'Desligado',
      'Sim',
      'Sem limite',
    ]);
  });

  it('busca navega para a primeira página; o nome abre a gaveta e muda a URL', async () => {
    renderUnits({ raw: { page: '2', pageSize: '50' } });
    const search = screen.getByRole('searchbox', { name: 'Nome, CPF, telefone ou número' });
    await userEvent.type(search, ' maria ');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(router.push).toHaveBeenCalledWith('/unidades?search=maria&pageSize=50');

    const link = screen.getByRole('link', { name: 'Configurar a unidade 1020 José Ávila' });
    expect(link).toHaveAttribute('href', `/unidades?pageSize=50&page=2&unidade=${UNIT_ID}`);
    await userEvent.click(link);
    expect(within(screen.getByRole('dialog')).getByText('Carregando unidade…')).toBeInTheDocument();
  });
});

describe('Unidades: configurações da unidade', () => {
  it('mostra o apostado hoje e o limite; salva só o que mudou', async () => {
    updateUnitSettingsAction.mockResolvedValue({
      ok: true,
      data: detailUnit({ unitCommissionBps: 1000, giftMilharEnabled: false }),
    });
    renderUnits({ detail: opened(detailUnit()) });
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: '1020 | JOSÉ ÁVILA' })).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Apostado hojeR$ 123,45');
    expect(sheet).toHaveTextContent('Limite diárioR$ 500,00');

    const save = within(sheet).getByRole('button', { name: 'Salvar alterações' });
    expect(save).toBeDisabled();

    const commission = within(sheet).getByLabelText('Comissão da unidade (%)');
    expect(commission).toHaveValue('12,5');
    await userEvent.clear(commission);
    await userEvent.type(commission, '10');
    await userEvent.click(within(sheet).getByRole('switch', { name: 'Milhar Brinde' }));
    await userEvent.click(save);

    expect(updateUnitSettingsAction).toHaveBeenCalledExactlyOnceWith(UNIT_ID, {
      unitCommissionBps: 1000,
      giftMilharEnabled: false,
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(within(sheet).getByRole('switch', { name: 'Milhar Brinde' })).not.toBeChecked();
    expect(await within(sheet).findByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  });

  it('limite diário: ligar exige valor; o valor vai em centavos', async () => {
    updateUnitSettingsAction.mockResolvedValue({ ok: true, data: detailUnit() });
    renderUnits({ detail: opened(detailUnit({ dailyLimitEnabled: false, dailyLimitCents: null })) });
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('Limite diárioSem limite');
    expect(within(sheet).queryByLabelText('Valor do limite diário')).not.toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole('switch', { name: 'Limite diário de apostas' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar alterações' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Informe o limite diário para ligá-lo.');
    expect(updateUnitSettingsAction).not.toHaveBeenCalled();

    await userEvent.type(within(sheet).getByLabelText('Valor do limite diário'), '25000');
    expect(within(sheet).getByLabelText('Valor do limite diário')).toHaveValue('250,00');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar alterações' }));
    expect(updateUnitSettingsAction).toHaveBeenCalledExactlyOnceWith(UNIT_ID, {
      dailyLimitEnabled: true,
      dailyLimitCents: 25000,
    });
  });

  it('comissão inválida avisa no campo; erros da API aparecem nos campos e na mensagem', async () => {
    updateUnitSettingsAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { retainPrizes: 'Não dá para reter agora.' },
    });
    renderUnits({ detail: opened(detailUnit()) });
    const sheet = screen.getByRole('dialog');
    const commission = within(sheet).getByLabelText('Comissão da unidade (%)');
    await userEvent.clear(commission);
    await userEvent.type(commission, '150');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar alterações' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Entre 0% e 100%');
    expect(commission).toHaveAttribute('aria-invalid', 'true');
    expect(updateUnitSettingsAction).not.toHaveBeenCalled();

    await userEvent.clear(commission);
    await userEvent.type(commission, '12,5');
    await userEvent.click(within(sheet).getByRole('switch', { name: 'Reter prêmios' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar alterações' }));
    expect(updateUnitSettingsAction).toHaveBeenCalledExactlyOnceWith(UNIT_ID, { retainPrizes: true });
    expect(sheet).toHaveTextContent('Não dá para reter agora.');
    expect(sheet).toHaveTextContent('Corrija os campos destacados.');
  });

  it('sem units.manage: somente consulta (campos desabilitados, sem salvar)', () => {
    renderUnits({ detail: opened(detailUnit()), manageUnits: false });
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('Somente consulta');
    expect(within(sheet).getByLabelText('Comissão da unidade (%)')).toBeDisabled();
    expect(within(sheet).getByRole('switch', { name: 'Milhar Brinde' })).toBeDisabled();
    expect(within(sheet).getByRole('combobox', { name: 'Região (UF)' })).toBeDisabled();
    expect(within(sheet).getByRole('combobox', { name: 'Tabela de cotação' })).toHaveTextContent('Tabela VIP');
    expect(within(sheet).queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
  });

  it('unidade sem tabela própria mostra a padrão da banca; não encontrada e erro avisam', () => {
    const { unmount } = renderUnits({
      detail: opened(
        detailUnit({
          quoteTable: { id: DEFAULT_TABLE_ID, name: 'Padrão', label: '800/1/8000', isDefault: true, own: false },
        }),
      ),
    });
    expect(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Tabela de cotação' })).toHaveTextContent(
      'Padrão da banca (Padrão)',
    );
    unmount();
    const other = renderUnits({ detail: { id: UNIT_ID, status: 'not-found' } });
    expect(screen.getByRole('heading', { name: 'Unidade não encontrada' })).toBeInTheDocument();
    other.unmount();
    renderUnits({ detail: { id: UNIT_ID, status: 'error', message: 'Serviço indisponível.' } });
    expect(screen.getByRole('dialog')).toHaveTextContent('Serviço indisponível.');
  });

  it('fechar a gaveta volta para a lista com os filtros', async () => {
    renderUnits({ raw: { search: 'jose' }, detail: opened(detailUnit()) });
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar' }));
    expect(router.push).toHaveBeenCalledWith('/unidades?search=jose', { scroll: false });
  });
});

describe('Unidades: Milhar Brinde da banca', () => {
  it('explica que vale só com a banca e a unidade ligadas; salva a configuração inteira', async () => {
    saveGiftMilharSettingsAction.mockResolvedValue({ ok: true, data: { ...GIFT, stakeCents: 50, enabled: false } });
    renderUnits();
    const card = giftCard();
    expect(card).toHaveTextContent('aqui na banca e na unidade');
    expect(within(card).getByLabelText('Mínimo do pule')).toHaveValue('10,00');
    expect(within(card).getByLabelText('Valor do brinde')).toHaveValue('0,10');
    expect(within(card).getByRole('combobox', { name: 'Colocação' })).toHaveTextContent('1 PRÊMIO');
    const save = within(card).getByRole('button', { name: 'Salvar Milhar Brinde' });
    expect(save).toBeDisabled();

    await userEvent.click(within(card).getByRole('switch', { name: 'Brinde na banca' }));
    await userEvent.type(within(card).getByLabelText('Valor do brinde'), '0');
    expect(within(card).getByLabelText('Valor do brinde')).toHaveValue('1,00');
    await userEvent.click(save);
    expect(saveGiftMilharSettingsAction).toHaveBeenCalledExactlyOnceWith({
      enabled: false,
      minPuleCents: 1000,
      stakeCents: 100,
      placement: 'p1',
    });
    expect(within(card).getByLabelText('Valor do brinde')).toHaveValue('0,50');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('valor fora do limite avisa na tela; erro da API aparece no campo', async () => {
    saveGiftMilharSettingsAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { minPuleCents: 'Mínimo muito alto.' },
    });
    renderUnits();
    const card = giftCard();
    const stake = within(card).getByLabelText('Valor do brinde');
    await userEvent.clear(stake);
    await userEvent.click(within(card).getByRole('button', { name: 'Salvar Milhar Brinde' }));
    expect(within(card).getByRole('alert')).toHaveTextContent('Entre R$ 0,01 e R$ 100,00.');
    expect(saveGiftMilharSettingsAction).not.toHaveBeenCalled();

    await userEvent.type(stake, '25');
    await userEvent.click(within(card).getByRole('button', { name: 'Salvar Milhar Brinde' }));
    expect(card).toHaveTextContent('Mínimo muito alto.');
    expect(card).toHaveTextContent('Corrija os campos destacados.');
  });

  it('só quotes.read: somente consulta; sem permissão de cotação, o card some', () => {
    const { unmount } = renderUnits({ manageQuotes: false });
    const card = giftCard();
    expect(within(card).getByRole('switch', { name: 'Brinde na banca' })).toBeDisabled();
    expect(within(card).getByLabelText('Mínimo do pule')).toBeDisabled();
    expect(within(card).queryByRole('button', { name: 'Salvar Milhar Brinde' })).not.toBeInTheDocument();
    expect(card).toHaveTextContent('Somente consulta');
    unmount();
    renderUnits({ giftMilhar: null });
    expect(screen.queryByText('Milhar Brinde da banca')).not.toBeInTheDocument();
  });
});

describe('Unidades: página (servidor)', () => {
  const ok = <T,>(data: T) => ({ ok: true as const, status: 200, data });

  it('sem users.read: 403, sem consultar a API', async () => {
    render(await UnitsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(api.listUsers).not.toHaveBeenCalled();
  });

  it('Gerente: lista, tabelas, Milhar Brinde e a unidade da URL', async () => {
    gate.session.operator.permissions = ['users.read', 'units.manage', 'quotes.read', 'quotes.manage'];
    api.listUsers.mockResolvedValue(ok(page()));
    api.getUser.mockResolvedValue(ok(detailUnit()));
    api.listQuoteTables.mockResolvedValue(ok(TABLES));
    api.getGiftMilharSettings.mockResolvedValue(ok(GIFT));
    render(await UnitsPage({ searchParams: Promise.resolve({ search: 'jo', unidade: UNIT_ID.toUpperCase() }) }));
    expect(api.listUsers).toHaveBeenCalledWith(gate.session, {
      page: 1,
      pageSize: 25,
      search: 'jo',
      status: '',
      promoterId: '',
    });
    expect(api.getUser).toHaveBeenCalledWith(gate.session, UNIT_ID);
    expect(screen.getByText('Milhar Brinde da banca')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
  });

  it('só users.read: sem o card do brinde nem as tabelas; gaveta somente consulta', async () => {
    gate.session.operator.permissions = ['users.read'];
    api.listUsers.mockResolvedValue(ok(page()));
    api.getUser.mockResolvedValue(ok(detailUnit()));
    render(await UnitsPage({ searchParams: Promise.resolve({ unidade: UNIT_ID }) }));
    expect(api.listQuoteTables).not.toHaveBeenCalled();
    expect(api.getGiftMilharSettings).not.toHaveBeenCalled();
    expect(screen.queryByText('Milhar Brinde da banca')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Somente consulta');
  });

  it('página além do fim leva à última; falha da lista mostra o aviso', async () => {
    gate.session.operator.permissions = ['users.read'];
    api.listUsers.mockResolvedValue(ok(page({ page: 5, totalPages: 2 })));
    await expect(UnitsPage({ searchParams: Promise.resolve({ page: '5' }) })).rejects.toThrow(
      'redirect:/unidades?page=2',
    );
    api.listUsers.mockResolvedValue({
      ok: false,
      status: 503,
      error: { code: 'UNAUTHORIZED', message: 'x' },
    });
    render(await UnitsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Não foi possível carregar as unidades')).toBeInTheDocument();
  });
});
