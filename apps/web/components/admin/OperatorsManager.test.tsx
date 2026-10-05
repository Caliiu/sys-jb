import type { AdminOperator } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/operadores' }));
vi.mock('@/app/admin/actions', () => ({
  saveOperatorAction: vi.fn(),
  setOperatorStatusAction: vi.fn(),
  resetOperatorPasswordAction: vi.fn(),
}));

const actions = await import('@/app/admin/actions');
const { default: OperatorsManager } = await import('./OperatorsManager');
const save = vi.mocked(actions.saveOperatorAction);
const setStatus = vi.mocked(actions.setOperatorStatusAction);
const reset = vi.mocked(actions.resetOperatorPasswordAction);

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const operator = (n: number, patch: Partial<AdminOperator> = {}): AdminOperator => ({
  id: ID(n),
  name: `Operador ${n}`,
  email: `op${n}@example.test`,
  role: 'SUPPORT',
  active: true,
  createdAt: '2026-10-01T12:00:00.000Z',
  lastLoginAt: null,
  self: false,
  ...patch,
});
const ME = operator(1, {
  name: 'Gerente Sintética',
  role: 'MANAGER',
  self: true,
  lastLoginAt: '2026-10-05T13:00:00.000Z',
});
const SUPPORT = operator(2, { name: 'Suporte Sintético' });

beforeEach(() => vi.clearAllMocks());

const rowOf = (name: string) => screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr')!;

describe('Administração > Operadores', () => {
  it('lista com perfil, situação e último acesso; o próprio Gerente só se altera', () => {
    renderWithProviders(<OperatorsManager initial={[ME, SUPPORT]} />);
    expect(screen.getByRole('heading', { name: 'Operadores (2)' })).toBeInTheDocument();
    const me = rowOf('Gerente Sintética');
    expect(me).toHaveTextContent('(você)');
    expect(me).toHaveTextContent('Gerente');
    expect(me).toHaveTextContent('05/10/2026 10:00');
    expect(within(me).getByRole('button', { name: 'Alterar Gerente Sintética' })).toBeInTheDocument();
    expect(within(me).queryByRole('button', { name: /Desativar|nova senha/ })).toBeNull();

    const support = rowOf('Suporte Sintético');
    expect(support).toHaveTextContent('Suporte');
    expect(support).toHaveTextContent('Ativo');
    expect(support).toHaveTextContent('Nunca entrou');
  });

  it('cadastra e mostra a senha gerada uma única vez', async () => {
    const ui = userEvent.setup();
    const created = operator(3, { name: 'Nova Financeira', email: 'fin@example.test', role: 'FINANCE' });
    save.mockResolvedValue({ ok: true, data: { operator: created, password: 'senha-gerada-123456789012' } });
    renderWithProviders(<OperatorsManager initial={[ME]} />);

    await ui.click(screen.getByRole('button', { name: 'Novo operador' }));
    const form = screen.getByRole('form', { name: 'Novo operador' });
    await ui.type(within(form).getByLabelText('Nome'), 'Nova Financeira');
    await ui.type(within(form).getByLabelText('E-mail (login do painel)'), 'fin@example.test');
    await ui.selectOptions(within(form).getByLabelText('Perfil'), 'FINANCE');
    expect(form).toHaveTextContent('Só consulta');
    await ui.click(within(form).getByRole('button', { name: 'Salvar' }));

    expect(save).toHaveBeenCalledWith({
      operator: { name: 'Nova Financeira', email: 'fin@example.test', role: 'FINANCE' },
    });
    const dialog = screen.getByRole('dialog', { name: 'Senha de Nova Financeira' });
    expect(within(dialog).getByLabelText('Senha gerada')).toHaveTextContent('senha-gerada-123456789012');
    expect(dialog).toHaveTextContent('fin@example.test');
    expect(screen.getByText('Operador cadastrado.')).toHaveAttribute('role', 'status');
    await ui.click(within(dialog).getByRole('button', { name: 'Já guardei' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('senha-gerada-123456789012')).toBeNull();
    expect(rowOf('Nova Financeira')).toHaveTextContent('Financeiro');
  });

  it('e-mail repetido: o erro aparece no campo', async () => {
    const ui = userEvent.setup();
    save.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: 'Já existe um operador com este e-mail.',
      fieldErrors: { email: 'E-mail já usado por outro operador.' },
    });
    renderWithProviders(<OperatorsManager initial={[ME]} />);
    await ui.click(screen.getByRole('button', { name: 'Novo operador' }));
    const form = screen.getByRole('form', { name: 'Novo operador' });
    await ui.type(within(form).getByLabelText('Nome'), 'Repetida');
    await ui.type(within(form).getByLabelText('E-mail (login do painel)'), 'op2@example.test');
    await ui.click(within(form).getByRole('button', { name: 'Salvar' }));
    expect(within(form).getByText('E-mail já usado por outro operador.')).toBeInTheDocument();
    expect(within(form).getByRole('alert')).toHaveTextContent('Já existe um operador com este e-mail.');
  });

  it('o próprio Gerente altera nome e e-mail, mas o perfil fica travado', async () => {
    const ui = userEvent.setup();
    renderWithProviders(<OperatorsManager initial={[ME, SUPPORT]} />);
    await ui.click(screen.getByRole('button', { name: 'Alterar Gerente Sintética' }));
    const form = screen.getByRole('form', { name: 'Alterar operador' });
    expect(within(form).getByLabelText('Perfil')).toBeDisabled();
    expect(form).toHaveTextContent('Você não pode mudar o próprio perfil.');
  });

  it('desativar pede confirmação; gerar nova senha mostra a senha nova', async () => {
    const ui = userEvent.setup();
    setStatus.mockResolvedValue({ ok: true, data: { ...SUPPORT, active: false } });
    reset.mockResolvedValue({ ok: true, data: { operator: SUPPORT, password: 'outra-senha-1234567890ab' } });
    renderWithProviders(<OperatorsManager initial={[ME, SUPPORT]} />);

    await ui.click(screen.getByRole('button', { name: 'Desativar Suporte Sintético' }));
    const confirm = screen.getByRole('dialog', { name: 'Desativar Suporte Sintético?' });
    await ui.click(within(confirm).getByRole('button', { name: 'Desativar' }));
    expect(setStatus).toHaveBeenCalledWith(SUPPORT.id, false);
    expect(rowOf('Suporte Sintético')).toHaveTextContent('Inativo');
    expect(screen.getByRole('button', { name: 'Ativar Suporte Sintético' })).toBeInTheDocument();

    await ui.click(screen.getByRole('button', { name: 'Gerar nova senha para Suporte Sintético' }));
    await ui.click(
      within(screen.getByRole('dialog', { name: 'Gerar nova senha para Suporte Sintético?' })).getByRole('button', {
        name: 'Gerar nova senha',
      }),
    );
    expect(reset).toHaveBeenCalledWith(SUPPORT.id);
    expect(screen.getByLabelText('Senha gerada')).toHaveTextContent('outra-senha-1234567890ab');
  });

  it('sessão encerrada volta para o login', async () => {
    const ui = userEvent.setup();
    setStatus.mockResolvedValue({ ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada.' });
    renderWithProviders(<OperatorsManager initial={[ME, SUPPORT]} />);
    await ui.click(screen.getByRole('button', { name: 'Desativar Suporte Sintético' }));
    await ui.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }));
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});
