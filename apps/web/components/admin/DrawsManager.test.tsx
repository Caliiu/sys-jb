import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type AdminDraw, type AdminDrawsResponse, ROLE_PERMISSIONS } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_SCHEDULE } from '@/test/draws';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/sorteios' }));
vi.mock('@/app/admin/actions', () => ({
  saveDrawAction: vi.fn(),
  deleteDrawAction: vi.fn(),
  addDrawExceptionAction: vi.fn(),
  removeDrawExceptionAction: vi.fn(),
  adminLogoutAction: vi.fn(),
}));

const actions = await import('@/app/admin/actions');
const { default: DrawsManager } = await import('./DrawsManager');
const { default: AdminSidebar } = await import('./AdminSidebar');
const save = vi.mocked(actions.saveDrawAction);
const remove = vi.mocked(actions.deleteDrawAction);
const addException = vi.mocked(actions.addDrawExceptionAction);

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DRAWS: AdminDraw[] = TEST_SCHEDULE.draws.map((d, i) => ({
  ...d,
  id: ID(i + 1),
  active: true,
  sortOrder: i * 10,
}));
const DATA: AdminDrawsResponse = { draws: DRAWS, exceptions: [] };
const TODAY = '2026-09-28';

beforeEach(() => vi.clearAllMocks());

const renderManager = (canManage = true, data = DATA) =>
  renderWithProviders(<DrawsManager initial={data} canManage={canManage} today={TODAY} />);

describe('Sorteios no painel', () => {
  it('lista por grupo com horário, venda até, dias, jogos e situação', () => {
    renderManager();
    expect(screen.getByRole('heading', { name: 'Sorteios (12)' })).toBeInTheDocument();
    const rio = screen.getByRole('rowgroup', { name: 'RIO/FEDERAL' });
    const federal = within(rio).getByRole('row', { name: /LT FEDERAL/ });
    expect(federal).toHaveTextContent(/LT FEDERAL\s*20:00\s*19:58\s*Qua, Dom\s*Loterias · Fazendinha\s*Ativo/);
    expect(screen.getByRole('row', { name: /LT CAPITAL 13HS/ })).toHaveTextContent(/Todos os dias\s*Loterias\s*Ativo/);
  });

  it('filtro por grupo', async () => {
    renderManager();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Grupo' }), 'BAHIA');
    expect(screen.queryByRole('rowgroup', { name: 'RIO/FEDERAL' })).toBeNull();
    expect(within(screen.getByRole('rowgroup', { name: 'BAHIA' })).getAllByRole('row')).toHaveLength(4);
  });

  it('cadastra um sorteio novo', async () => {
    save.mockResolvedValue({ ok: true, data: DATA });
    renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Novo sorteio' }));
    const form = screen.getByRole('form', { name: 'Novo sorteio' });
    await userEvent.type(within(form).getByLabelText('Grupo'), 'minas gerais');
    await userEvent.type(within(form).getByLabelText('Nome (no pule)'), 'lt minas dia 15hs');
    await userEvent.type(within(form).getByLabelText('Horário do sorteio'), '15:00');
    await userEvent.type(within(form).getByLabelText('Venda até'), '14:55');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dom' }));
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Fazendinha' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));

    expect(save).toHaveBeenCalledExactlyOnceWith({
      draw: {
        group: 'MINAS GERAIS',
        name: 'LT MINAS DIA 15HS',
        drawTime: '15:00',
        closesAt: '14:55',
        weekdays: [1, 2, 3, 4, 5, 6],
        games: ['lotteries'],
        active: true,
        sortOrder: 120,
      },
    });
    expect(screen.getByText('Sorteio cadastrado.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('form', { name: 'Novo sorteio' })).toBeNull();
  });

  it('edita e mostra a trava de apostas vendidas', async () => {
    save.mockResolvedValue({
      ok: false,
      code: 'DRAW_HAS_BETS',
      message: 'Há apostas vendidas para este sorteio. Não é possível fazer esta alteração antes da apuração.',
    });
    renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Editar LT PT RIO 09HS' }));
    const form = screen.getByRole('form', { name: 'Editar LT PT RIO 09HS' });
    expect(within(form).getByLabelText('Venda até')).toHaveValue('09:18');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Ativo' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));

    expect(save).toHaveBeenCalledWith({ id: ID(1), draw: expect.objectContaining({ active: false }) });
    expect(within(form).getByRole('alert')).toHaveTextContent('Há apostas vendidas');
  });

  it('exclui com confirmação', async () => {
    remove.mockResolvedValue({ ok: true, data: { ...DATA, draws: DRAWS.slice(1) } });
    renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir LT PT RIO 09HS' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir sorteio' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    expect(remove).toHaveBeenCalledExactlyOnceWith(ID(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('row', { name: /LT PT RIO 09HS/ })).toBeNull();
  });

  it('adiciona feriado e lista as exceções', async () => {
    addException.mockResolvedValue({
      ok: true,
      data: {
        ...DATA,
        exceptions: [
          {
            id: ID(99),
            date: '2026-10-12',
            drawId: null,
            drawName: null,
            kind: 'CANCEL',
            note: 'Feriado',
            createdAt: '2026-09-28T15:00:00.000Z',
          },
        ],
      },
    });
    renderManager();
    expect(screen.getByText('Nenhuma exceção programada.')).toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Nova exceção' });
    await userEvent.type(within(form).getByLabelText('Data'), '2026-10-12');
    await userEvent.type(within(form).getByLabelText('Observação'), 'Feriado');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));
    expect(addException).toHaveBeenCalledExactlyOnceWith({
      date: '2026-10-12',
      kind: 'CANCEL',
      drawId: null,
      note: 'Feriado',
    });
    expect(screen.getByRole('row', { name: /12\/10\/2026/ })).toHaveTextContent(
      /12\/10\/2026\s*Sem sorteio\s*Todos os sorteios\s*Feriado/,
    );
  });

  it('sorteio extra exige um sorteio (sem opção "todos")', async () => {
    renderManager();
    const form = screen.getByRole('form', { name: 'Nova exceção' });
    await userEvent.selectOptions(within(form).getByLabelText('Tipo'), 'EXTRA');
    const options = within(within(form).getByLabelText('Sorteio')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).not.toContain('Todos os sorteios (feriado)');
    expect(within(form).getByLabelText('Sorteio')).toHaveValue(ID(1));
  });

  it('Financeiro só consulta', () => {
    renderManager(false);
    expect(screen.queryByRole('button', { name: 'Novo sorteio' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Editar/ })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Nova exceção' })).toBeNull();
  });

  it('menu: Sorteios aparece para Gerente e Financeiro, não para Suporte', () => {
    const renderSidebar = (permissions: (typeof ROLE_PERMISSIONS)[keyof typeof ROLE_PERMISSIONS]) =>
      renderWithProviders(
        <AdminSidebar tenantName="Banca" operatorName="Operador" roleLabel="Gerente" permissions={permissions} />,
      );
    const { unmount } = renderSidebar(ROLE_PERMISSIONS.SUPPORT);
    expect(screen.queryByRole('link', { name: 'Sorteios' })).toBeNull();
    unmount();
    const finance = renderSidebar(ROLE_PERMISSIONS.FINANCE);
    expect(screen.getAllByRole('link', { name: 'Sorteios' })[0]).toHaveAttribute('href', '/sorteios');
    finance.unmount();
  });
});
