import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStaticPixPayload } from '@/lib/pix-brcode';
import type { PixCharge } from '@/lib/recharge';
import { renderWithProviders, router, tenant, user } from '@/test/render';

const createPixChargeAction = vi.fn();
const depositStatusAction = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/auth-actions', () => ({ meAction: vi.fn() }));
vi.mock('@/app/recharge-actions', () => ({
  createPixChargeAction: (...args: unknown[]) => createPixChargeAction(...args),
  depositStatusAction: (...args: unknown[]) => depositStatusAction(...args),
}));

const { default: RechargePage } = await import('./RechargePage');

const NOW = new Date('2026-09-25T12:00:00Z');
const code = buildStaticPixPayload({
  key: '00000000-0000-4000-8000-000000000000',
  merchantName: 'SYSJB TESTE',
  merchantCity: 'SAO PAULO',
  amountCents: 5000,
  txid: 'LOT0123456789',
});
const charge: PixCharge = {
  depositId: '6f0c3a52-1d9b-4c55-8a4e-2f1b9c7d3e10',
  code,
  amountCents: 5000,
  durationSeconds: 300,
  expiresAt: new Date(NOW.getTime() + 271_000).toISOString(), // 04:31
};

const amount = () => screen.getByRole('textbox', { name: 'Quanto deseja creditar?' });
const advance = () => screen.getByRole('button', { name: /Avançar|Gerando/ });

