import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/admin/actions', () => ({ creditWalletAction: vi.fn() }));

const { creditWalletAction } = await import('@/app/admin/actions');
const { default: WalletCreditPanel } = await import('./WalletCreditPanel');
const credit = vi.mocked(creditWalletAction);

const ID = '5b0f3c3e-4d1c-4b63-9a3a-0c1f2e3d4a5b';

beforeEach(() => vi.clearAllMocks());

function renderPanel() {
  renderWithProviders(<WalletCreditPanel userId={ID} userName="Ana Souza Lima" />);
}

/** Abre o painel, escolhe a bolsa, digita valor (só dígitos, entram pelos centavos) e motivo. */
async function fill(action: string, digits: string, note = 'Bônus de boas-vindas') {
  await userEvent.click(screen.getByRole('button', { name: 'Editar carteira' }));
  await userEvent.click(screen.getByRole('button', { name: action }));
  await userEvent.type(screen.getByLabelText('Valor (R$)'), digits);
  await userEvent.type(screen.getByLabelText('Motivo'), note);
}

describe('Editar carteira', () => {
  it('mostra as três opções de crédito', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Editar carteira' }));
    const group = screen.getByRole('group', { name: 'O que adicionar' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Adicionar Saldo', 'Adicionar Bônus', 'Adicionar Disponível em Games']);
  });

  it('confirma e credita a bolsa escolhida; depois avisa e recarrega a página', async () => {
    credit.mockResolvedValue({ ok: true, data: {} as never });
    renderPanel();
    await fill('Adicionar Disponível em Games', '2550');
    expect(screen.getByLabelText('Valor (R$)')).toHaveValue('25,50');

    await userEvent.click(screen.getAllByRole('button', { name: 'Adicionar Disponível em Games' }).at(-1)!);
    const dialog = screen.getByRole('dialog', { name: 'Confirmar crédito' });
    expect(dialog).toHaveTextContent('Adicionar R$ 25,50 em disponível em games para Ana Souza Lima?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

    expect(credit).toHaveBeenCalledExactlyOnceWith(ID, {
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      bucket: 'games',
      amountCents: 2550,
      note: 'Bônus de boas-vindas',
    });
    expect(screen.getByText('R$ 25,50 adicionados em disponível em games.')).toHaveAttribute('role', 'status');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('sem valor ou motivo não dá para avançar', async () => {
    renderPanel();
    await fill('Adicionar Saldo', '100', 'ab');
    expect(screen.getAllByRole('button', { name: 'Adicionar Saldo' }).at(-1)).toBeDisabled();
  });

  it('erro aparece na confirmação; tentar de novo usa a mesma chave (nunca credita duas vezes)', async () => {
    credit.mockResolvedValue({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'Serviço indisponível. Tente novamente em instantes.',
    });
    renderPanel();
    await fill('Adicionar Saldo', '1000');
    await userEvent.click(screen.getAllByRole('button', { name: 'Adicionar Saldo' }).at(-1)!);
    const dialog = screen.getByRole('dialog', { name: 'Confirmar crédito' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    expect(within(dialog).getByText('Serviço indisponível. Tente novamente em instantes.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

    const [first, second] = credit.mock.calls.map(([, input]) => (input as { idempotencyKey: string }).idempotencyKey);
    expect(second).toBe(first);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('sessão encerrada leva ao login', async () => {
    credit.mockResolvedValue({ ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada.' });
    renderPanel();
    await fill('Adicionar Bônus', '500');
    await userEvent.click(screen.getAllByRole('button', { name: 'Adicionar Bônus' }).at(-1)!);
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});
