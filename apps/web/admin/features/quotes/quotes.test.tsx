import { type AdminQuoteTable, type AdminQuoteTableSummary, defaultQuotes } from '@sysjb/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filterQuoteRows, quoteRows, quoteValuesDiff, remapQuoteFieldErrors } from '@/lib/admin/quotes';
import type { QuoteTableState } from './index';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/cotacoes',
  unauthorized: () => {
    throw new Error('unauthorized');
  },
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast }));

const actions = {
  createQuoteTableAction: vi.fn(),
  renameQuoteTableAction: vi.fn(),
  setDefaultQuoteTableAction: vi.fn(),
  deleteQuoteTableAction: vi.fn(),
  saveQuoteValuesAction: vi.fn(),
};
vi.mock('@/app/admin/actions', () => ({
  createQuoteTableAction: (...args: unknown[]) => actions.createQuoteTableAction(...args),
  renameQuoteTableAction: (...args: unknown[]) => actions.renameQuoteTableAction(...args),
  setDefaultQuoteTableAction: (...args: unknown[]) => actions.setDefaultQuoteTableAction(...args),
  deleteQuoteTableAction: (...args: unknown[]) => actions.deleteQuoteTableAction(...args),
  saveQuoteValuesAction: (...args: unknown[]) => actions.saveQuoteValuesAction(...args),
}));

const gate = { ok: true as const, session: { operator: { permissions: [] as string[] } } };
vi.mock('@/lib/admin/admin-context', () => ({
  requireAdmin: async () => gate,
  can: (operator: { permissions: string[] }, permission: string) => operator.permissions.includes(permission),
}));
const api = { listQuoteTables: vi.fn(), getQuoteTable: vi.fn() };
vi.mock('@/lib/admin/admin-api', () => ({ adminApi: api }));

const { Quotes } = await import('./index');
const { default: QuotesPage } = await import('@/app/admin/(panel)/cotacoes/page');

const DEFAULT_ID = '66666666-6666-4666-8666-666666666666';
const VIP_ID = '55555555-5555-4555-8555-555555555555';

const TABLES: AdminQuoteTableSummary[] = [
  { id: DEFAULT_ID, name: 'Padrão', isDefault: true, usersCount: 10, updatedAt: '2026-01-01T15:00:00.000Z' },
  { id: VIP_ID, name: 'Tabela VIP', isDefault: false, usersCount: 0, updatedAt: '2026-01-02T15:00:00.000Z' },
];

const quoteTable = (summary: AdminQuoteTableSummary, over: Partial<AdminQuoteTable> = {}): AdminQuoteTable => ({
  ...summary,
  ...defaultQuotes(),
  ...over,
});

const ok = (table: AdminQuoteTable): QuoteTableState => ({ status: 'ok', table });

function renderQuotes({
  selectedId = VIP_ID,
  detail = ok(quoteTable(TABLES[1]!)),
  canManage = true,
  requestedMissing = false,
}: {
  selectedId?: string | null;
  detail?: QuoteTableState | null;
  canManage?: boolean;
  requestedMissing?: boolean;
} = {}) {
  return render(
    <Quotes
      tables={TABLES}
      selectedId={selectedId}
      detail={detail}
      requestedMissing={requestedMissing}
      canManage={canManage}
    />,
  );
}

const valuesTable = () => screen.getByRole('table', { name: /Tabela de pagamento/ });
const rowOf = (code: string) =>
  within(valuesTable())
    .getAllByRole('row')
    .find((row) => within(row).queryAllByRole('cell')[0]?.textContent === code)!;

beforeEach(() => {
  vi.clearAllMocks();
  gate.session.operator.permissions = [];
});

