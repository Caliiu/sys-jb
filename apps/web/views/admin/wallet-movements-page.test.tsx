import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  type WalletMovementKind,
  parseWalletMovementsQuery,
  walletMovementsHref,
} from '@/lib/admin/wallet-movements-query';
import { renderWithProviders, router } from '@/test/render';

vi.mock('@/app/admin/actions', () => ({ searchPlayersAction: vi.fn(async () => ({ ok: true, data: [] })) }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/depositos' }));

const { default: WalletMovementsPage } = await import('./WalletMovementsPage');

// 29/05/2026 12:00 em Brasília.
const NOW = '2026-05-29T15:00:00.000Z';
const TODAY = '2026-05-29';
const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';
const PROMOTER = { id: 'c'.repeat(8) + '-4d1c-4b63-9a3a-0c1f2e3d4a5b', displayId: 100001, name: 'Paula Promotora' };

const show = (kind: WalletMovementKind, raw: Record<string, string> = {}) =>
  renderWithProviders(
    <WalletMovementsPage
      kind={kind}
      query={parseWalletMovementsQuery(kind, raw, NOW)}
      today={TODAY}
      promoters={[PROMOTER]}
      player={null}
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
    });
    const query = parseWalletMovementsQuery(
      'withdrawals',
      { de: '2026-05-01', ate: TODAY, status: 'recusado', apostador: ID, promotor: 'x' },
      NOW,
    );
    expect(query).toMatchObject({ searched: true, status: 'recusado', userId: ID, promoterId: '' });
    // "Recusado" é só de saque; "expirado", só de depósito.
    expect(parseWalletMovementsQuery('deposits', { status: 'recusado' }, NOW).status).toBe('');
    expect(parseWalletMovementsQuery('withdrawals', { status: 'expirado' }, NOW).status).toBe('');
    expect(parseWalletMovementsQuery('deposits', { de: TODAY, ate: '2026-05-30' }, NOW).searched).toBe(false);
    expect(walletMovementsHref('withdrawals', query)).toBe(
      `/saques?de=2026-05-01&ate=${TODAY}&apostador=${ID}&status=recusado`,
    );
  });
});

describe.each([
  ['deposits', 'Depósitos', '/depositos', ['Pendente', 'Pago', 'Expirado', 'Cancelado']],
  ['withdrawals', 'Saques', '/saques', ['Pendente', 'Aprovado', 'Pago', 'Recusado', 'Cancelado']],
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

  it('depois de pesquisar: período, colunas e lista vazia com o aviso da integração', () => {
    show(kind, { de: '2026-05-01', ate: TODAY });
    const results = screen.getByRole('region', { name: 'Resultados' });
    expect(within(results).getByText(/^Período:/).textContent).toBe('Período: 01/05/2026 – 29/05/2026');
    expect(within(results).getByRole('table', { name: title })).toBeInTheDocument();
    expect(within(results).getByText('Nenhum resultado encontrado')).toBeInTheDocument();
    expect(within(results).getByText(/dependem da integração de pagamento/)).toBeInTheDocument();
  });
});
