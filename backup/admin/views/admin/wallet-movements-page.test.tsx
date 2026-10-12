import type { AdminDepositList, AdminWithdrawalList, AdminWithdrawalListItem } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type WalletMovementKind,
  depositsApiQuery,
  parseWalletMovementsQuery,
  walletMovementsHref,
  withdrawalsApiQuery,
} from '@/lib/admin/wallet-movements-query';
import { renderWithProviders, router } from '@/test/render';

const reviewDepositAction = vi.fn();
const reviewWithdrawalAction = vi.fn();
const resolveWithdrawalAction = vi.fn();
vi.mock('@/app/admin/actions', () => ({
  searchPlayersAction: vi.fn(async () => ({ ok: true, data: [] })),
  reviewDepositAction: (...args: unknown[]) => reviewDepositAction(...args),
  reviewWithdrawalAction: (...args: unknown[]) => reviewWithdrawalAction(...args),
  resolveWithdrawalAction: (...args: unknown[]) => resolveWithdrawalAction(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/depositos' }));

const { default: WalletMovementsPage } = await import('./WalletMovementsPage');

// 29/05/2026 12:00 em Brasília.
const NOW = '2026-05-29T15:00:00.000Z';
const TODAY = '2026-05-29';
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const PROMOTER = { id: 'c'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100001, name: 'Paula Promotora' };

const show = (
  kind: WalletMovementKind,
  raw: Record<string, string> = {},
  deposits: AdminDepositList | 'error' | null = null,
  canReview = false,
  withdrawals: AdminWithdrawalList | 'error' | null = null,
) =>
  renderWithProviders(
    <WalletMovementsPage
      kind={kind}
      query={parseWalletMovementsQuery(kind, raw, NOW)}
      today={TODAY}
      promoters={[PROMOTER]}
      player={null}
      deposits={deposits}
      withdrawals={withdrawals}
      canReview={canReview}
    />,
  );

describe('filtros de depósitos e saques na URL', () => {
  it('pesquisa com período válido; status só da lista do tipo; ids inválidos viram "todos"', () => {
    expect(parseWalletMovementsQuery('deposits', {}, NOW)).toEqual({
      searched: false,
      from: TODAY,
      to: TODAY,
      userId: '',
      promoterId: '',
      status: '',
      page: 1,
      pageSize: 25,
    });
    const query = parseWalletMovementsQuery(
      'withdrawals',
      { de: '2026-05-01', ate: TODAY, status: 'recusado', apostador: ID, promotor: 'x' },
      NOW,
    );
    expect(query).toMatchObject({ searched: true, status: 'recusado', userId: ID, promoterId: '' });
    // "Na fila" é só de saque; "expirado", só de depósito; "em análise" existe nos dois.
    expect(parseWalletMovementsQuery('deposits', { status: 'na-fila' }, NOW).status).toBe('');
    expect(parseWalletMovementsQuery('withdrawals', { status: 'em-analise' }, NOW).status).toBe('em-analise');
    expect(parseWalletMovementsQuery('withdrawals', { status: 'expirado' }, NOW).status).toBe('');
    expect(parseWalletMovementsQuery('deposits', { de: TODAY, ate: '2026-05-30' }, NOW).searched).toBe(false);
    expect(walletMovementsHref('withdrawals', query)).toBe(
      `/saques?de=2026-05-01&ate=${TODAY}&apostador=${ID}&status=recusado`,
    );
    expect(walletMovementsHref('withdrawals', { ...query, page: 3, pageSize: 50 })).toBe(
      `/saques?de=2026-05-01&ate=${TODAY}&apostador=${ID}&status=recusado&page=3&pageSize=50`,
    );
  });

  it('saques: status e filtros no formato da API', () => {
    const query = parseWalletMovementsQuery('withdrawals', { de: TODAY, ate: TODAY, status: 'nao-pago' }, NOW);
    expect(withdrawalsApiQuery(query)).toEqual({ from: TODAY, to: TODAY, page: 1, pageSize: 25, status: 'FAILED' });
  });

  it('depósitos: status e filtros no formato da API', () => {
    const query = parseWalletMovementsQuery(
      'deposits',
      { de: '2026-05-01', ate: TODAY, status: 'pago', apostador: ID, page: '2', pageSize: '50' },
      NOW,
    );
    expect(depositsApiQuery(query)).toEqual({
      from: '2026-05-01',
      to: TODAY,
      page: 2,
      pageSize: 50,
      userId: ID,
      status: 'PAID',
    });
  });
});

describe.each([
  ['deposits', 'Depósitos', '/depositos', ['Pendente', 'Em análise', 'Pago', 'Expirado', 'Cancelado', 'Recusado']],
  [
    'withdrawals',
    'Saques',
    '/saques',
    ['Em análise', 'Na fila', 'Enviando', 'Processando', 'Pago', 'Não pago', 'Recusado', 'Cancelado'],
  ],
] as const)('%s', (kind, title, href, statuses) => {
  it('filtros da referência; antes de pesquisar, o pedido para aplicar um filtro', async () => {
    show(kind);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    const form = screen.getByRole('form', { name: `Filtrar ${title.toLowerCase()}` });
    expect(form).toHaveAttribute('action', href);
    expect([...form.querySelectorAll('label')].map((l) => l.textContent)).toEqual([
      'Apostador',
      'Status',
      'Promotor',
      'Seção',
      'Rota',
      'Grupo de Cobrança',
    ]);
    expect(within(form).getByRole('group', { name: 'Período (Data Início / Data Fim)' })).toBeInTheDocument();
    expect(
      within(within(form).getByLabelText('Status'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Todos', ...statuses]);
    // Apostador opcional: mostra "Selecione um apostador", mas a lista tem "Todos" para limpar.
    const playerButton = within(form).getByRole('button', { name: /Apostador/ });
    expect(playerButton).toHaveTextContent('Selecione um apostador');
    await userEvent.click(playerButton);
    expect(
      within(screen.getByRole('listbox', { name: 'Apostador' })).getByRole('option', { name: 'Todos' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Para visualizar os dados, por favor, aplique um filtro no painel acima.'),
    ).toBeInTheDocument();
  });

  it('depois de pesquisar: período, colunas e lista vazia', () => {
    show(kind, { de: '2026-05-01', ate: TODAY });
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getByText(/^Período:/).textContent).toBe('Período: 01/05/2026 – 29/05/2026');
    expect(within(results).getByRole('table', { name: title })).toBeInTheDocument();
    expect(within(results).getByText('Nenhum resultado encontrado')).toBeInTheDocument();
    expect(within(results).queryByText(/dependem da integração de pagamento/)).toBeNull();
  });
});

describe('saques registrados', () => {
  const base: AdminWithdrawalListItem = {
    id: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-05-29T13:05:00.000Z',
    paidAt: '2026-05-29T13:07:00.000Z',
    user: { id: ID, displayId: 100012, name: 'Pessoa Sintética' },
    amountCents: 5000,
    fromPrizesJbCents: 3000,
    fromPrizesGamesCents: 2000,
    keyType: 'CPF',
    keyValue: '52998224725',
    status: 'PAID',
    gateway: 'MISTICPAY',
    providerTransactionId: '54345',
    failureReason: null,
    note: null,
    reviewedBy: null,
    reviewedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    beneficiary: { name: 'Pessoa Sintética', document: '52998224725' },
    beneficiaryMatches: true,
    resolvable: false,
  };
  const LIST: AdminWithdrawalList = {
    items: [
      base,
      {
        ...base,
        id: '44444444-4444-4444-8444-444444444444',
        createdAt: '2026-05-29T12:00:00.000Z',
        paidAt: null,
        amountCents: 30000,
        fromPrizesJbCents: 30000,
        fromPrizesGamesCents: 0,
        keyType: 'PHONE',
        keyValue: '11987654321',
        status: 'REVIEW',
        gateway: null,
        providerTransactionId: null,
        beneficiary: null,
        beneficiaryMatches: null,
      },
      {
        ...base,
        id: '55555555-5555-4555-8555-555555555555',
        createdAt: '2026-05-29T11:00:00.000Z',
        paidAt: null,
        status: 'SENDING',
        providerTransactionId: null,
        beneficiary: null,
        beneficiaryMatches: null,
        resolvable: true,
      },
    ],
    total: 3,
    page: 1,
    pageSize: 25,
    paidTotalCents: 5000,
  };

  it('linhas com data, apostador, chave (com máscara), origem, valor e situação; total pago', () => {
    show('withdrawals', { de: TODAY, ate: TODAY }, null, false, LIST);
    const results = screen.getByRole('region', { name: 'Resultados' });
    const rows = within(results).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('529.982.247-25')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Loterias R$ 30,00')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Cassino R$ 20,00')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Pago')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('MisticPay #54345')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('(11) 98765-4321')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Em análise')).toBeInTheDocument();
    expect(within(results).getByText(/^Total pago:/).textContent).toBe('Total pago: R$ 50,00');
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('Mostrando 1 a 3 de 3 saques');
    // Sem perfil de Gerente, nenhuma ação.
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Foi pago' })).toBeNull();
  });

  it('pago a outro titular fica destacado', () => {
    show('withdrawals', { de: TODAY, ate: TODAY }, null, true, {
      ...LIST,
      items: [{ ...base, beneficiary: { name: 'Outra Pessoa', document: '11144477735' }, beneficiaryMatches: false }],
    });
    expect(screen.getByText(/Pago a outro titular · Outra Pessoa 111\.444\.777-35/)).toBeInTheDocument();
  });

  it('Gerente aprova com confirmação e recusa com motivo; cancelar não chama a API', async () => {
    const ui = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce(null).mockReturnValueOnce('Chave de outra pessoa');
    reviewWithdrawalAction.mockResolvedValue({ ok: true, data: LIST.items[1] });
    show('withdrawals', { de: TODAY, ate: TODAY }, null, true, LIST);

    await ui.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(reviewWithdrawalAction).not.toHaveBeenCalled();
    await ui.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(reviewWithdrawalAction).toHaveBeenLastCalledWith(LIST.items[1]!.id, true);

    await ui.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(reviewWithdrawalAction).toHaveBeenCalledTimes(1);
    await ui.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(reviewWithdrawalAction).toHaveBeenLastCalledWith(LIST.items[1]!.id, false, 'Chave de outra pessoa');
    expect(router.refresh).toHaveBeenCalled();
    confirm.mockRestore();
    prompt.mockRestore();
  });

  it('envio sem resposta: o Gerente conclui à mão depois de conferir no gateway', async () => {
    const ui = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    resolveWithdrawalAction.mockResolvedValue({ ok: false, code: 'CONFLICT', message: 'A situação mudou.' });
    show('withdrawals', { de: TODAY, ate: TODAY }, null, true, LIST);
    expect(screen.getByText('Confira no painel do gateway antes de concluir.')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Não foi pago' }));
    expect(confirm.mock.calls[0]![0]).toMatch(/NÃO FOI PAGO.*recebe duas vezes/s);
    expect(resolveWithdrawalAction).toHaveBeenCalledWith(LIST.items[2]!.id, false);
    expect(await screen.findByRole('alert')).toHaveTextContent('A situação mudou.');
    confirm.mockRestore();
  });

  it('API fora do ar: avisa sem quebrar a tela', () => {
    show('withdrawals', { de: TODAY, ate: TODAY }, null, true, 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os saques. Tente novamente.');
  });
});

describe('depósitos registrados', () => {
  const LIST: AdminDepositList = {
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-05-29T13:05:00.000Z',
        paidAt: '2026-05-29T13:06:00.000Z',
        user: { id: ID, displayId: 100012, name: 'Pessoa Sintética' },
        gateway: 'MISTICPAY',
        destination: 'LOTTERIES',
        amountCents: 5000,
        status: 'PAID',
        payer: { name: 'Pessoa Sintética', document: '52998224725' },
        payerMatches: true,
        reviewReason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        createdAt: '2026-05-29T12:00:00.000Z',
        paidAt: null,
        user: { id: ID, displayId: 100012, name: 'Pessoa Sintética' },
        gateway: 'MISTICPAY',
        destination: 'GAMES',
        amountCents: 2000,
        status: 'PENDING',
        payer: null,
        payerMatches: null,
        reviewReason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    ],
    total: 30,
    page: 1,
    pageSize: 25,
    paidTotalCents: 5000,
  };

  it('linhas com data, apostador (link), destino, gateway, valor e situação; total pago e paginação', () => {
    show('deposits', { de: TODAY, ate: TODAY }, LIST);
    const results = screen.getByRole('region', { name: 'Resultados' });
    const rows = within(results).getAllByRole('row').slice(1);
    expect(rows.map((row) => [...row.querySelectorAll('td')].map((td) => td.textContent))).toEqual([
      ['29/05/2026 10:05', '100012 - Pessoa Sintética', 'Titular', 'Loterias', 'MisticPay', 'R$ 50,00', 'Pago'],
      ['29/05/2026 09:00', '100012 - Pessoa Sintética', '—', 'Games', 'MisticPay', 'R$ 20,00', 'Pendente'],
    ]);
    expect(within(rows[0]!).getByRole('link', { name: '100012 - Pessoa Sintética' })).toHaveAttribute(
      'href',
      `/usuarios/${ID}`,
    );
    expect(within(results).getByText(/^Total pago:/).textContent).toBe('Total pago: R$ 50,00');
    expect(within(results).queryByText('Nenhum resultado encontrado')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toHaveTextContent('Mostrando 1 a 25 de 30 depósitos');
  });

  const HELD: AdminDepositList = {
    ...LIST,
    total: 1,
    items: [
      {
        ...LIST.items[0]!,
        status: 'REVIEW',
        paidAt: null,
        payer: { name: 'Outra Pessoa', document: '11222333000181' },
        payerMatches: false,
        reviewReason: 'PAYER_MISMATCH',
      },
    ],
  };

  it('em análise: mostra quem pagou (CNPJ formatado) e o motivo; só o Gerente vê Liberar/Recusar', () => {
    show('deposits', { de: TODAY, ate: TODAY }, HELD);
    const row = within(screen.getByRole('region', { name: 'Resultados' })).getAllByRole('row')[1]!;
    expect(row).toHaveTextContent('Outra Pessoa · 11.222.333/0001-81');
    expect(row).toHaveTextContent('Em análisePago por outro titular');
    expect(within(row).queryByRole('button', { name: 'Liberar crédito' })).toBeNull();
  });

  it('perfil sem acesso aos dados do pagador: mostra só "Outro titular"', () => {
    show('deposits', { de: TODAY, ate: TODAY }, { ...HELD, items: [{ ...HELD.items[0]!, payer: null }] });
    const row = within(screen.getByRole('region', { name: 'Resultados' })).getAllByRole('row')[1]!;
    expect(row).toHaveTextContent('Outro titular');
    expect(row).not.toHaveTextContent('11.222.333');
  });

  it('Gerente libera com confirmação; cancelar a confirmação não chama a API', async () => {
    reviewDepositAction.mockResolvedValue({ ok: true, data: { ...HELD.items[0]!, status: 'PAID' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    show('deposits', { de: TODAY, ate: TODAY }, HELD, true);
    const approve = screen.getByRole('button', { name: 'Liberar crédito' });
    await userEvent.click(approve);
    expect(reviewDepositAction).not.toHaveBeenCalled();
    await userEvent.click(approve);
    expect(confirm).toHaveBeenLastCalledWith(
      expect.stringContaining('Liberar R$ 50,00 na carteira de Pessoa Sintética'),
    );
    expect(reviewDepositAction).toHaveBeenCalledWith(HELD.items[0]!.id, true);
    expect(router.refresh).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('API fora do ar: avisa sem quebrar a tela', () => {
    show('deposits', { de: TODAY, ate: TODAY }, 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os depósitos.');
  });
});
