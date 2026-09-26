import type { PublicUser } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WithdrawalItem } from '@/lib/withdrawal';
import { renderWithProviders, router, tenant, user } from '@/test/render';

const requestWithdrawalAction = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/auth-actions', () => ({ meAction: vi.fn() }));
vi.mock('@/app/withdrawal-actions', () => ({
  requestWithdrawalAction: (...args: unknown[]) => requestWithdrawalAction(...args),
}));

const { default: WithdrawalsPage } = await import('./WithdrawalsPage');

/** Saldo: 30.000 de prêmios (livre), 5.000 de recarga e 1.000 de bônus => disponível R$ 300,00. */
const richUser: PublicUser = {
  ...user,
  wallet: { ...user.wallet, balanceJb: 5000, bonusJb: 1000, prizesJb: 30000, totalAvailableJb: 36000 },
};

const created: WithdrawalItem = {
  id: 'w1',
  amountCents: 5000,
  status: 'PENDING',
  keyType: 'cpf',
  keyValue: richUser.document,
  createdAt: '2026-09-26T14:10:00.000Z',
};

type Ui = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

/** Novo saque até a confirmação: chave CPF do titular e R$ 50,00. */
async function openConfirm(): Promise<{ ui: Ui; dialog: HTMLElement }> {
  const ui = userEvent.setup();
  renderWithProviders(<WithdrawalsPage tenant={tenant} user={richUser} />);
  await ui.click(screen.getByRole('button', { name: 'Novo saque' }));
  await ui.click(screen.getByRole('radio', { name: 'CPF' }));
  await ui.click(screen.getByRole('button', { name: 'Avançar' }));
  await ui.click(screen.getByRole('button', { name: 'Sacar R$ 50,00' }));
  await ui.click(screen.getByRole('button', { name: 'Avançar' }));
  return { ui, dialog: screen.getByRole('dialog', { name: 'Confirmar saque' }) };
}