beforeEach(() => {
  vi.clearAllMocks();
  createPixChargeAction.mockResolvedValue({ ok: true, charge });
  depositStatusAction.mockResolvedValue({ ok: true, status: 'PENDING', wallet: null });
  // setTimeout fica real: o asyncWrapper do Testing Library depende dele (o contador só usa Date e setInterval).
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

// delay: null: sem pausas entre as ações do usuário.
// Chame antes de definir navigator.clipboard: o setup() instala o seu próprio stub.
const setup = () => userEvent.setup({ delay: null });

/** Preenche R$ 50,00 + Loterias e avança para a etapa de pagamento. */
async function goToPayment(ui: ReturnType<typeof setup>) {
  renderWithProviders(<RechargePage tenant={tenant} user={user} />);
  await ui.click(screen.getByRole('button', { name: 'Adicionar R$ 50,00' }));
  await ui.click(screen.getByRole('radio', { name: /Loterias/ }));
  await ui.click(advance());
}

describe('RechargePage: valor e destino', () => {
  it('começa zerada, com o saldo atual e as etapas', () => {
    renderWithProviders(<RechargePage tenant={tenant} user={user} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Recarga Pix' })).toBeInTheDocument();
    // Topo como no dashboard: nome e ID do jogador.
    expect(screen.getByText(`Olá, ${user.name}`)).toBeInTheDocument();
    expect(screen.getByText(String(user.displayId))).toBeInTheDocument();
    expect(amount()).toHaveValue('R$ 0,00');
    expect(screen.getByText('Saldo atual:').parentElement).toHaveTextContent('Saldo atual: R$ 1.235,00');
    expect(screen.getByRole('img', { name: 'Etapa 1 de 2' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/');
  });

  it('digitação usa máscara de moeda', async () => {
    const ui = setup();
    renderWithProviders(<RechargePage tenant={tenant} user={user} />);
    await ui.type(amount(), '12345');
    expect(amount()).toHaveValue('R$ 123,45');
    await ui.type(amount(), '{Backspace}');
    expect(amount()).toHaveValue('R$ 12,34');
  });

  it('valores rápidos somam e Limpar zera', async () => {
    const ui = setup();
    renderWithProviders(<RechargePage tenant={tenant} user={user} />);
    await ui.click(screen.getByRole('button', { name: 'Adicionar R$ 50,00' }));
    await ui.click(screen.getByRole('button', { name: 'Adicionar R$ 30,00' }));
    expect(amount()).toHaveValue('R$ 80,00');

    await ui.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(amount()).toHaveValue('R$ 0,00');
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeDisabled();
  });

  it('não avança sem valor mínimo nem destino; erro some ao corrigir', async () => {
    const ui = setup();
    renderWithProviders(<RechargePage tenant={tenant} user={user} />);
    await ui.click(advance());
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um valor mínimo de R$ 1,00.');

    await ui.click(screen.getByRole('button', { name: 'Adicionar R$ 30,00' }));
    expect(screen.queryByRole('alert')).toBeNull();

    await ui.click(advance());
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha onde usar o crédito.');

    await ui.click(screen.getByRole('radio', { name: /Loterias/ }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(createPixChargeAction).not.toHaveBeenCalled();
  });

  it('o efeito de rolar ao topo não devolve nada (o React reclama de efeito que retorna valor)', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation((() => Promise.resolve()) as never);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithProviders(<RechargePage tenant={tenant} user={user} />);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('Games informa que o bônus está indisponível; Loterias não', () => {
    renderWithProviders(<RechargePage tenant={tenant} user={user} />);
    expect(screen.getAllByText('Bônus indisponível')).toHaveLength(1);
  });

  it('ocultar saldo esconde a barra e o "Saldo atual"', async () => {
    renderWithProviders(<RechargePage tenant={tenant} user={user} />);
    await setup().click(screen.getByRole('button', { name: 'Ocultar saldo' }));
    expect(screen.queryByText('1.235,00', { exact: false })).toBeNull();
    expect(screen.getAllByText(/••••/)).toHaveLength(2);
  });
});

describe('RechargePage: gerar a cobrança', () => {
  it('envia valor e destino à action e não mexe na URL', async () => {
    const ui = setup();
    await goToPayment(ui);
    expect(createPixChargeAction).toHaveBeenCalledExactlyOnceWith({ amountCents: 5000, destination: 'lotteries' });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('enquanto gera, o botão fica desabilitado (sem cobrança duplicada)', async () => {
    let resolve: (value: unknown) => void = () => {};
    createPixChargeAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const ui = setup();
    renderWithProviders(<RechargePage tenant={tenant} user={user} />);
    await ui.click(screen.getByRole('button', { name: 'Adicionar R$ 50,00' }));
    await ui.click(screen.getByRole('radio', { name: /Loterias/ }));
    await ui.click(advance());
    expect(screen.getByRole('button', { name: /Gerando Pix/ })).toBeDisabled();
    await ui.click(screen.getByRole('button', { name: /Gerando Pix/ }));
    expect(createPixChargeAction).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ ok: true, charge }));
    expect(screen.getByRole('heading', { level: 1, name: 'Efetue o pagamento' })).toBeInTheDocument();
  });

  it('Pix indisponível: mostra a mensagem e continua na etapa 1', async () => {
    createPixChargeAction.mockResolvedValue({
      ok: false,
      code: 'UNAVAILABLE',
      message: 'Pix indisponível no momento.',
    });
    await goToPayment(setup());
    expect(await screen.findByRole('alert')).toHaveTextContent('Pix indisponível no momento.');
    expect(screen.getByRole('heading', { level: 1, name: 'Recarga Pix' })).toBeInTheDocument();
    expect(advance()).toBeEnabled();
  });

  it('falha inesperada não quebra a tela', async () => {
    createPixChargeAction.mockRejectedValue(new Error('rede'));
    await goToPayment(setup());
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível gerar o Pix. Tente novamente.');
  });

  it('sessão expirada leva ao login', async () => {
    createPixChargeAction.mockResolvedValue({ ok: false, code: 'SESSION_INVALID', message: 'x' });
    await goToPayment(setup());
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});

describe('RechargePage: pagamento', () => {
  /** Etapa 2 pronta: espera o contador montar e assinar o relógio antes de o teste mexer no tempo. */
  async function openPayment(ui: ReturnType<typeof setup>) {
    await goToPayment(ui);
    await screen.findByRole('timer');
  }

  it('mostra titular, valor, chave, etapas e o tempo para pagar', async () => {
    await openPayment(setup());
    expect(screen.getByRole('heading', { level: 1, name: 'Efetue o pagamento' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Etapa 2 de 2' })).toBeInTheDocument();
    expect(screen.getByText('Pessoa Sintética')).toBeInTheDocument();
    expect(screen.getByText('529.982.247-25')).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00')).toBeInTheDocument();
    expect(screen.getByText(code)).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('04:31');
  });

  it('a contagem avança a cada segundo', async () => {
    await openPayment(setup());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('04:28');
  });

  it('copiar a chave usa a área de transferência e confirma', async () => {
    const ui = setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openPayment(ui);
    await ui.click(screen.getByRole('button', { name: 'Copiar chave' }));
    expect(writeText).toHaveBeenCalledWith(code);
    // O rótulo muda quando a cópia (assíncrona) termina.
    expect(await screen.findByRole('button', { name: 'Chave copiada!' })).toBeInTheDocument();
  });

  it('falha ao copiar não quebra: orienta a cópia manual', async () => {
    const ui = setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) },
      configurable: true,
    });
    await openPayment(ui);
    await ui.click(screen.getByRole('button', { name: 'Copiar chave' }));
    expect((await screen.findAllByText(/Copie a chave selecionada/)).length).toBeGreaterThan(0);
  });

  it('Ver/Ocultar QR Code mostra o QR real da chave', async () => {
    const ui = setup();
    await openPayment(ui);
    expect(screen.queryByRole('img', { name: 'QR Code do Pix' })).toBeNull();

    await ui.click(screen.getByRole('button', { name: 'Ver QR Code' }));
    expect(screen.getByRole('img', { name: 'QR Code do Pix' }).querySelector('path')).toHaveAttribute('d');

    await ui.click(screen.getByRole('button', { name: 'Ocultar QR Code' }));
    expect(screen.queryByRole('img', { name: 'QR Code do Pix' })).toBeNull();
  });

  it('voltar retorna ao formulário com valor e destino preservados', async () => {
    const ui = setup();
    await openPayment(ui);
    await ui.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Recarga Pix' })).toBeInTheDocument();
    expect(amount()).toHaveValue('R$ 50,00');
    expect(screen.getByRole('radio', { name: /Loterias/ })).toBeChecked();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('ao expirar, bloqueia copiar/QR e "Gerar novo Pix" volta ao formulário', async () => {
    const ui = setup();
    await openPayment(ui);
    act(() => {
      vi.advanceTimersByTime(272_000);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Pagamento expirado');
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copiar chave' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ver QR Code' })).toBeDisabled();

    await ui.click(screen.getByRole('button', { name: 'Gerar novo Pix' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Recarga Pix' })).toBeInTheDocument();
  });

  it('acompanha o depósito: pendente continua na tela; pago mostra a confirmação e o saldo novo no topo', async () => {
    const ui = setup();
    await openPayment(ui);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(depositStatusAction).toHaveBeenCalledWith(charge.depositId);
    expect(screen.getByRole('timer')).toBeInTheDocument();

    depositStatusAction.mockResolvedValue({
      ok: true,
      status: 'PAID',
      wallet: { ...user.wallet, balanceJb: user.wallet.balanceJb + 5000 },
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'Pagamento confirmado!' })).toBeInTheDocument();
    expect(screen.getByText('R$ 50,00 creditado na sua carteira.')).toBeInTheDocument();
    // Saldo do topo e do formulário já com o crédito (era R$ 1.235,00).
    expect(screen.getAllByText('R$ 1.285,00').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('timer')).toBeNull();

    // Pago: não pergunta mais.
    const calls = depositStatusAction.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(depositStatusAction).toHaveBeenCalledTimes(calls);

    await ui.click(screen.getByRole('button', { name: 'Fazer outra recarga' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Recarga Pix' })).toBeInTheDocument();
  });

  it('pago por outra conta: mostra "em análise" (sem crédito) e para de perguntar', async () => {
    depositStatusAction.mockResolvedValue({ ok: true, status: 'REVIEW', wallet: null });
    await openPayment(setup());
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'Pagamento em análise' })).toBeInTheDocument();
    expect(screen.getByText(/não saiu de uma conta no seu CPF/)).toBeInTheDocument();
    expect(screen.queryByText('R$ 1.285,00')).toBeNull();
    const calls = depositStatusAction.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(depositStatusAction).toHaveBeenCalledTimes(calls);
  });

  it('recusado pela banca: orienta a falar com o suporte', async () => {
    depositStatusAction.mockResolvedValue({ ok: true, status: 'REJECTED', wallet: null });
    await openPayment(setup());
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'Pagamento recusado' })).toBeInTheDocument();
    expect(screen.getByText(/Fale com o suporte/)).toBeInTheDocument();
  });

  it('sessão encerrada durante o acompanhamento leva ao login', async () => {
    depositStatusAction.mockResolvedValue({ ok: false, code: 'SESSION_INVALID' });
    await openPayment(setup());
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('falha de rede ao acompanhar não quebra a tela', async () => {
    depositStatusAction.mockRejectedValue(new Error('rede'));
    await openPayment(setup());
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });
});