describe('Cotações: linhas da tabela (helpers)', () => {
  const rows = quoteRows(defaultQuotes());

  it('Tradicional na ordem da API, depois a Fazendinha por modalidade e valor, com código e descrição', () => {
    expect(rows.slice(0, 5).map((r) => [r.code, r.description])).toEqual([
      ['U', 'UNIDADE'],
      ['G', 'GRUPO'],
      ['D', 'DEZENA'],
      ['C', 'CENTENA'],
      ['M', 'MILHAR'],
    ]);
    const firstFaz = rows.find((r) => r.game === 'fazendinha')!;
    expect(firstFaz).toMatchObject({
      code: 'GP-1',
      description: 'FAZENDINHA GRUPO R$ 1,00',
      key: 'fazendinha:grupo:100',
    });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('filtro por código ou descrição, sem acento nem maiúsculas', () => {
    expect(filterQuoteRows(rows, ' centena ').map((r) => r.code)).toEqual(
      expect.arrayContaining(['C', 'CT-1', 'CT-100']),
    );
    expect(filterQuoteRows(rows, 'palpitão').map((r) => r.code)).toEqual(['PLP']);
    expect(filterQuoteRows(rows, 'gp-100').map((r) => r.code)).toEqual(['GP-100']);
    expect(filterQuoteRows(rows, '')).toBe(rows);
  });

  it('diferença: só o que mudou, separado por jogo; valor fora do limite é erro da linha', () => {
    const diff = quoteValuesDiff(rows, {
      'tradicional:centena': 90_000,
      'tradicional:milhar': 800_000,
      'fazendinha:dezena:300': 0,
    });
    expect(diff).toEqual({
      ok: true,
      count: 2,
      changes: {
        traditional: [{ modality: 'centena', prizeCents: 90_000 }],
        fazendinha: [{ mode: 'dezena', stakeCents: 300, prizeCents: 0 }],
      },
    });
    expect(quoteValuesDiff(rows, { 'tradicional:grupo': 100_000_001 })).toMatchObject({
      ok: false,
      fieldErrors: { 'tradicional:grupo': expect.stringContaining('R$ 1.000.000,00') },
    });
  });

  it('erros da API pela posição no corpo voltam pela chave da linha', () => {
    expect(remapQuoteFieldErrors({ 'quotes.1.prizeCents': 'Máximo.', quotes: 'Repetido.' }, ['a', 'b'])).toEqual({
      b: 'Máximo.',
      quotes: 'Repetido.',
    });
  });
});

describe('Cotações: tela', () => {
  it('seletor com a padrão marcada; valores com código, descrição e valor em reais à direita', async () => {
    renderQuotes({ canManage: false });
    const picker = screen.getByRole('combobox', { name: 'Tabela de pagamento' });
    expect(picker).toHaveTextContent('Tabela VIP');
    expect(screen.getByText('800/1/8000')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma unidade com esta tabela')).toBeInTheDocument();

    const header = within(valuesTable())
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(header.slice(0, 3)).toEqual(['Código', 'Descrição', 'Valor do pagamento (R$)']);
    const centena = within(rowOf('C')).getAllByRole('cell');
    expect(centena[1]).toHaveTextContent('CENTENA');
    expect(centena[2]).toHaveTextContent('800,00');
    expect(centena[2]).toHaveClass('text-right', 'tabular-nums');
    // CT-100 vem desligado no padrão.
    expect(within(rowOf('CT-100')).getByText('Desligada')).toBeInTheDocument();

    await userEvent.click(picker);
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['PadrãoPadrão', 'Tabela VIP']);
    await userEvent.click(options[0]!);
    expect(router.push).toHaveBeenCalledWith(`/cotacoes?tabela=${DEFAULT_ID}`, { scroll: false });
  });

  it('filtro na tela por código ou descrição; sem resultado avisa', async () => {
    renderQuotes({ canManage: false });
    const filter = screen.getByRole('searchbox', { name: 'Filtrar por código ou descrição' });
    await userEvent.type(filter, 'milhar');
    expect(
      within(valuesTable())
        .getAllByRole('cell')
        .filter((c) => c.textContent === 'M'),
    ).toHaveLength(1);
    expect(screen.queryByText('FAZENDINHA GRUPO R$ 1,00')).not.toBeInTheDocument();
    await userEvent.clear(filter);
    await userEvent.type(filter, 'xyz');
    expect(screen.getByText('Nenhuma modalidade encontrada para esse filtro.')).toBeInTheDocument();
  });

  it('só quotes.read: somente consulta (sem criar, renomear, excluir nem editar valores)', () => {
    renderQuotes({ canManage: false });
    for (const name of [/Nova tabela/, /Renomear/, /Tornar padrão/, /Excluir/, /Editar valores/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(within(valuesTable()).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('edita valores na tabela e salva só os alterados; trava a troca de tabela durante a edição', async () => {
    const saved = quoteTable(TABLES[1]!, {
      tableLabel: '900/1/8000',
      traditional: defaultQuotes().traditional.map((q) =>
        q.modality === 'centena' ? { ...q, prizeCents: 90_000 } : q,
      ),
    });
    actions.saveQuoteValuesAction.mockResolvedValue({ ok: true, data: saved });
    renderQuotes();
    await userEvent.click(screen.getByRole('button', { name: /Editar valores/ }));
    expect(screen.getByRole('combobox', { name: 'Tabela de pagamento' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar valores' })).toBeDisabled();

    const centena = within(rowOf('C')).getByRole('textbox', { name: 'Valor do pagamento C (CENTENA)' });
    await userEvent.clear(centena);
    await userEvent.type(centena, '90000');
    expect(centena).toHaveValue('900,00');
    const gp1 = within(rowOf('GP-1')).getByRole('textbox');
    await userEvent.clear(gp1);
    expect(gp1).toHaveValue('0,00');
    expect(screen.getByText('2 valores alterados.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar valores' }));
    expect(actions.saveQuoteValuesAction).toHaveBeenCalledExactlyOnceWith(VIP_ID, {
      traditional: [{ modality: 'centena', prizeCents: 90_000 }],
      fazendinha: [{ mode: 'grupo', stakeCents: 100, prizeCents: 0 }],
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 valores salvos.'));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Salvar valores' })).not.toBeInTheDocument();
    expect(within(rowOf('C')).getAllByRole('cell')[2]).toHaveTextContent('900,00');
    expect(screen.getByRole('combobox', { name: 'Tabela de pagamento' })).toBeEnabled();
  });

  it('erros da API aparecem na linha e na mensagem; cancelar descarta a edição', async () => {
    actions.saveQuoteValuesAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { 'tradicional:grupo': 'O prêmio máximo é R$ 1.000.000,00.' },
    });
    renderQuotes();
    await userEvent.click(screen.getByRole('button', { name: /Editar valores/ }));
    const grupo = within(rowOf('G')).getByRole('textbox');
    await userEvent.type(grupo, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar valores' }));
    await waitFor(() => expect(grupo).toHaveAttribute('aria-invalid', 'true'));
    expect(within(rowOf('G')).getByRole('alert')).toHaveTextContent('O prêmio máximo é R$ 1.000.000,00.');
    expect(screen.getByText('Corrija os campos destacados.')).toBeInTheDocument();

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    await waitFor(() => expect(cancel).toBeEnabled());
    await userEvent.click(cancel);
    expect(within(rowOf('G')).getAllByRole('cell')[2]).toHaveTextContent('20,00');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('sessão encerrada ao salvar leva ao login', async () => {
    actions.saveQuoteValuesAction.mockResolvedValue({ ok: false, code: 'SESSION_INVALID', message: 'x' });
    renderQuotes();
    await userEvent.click(screen.getByRole('button', { name: /Editar valores/ }));
    await userEvent.type(within(rowOf('U')).getByRole('textbox'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar valores' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
  });

  it('nova tabela: nome obrigatório, copia da tabela aberta e abre a criada', async () => {
    actions.createQuoteTableAction
      .mockResolvedValueOnce({
        ok: false,
        code: 'CONFLICT',
        message: 'Já existe uma tabela com esse nome.',
        fieldErrors: { name: 'Nome já usado.' },
      })
      .mockResolvedValueOnce({ ok: true, data: quoteTable({ ...TABLES[1]!, id: 'novo', name: 'Promo' }) });
    renderQuotes();
    await userEvent.click(screen.getByRole('button', { name: /Nova tabela/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar tabela' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe o nome da tabela.');
    expect(actions.createQuoteTableAction).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('combobox', { name: 'Copiar valores de' })).toHaveTextContent('Tabela VIP');

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), '  Promo ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar tabela' }));
    expect(await within(dialog).findByText('Nome já usado.')).toBeInTheDocument();
    expect(within(dialog).getByText('Já existe uma tabela com esse nome.')).toBeInTheDocument();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Criar tabela' }));
    expect(actions.createQuoteTableAction).toHaveBeenLastCalledWith({ name: 'Promo', copyFromId: VIP_ID });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tabela "Promo" criada.'));
    expect(router.push).toHaveBeenCalledWith('/cotacoes?tabela=novo');
  });

  it('renomear envia o nome sem espaços e recarrega', async () => {
    actions.renameQuoteTableAction.mockResolvedValue({ ok: true, data: quoteTable(TABLES[1]!) });
    renderQuotes();
    await userEvent.click(screen.getByRole('button', { name: /Renomear/ }));
    const name = within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Nome' });
    expect(name).toHaveValue('Tabela VIP');
    await userEvent.clear(name);
    await userEvent.type(name, 'VIP 2 ');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(actions.renameQuoteTableAction).toHaveBeenCalledWith(VIP_ID, { name: 'VIP 2' });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tabela renomeada.'));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('tornar padrão pede confirmação', async () => {
    actions.setDefaultQuoteTableAction.mockResolvedValue({ ok: true, data: quoteTable(TABLES[1]!) });
    renderQuotes();
    await userEvent.click(screen.getByRole('button', { name: /Tornar padrão/ }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Tornar padrão' }));
    expect(actions.setDefaultQuoteTableAction).toHaveBeenCalledWith(VIP_ID);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('"Tabela VIP" agora é a tabela padrão.'));
  });

  it('excluir: tabela em uso mostra o aviso no diálogo; excluída volta para a padrão', async () => {
    actions.deleteQuoteTableAction
      .mockResolvedValueOnce({
        ok: false,
        code: 'QUOTE_TABLE_IN_USE',
        message: 'Há unidades usando esta tabela. Troque a tabela delas antes de excluir.',
        fieldErrors: { usersCount: '3' },
      })
      .mockResolvedValueOnce({ ok: true, data: null });
    renderQuotes();
    await userEvent.click(screen.getByRole('button', { name: /Excluir/ }));
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir tabela' }));
    expect(
      await within(dialog).findByText(/Troque a tabela delas antes de excluir\. \(3 unidades com esta tabela\.\)/),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();

    await userEvent.click(await within(dialog).findByRole('button', { name: 'Excluir tabela' }));
    expect(actions.deleteQuoteTableAction).toHaveBeenLastCalledWith(VIP_ID);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tabela "Tabela VIP" excluída.'));
    expect(router.push).toHaveBeenCalledWith('/cotacoes');
  });

  it('a tabela padrão não pode ser excluída nem marcada de novo', () => {
    renderQuotes({ selectedId: DEFAULT_ID, detail: ok(quoteTable(TABLES[0]!)) });
    expect(screen.getByRole('button', { name: /Excluir/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Tornar padrão/ })).not.toBeInTheDocument();
    expect(screen.getByText('Padrão da banca')).toBeInTheDocument();
  });

  it('tabela do endereço inexistente e falha ao carregar a tabela avisam', () => {
    renderQuotes({ requestedMissing: true, detail: { status: 'error', message: 'Serviço indisponível.' } });
    expect(screen.getByText(/A tabela do endereço não foi encontrada/)).toBeInTheDocument();
    expect(screen.getByText('Não foi possível carregar a tabela')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('Cotações: página (servidor)', () => {
  const okRes = <T,>(data: T) => ({ ok: true as const, status: 200, data });

  it('sem quotes.read: 403, sem consultar a API', async () => {
    gate.session.operator.permissions = ['users.read'];
    render(await QuotesPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(api.listQuoteTables).not.toHaveBeenCalled();
    expect(api.getQuoteTable).not.toHaveBeenCalled();
  });

  it('sem ?tabela abre a padrão; só quotes.read é somente consulta', async () => {
    gate.session.operator.permissions = ['quotes.read'];
    api.listQuoteTables.mockResolvedValue(okRes(TABLES));
    api.getQuoteTable.mockResolvedValue(okRes(quoteTable(TABLES[0]!)));
    render(await QuotesPage({ searchParams: Promise.resolve({}) }));
    expect(api.getQuoteTable).toHaveBeenCalledExactlyOnceWith(gate.session, DEFAULT_ID);
    expect(screen.getByRole('combobox', { name: 'Tabela de pagamento' })).toHaveTextContent('Padrão');
    expect(screen.queryByRole('button', { name: /Editar valores/ })).not.toBeInTheDocument();
  });

  it('?tabela=<id> busca a tabela junto com a lista; Gerente edita', async () => {
    gate.session.operator.permissions = ['quotes.read', 'quotes.manage'];
    api.listQuoteTables.mockResolvedValue(okRes(TABLES));
    api.getQuoteTable.mockResolvedValue(okRes(quoteTable(TABLES[1]!)));
    render(await QuotesPage({ searchParams: Promise.resolve({ tabela: VIP_ID.toUpperCase() }) }));
    expect(api.getQuoteTable).toHaveBeenCalledExactlyOnceWith(gate.session, VIP_ID);
    expect(screen.getByRole('combobox', { name: 'Tabela de pagamento' })).toHaveTextContent('Tabela VIP');
    expect(screen.getByRole('button', { name: /Editar valores/ })).toBeInTheDocument();
    expect(screen.queryByText(/A tabela do endereço não foi encontrada/)).not.toBeInTheDocument();
  });

  it('?tabela inexistente abre a padrão com aviso; falha da lista mostra o erro', async () => {
    gate.session.operator.permissions = ['quotes.read'];
    const missing = '77777777-7777-4777-8777-777777777777';
    api.listQuoteTables.mockResolvedValue(okRes(TABLES));
    api.getQuoteTable.mockImplementation(async (_session: unknown, id: string) =>
      id === DEFAULT_ID
        ? okRes(quoteTable(TABLES[0]!))
        : { ok: false, status: 404, error: { statusCode: 404, code: 'NOT_FOUND', message: 'x' } },
    );
    const { unmount } = render(await QuotesPage({ searchParams: Promise.resolve({ tabela: missing }) }));
    expect(api.getQuoteTable).toHaveBeenLastCalledWith(gate.session, DEFAULT_ID);
    expect(screen.getByText(/A tabela do endereço não foi encontrada/)).toBeInTheDocument();
    unmount();

    api.listQuoteTables.mockResolvedValue({
      ok: false,
      status: 503,
      error: { statusCode: 503, code: 'UNAUTHORIZED', message: 'x' },
    });
    render(await QuotesPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('Não foi possível carregar as cotações')).toBeInTheDocument();
  });

  it('sessão inválida na API vira unauthorized', async () => {
    gate.session.operator.permissions = ['quotes.read'];
    api.listQuoteTables.mockResolvedValue({
      ok: false,
      status: 401,
      error: { statusCode: 401, code: 'SESSION_INVALID', message: 'x' },
    });
    await expect(QuotesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('unauthorized');
  });
});