describe('Confirmar saque', () => {
  it('mostra valor, forma e destino para conferir antes de solicitar', async () => {
    const { dialog } = await openConfirm();
    expect(within(dialog).getByText('Confira os dados antes de solicitar.')).toBeInTheDocument();
    expect(within(dialog).getByText('R$ 50,00')).toBeInTheDocument();
    expect(within(dialog).getByText('Pix · CPF')).toBeInTheDocument();
    expect(within(dialog).getByText(richUser.document)).toBeInTheDocument();
    expect(requestWithdrawalAction).not.toHaveBeenCalled();
  });

  it('Cancelar e Esc fecham sem enviar nada', async () => {
    const { ui, dialog } = await openConfirm();
    await ui.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Confirmar saque' })).toBeNull();

    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    await ui.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Confirmar saque' })).toBeNull();
    expect(requestWithdrawalAction).not.toHaveBeenCalled();
  });

  it('confirmar envia só tipo, chave normalizada e valor', async () => {
    requestWithdrawalAction.mockResolvedValue({ ok: false, code: 'UNAVAILABLE', message: 'x' });
    const { ui, dialog } = await openConfirm();
    await ui.click(within(dialog).getByRole('button', { name: 'Confirmar saque' }));
    expect(requestWithdrawalAction).toHaveBeenCalledExactlyOnceWith({
      keyType: 'cpf',
      keyValue: richUser.document,
      amountCents: 5000,
    });
  });

  it('enquanto envia: botões travados, Esc não fecha e o segundo clique não duplica o pedido', async () => {
    let resolve: (value: unknown) => void = () => {};
    requestWithdrawalAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const { ui, dialog } = await openConfirm();
    await ui.click(within(dialog).getByRole('button', { name: 'Confirmar saque' }));

    const sending = within(dialog).getByRole('button', { name: 'Enviando…' });
    expect(sending).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await ui.click(sending);
    await ui.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Confirmar saque' })).toBeInTheDocument();
    expect(requestWithdrawalAction).toHaveBeenCalledTimes(1);

    resolve({ ok: false, code: 'UNAVAILABLE', message: 'Saque indisponível.' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Saque indisponível.');
    expect(within(dialog).getByRole('button', { name: 'Confirmar saque' })).toBeEnabled();
  });

  it.each([
    ['UNAVAILABLE', 'Saque indisponível no momento. Tente novamente mais tarde.'],
    ['INVALID_REQUEST', 'Valor maior que o disponível para resgate'],
  ])('falha %s aparece no próprio diálogo, que segue aberto para tentar de novo', async (code, message) => {
    requestWithdrawalAction.mockResolvedValue({ ok: false, code, message });
    const { ui, dialog } = await openConfirm();
    await ui.click(within(dialog).getByRole('button', { name: 'Confirmar saque' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('heading', { name: 'Solicitação enviada' })).toBeNull();
  });

  it('cancelar depois de um erro limpa a mensagem', async () => {
    requestWithdrawalAction.mockResolvedValue({ ok: false, code: 'UNAVAILABLE', message: 'Indisponível.' });
    const { ui, dialog } = await openConfirm();
    await ui.click(within(dialog).getByRole('button', { name: 'Confirmar saque' }));
    await within(dialog).findByRole('alert');
    await ui.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    expect(within(screen.getByRole('dialog', { name: 'Confirmar saque' })).queryByRole('alert')).toBeNull();
  });

  it('sessão encerrada leva ao login', async () => {
    requestWithdrawalAction.mockResolvedValue({ ok: false, code: 'SESSION_INVALID', message: 'x' });
    const { ui, dialog } = await openConfirm();
    await ui.click(within(dialog).getByRole('button', { name: 'Confirmar saque' }));
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('falha inesperada não quebra a tela', async () => {
    requestWithdrawalAction.mockRejectedValue(new Error('rede'));
    const { ui, dialog } = await openConfirm();
    await ui.click(within(dialog).getByRole('button', { name: 'Confirmar saque' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Não foi possível enviar o saque. Tente novamente.',
    );
  });
});

describe('Solicitação enviada', () => {
  async function confirmWithSuccess(item: WithdrawalItem = created) {
    requestWithdrawalAction.mockResolvedValue({ ok: true, withdrawal: item });
    const { ui, dialog } = await openConfirm();
    await ui.click(within(dialog).getByRole('button', { name: 'Confirmar saque' }));
    await screen.findByRole('heading', { name: 'Solicitação enviada', level: 2 });
    return ui;
  }

  it('só aparece depois de o servidor confirmar; mostra valor, forma e destino', async () => {
    await confirmWithSuccess();
    expect(screen.getByRole('heading', { level: 1, name: 'Solicitação enviada' })).toBeInTheDocument();
    expect(screen.getByText('Seu saque está sendo processado.')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00')).toBeInTheDocument();
    expect(screen.getByText('Pix', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText(richUser.document)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Confirmar saque' })).toBeNull();
    expect(router.refresh).toHaveBeenCalled(); // a lista já busca o saque novo
  });

  it('o destino usa a máscara do tipo (celular)', async () => {
    await confirmWithSuccess({ ...created, keyType: 'phone', keyValue: '11912345678' });
    expect(screen.getByText('(11) 91234-5678')).toBeInTheDocument();
  });

  it('"Acompanhar status" e o voltar da barra levam a Meus saques', async () => {
    const ui = await confirmWithSuccess();
    await ui.click(screen.getByRole('button', { name: 'Acompanhar status' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Meus saques' })).toBeInTheDocument();

    await ui.click(screen.getByRole('button', { name: 'Novo saque' }));
    await ui.click(screen.getByRole('radio', { name: 'CPF' }));
    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    await ui.click(screen.getByRole('button', { name: 'Sacar R$ 50,00' }));
    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    await ui.click(screen.getByRole('button', { name: 'Confirmar saque' }));
    await screen.findByRole('heading', { name: 'Solicitação enviada', level: 2 });
    await ui.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Meus saques' })).toBeInTheDocument();
  });

  it('"Voltar ao início" é um link para o dashboard', async () => {
    await confirmWithSuccess();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});

describe('Meus saques: lista e detalhes', () => {
  // 26/09/2026 14:30 em Brasília.
  const NOW = new Date('2026-09-26T17:30:00.000Z');

  const items: WithdrawalItem[] = [
    created, // hoje 11:10
    {
      ...created,
      id: 'w2',
      amountCents: 12345,
      status: 'PAID',
      keyType: 'email',
      keyValue: 'ana@example.com',
      createdAt: '2026-09-25T15:00:00.000Z',
    },
    {
      ...created,
      id: 'w3',
      amountCents: 2000,
      status: 'REJECTED',
      keyType: 'phone',
      keyValue: '11912345678',
      createdAt: '2026-09-20T12:00:00.000Z',
    },
    { ...created, id: 'w4', amountCents: 3000, status: 'CANCELED', createdAt: '2026-09-19T12:00:00.000Z' },
  ];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const renderList = (list: WithdrawalItem[] = items) =>
    renderWithProviders(<WithdrawalsPage tenant={tenant} user={richUser} items={list} />);

  it('mostra a contagem e agrupa por Hoje, Ontem e data', () => {
    renderList();
    expect(screen.getByText('4 resgates')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Hoje' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ontem' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '20/09/2026' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '19/09/2026' })).toBeInTheDocument();
  });

  it('cada resgate mostra Pix, status, valor e hora', () => {
    renderList();
    const today = within(screen.getByRole('region', { name: 'Hoje' }));
    const row = today.getByRole('button', { name: 'Resgate de R$ 50,00, 11:10' });
    expect(within(row).getByText('Pix')).toBeInTheDocument();
    expect(within(row).getByText('Pendente')).toBeInTheDocument();
    expect(within(row).getByText('R$ 50,00')).toBeInTheDocument();
    expect(within(row).getByText('11:10')).toBeInTheDocument();
  });

  it('cada status tem o seu nome', () => {
    renderList();
    for (const label of ['Pendente', 'Pago', 'Recusado', 'Cancelado']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('singular quando há um só resgate', () => {
    renderList([created]);
    expect(screen.getByText('1 resgate')).toBeInTheDocument();
  });

  it('tocar num resgate abre os detalhes; Fechar e Esc fecham', async () => {
    const ui = userEvent.setup();
    renderList();
    await ui.click(screen.getByRole('button', { name: 'Resgate de R$ 50,00, 11:10' }));

    const dialog = screen.getByRole('dialog', { name: 'Detalhes do resgate' });
    expect(within(dialog).getByText('Pendente')).toBeInTheDocument();
    expect(within(dialog).getByText('R$ 50,00')).toBeInTheDocument();
    expect(within(dialog).getByText('Pix', { selector: 'dd' })).toBeInTheDocument();
    expect(within(dialog).getByText(richUser.name)).toBeInTheDocument();
    expect(within(dialog).getByText(richUser.document)).toBeInTheDocument();
    expect(within(dialog).getByText('26/09/26 11:10')).toBeInTheDocument();

    await ui.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog', { name: 'Detalhes do resgate' })).toBeNull();

    await ui.click(screen.getByRole('button', { name: 'Resgate de R$ 123,45, 12:00' }));
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    await ui.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Detalhes do resgate' })).toBeNull();
  });

  it('o detalhe do celular mostra a máscara', async () => {
    const ui = userEvent.setup();
    renderList();
    await ui.click(screen.getByRole('button', { name: 'Resgate de R$ 20,00, 09:00' }));
    expect(screen.getByText('(11) 91234-5678')).toBeInTheDocument();
  });

  it('"Atualizar" busca a lista de novo no servidor', async () => {
    renderList();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('sem saques não há contagem nem "Atualizar", só o estado vazio', () => {
    renderList([]);
    expect(screen.getByText('Nenhum resgate por aqui')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
    expect(screen.queryByText(/resgates?$/)).toBeNull();
  });
});
