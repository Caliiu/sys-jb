import type { PublicUser } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router, tenant, user } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/auth-actions', () => ({ meAction: vi.fn() }));
vi.mock('@/app/withdrawal-actions', () => ({ requestWithdrawalAction: vi.fn() }));

const { default: WithdrawalsPage } = await import('./WithdrawalsPage');

/** Saldo das loterias: 30.000 de prêmios (livre), 5.000 de recarga e 1.000 de bônus => disponível R$ 300,00. */
const richUser: PublicUser = {
  ...user,
  wallet: { ...user.wallet, balanceJb: 5000, bonusJb: 1000, prizesJb: 30000, totalAvailableJb: 36000 },
};

const EXPLAIN_TITLE = 'Bônus e recargas não podem ser resgatados';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear(); // as chaves recentes ficam no navegador
});

describe('Meus saques', () => {
  it('sem saques mostra o estado vazio e o atalho para um novo saque', () => {
    renderWithProviders(<WithdrawalsPage tenant={tenant} user={user} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Meus saques' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nenhum resgate por aqui' })).toBeInTheDocument();
    expect(screen.getByText('Quando você solicitar um saque, ele aparecerá nesta lista.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo saque' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});

/** Abre a página de saques e entra no fluxo pelo botão "Novo saque" (a URL continua /saques). */
async function openNewWithdrawal(person: PublicUser = richUser) {
  const ui = userEvent.setup();
  renderWithProviders(<WithdrawalsPage tenant={tenant} user={person} />);
  await ui.click(screen.getByRole('button', { name: 'Novo saque' }));
  return ui;
}

describe('Novo saque: forma de pagamento', () => {
  const setup = () => openNewWithdrawal();
  const advance = () => screen.getByRole('button', { name: 'Avançar' });

  it('mostra título, etapa, Pix, titular e o aviso do CPF', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Novo saque' })).toBeInTheDocument();
    expect(screen.getByText('Etapa 1 de 2')).toBeInTheDocument();
    expect(screen.getByText('Forma de pagamento', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Forma de pagamento' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pix' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Titular')).toHaveValue(richUser.name);
    expect(screen.getByLabelText('Titular')).toHaveAttribute('readonly');
    expect(screen.getByText('O saque só será realizado para conta com o mesmo CPF do cadastro.')).toBeInTheDocument();
    // Nenhum tipo escolhido: ainda não há campo de chave.
    expect(screen.queryByLabelText(/^Chave/)).toBeNull();
  });

  it('não navega: o fluxo abre por estado e o voltar da etapa 1 devolve a lista', async () => {
    const ui = await setup();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Voltar' })).toBeNull();

    await ui.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Meus saques' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo saque' })).toBeInTheDocument();
  });

  it('Avançar sem escolher o tipo de chave orienta', async () => {
    const ui = await setup();
    await ui.click(advance());
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o tipo de chave.');
    expect(screen.getByText('Etapa 1 de 2')).toBeInTheDocument();
  });

  it('CPF vem preenchido com o do titular e não é editável', async () => {
    const ui = await setup();
    await ui.click(screen.getByRole('radio', { name: 'CPF' }));
    const field = screen.getByLabelText('Chave CPF');
    expect(field).toHaveValue('529.982.247-25');
    expect(field).toHaveAttribute('readonly');
    await ui.type(field, '123');
    expect(field).toHaveValue('529.982.247-25');
  });

  it('e-mail: valida antes de avançar e o erro some ao corrigir', async () => {
    const ui = await setup();
    await ui.click(screen.getByRole('radio', { name: 'E-mail' }));
    expect(screen.getByLabelText('Chave e-mail')).toHaveValue('');
    await ui.type(screen.getByLabelText('Chave e-mail'), 'sem-arroba');
    await ui.click(advance());
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um e-mail válido.');
    expect(screen.getByLabelText('Chave e-mail')).toBeInvalid();

    await ui.type(screen.getByLabelText('Chave e-mail'), '@example.com');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('celular tem máscara e exige um número válido', async () => {
    const ui = await setup();
    await ui.click(screen.getByRole('radio', { name: 'Celular' }));
    await ui.type(screen.getByLabelText('Chave celular'), '119123');
    expect(screen.getByLabelText('Chave celular')).toHaveValue('(11) 9123');
    await ui.click(advance());
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um celular válido com DDD.');
  });

  it('chave aleatória: só hexadecimal, em minúsculas', async () => {
    const ui = await setup();
    await ui.click(screen.getByRole('radio', { name: 'Aleatória' }));
    await ui.type(screen.getByLabelText('Chave aleatória'), '123E4567-Zz');
    expect(screen.getByLabelText('Chave aleatória')).toHaveValue('123e4567-');
    await ui.click(advance());
    expect(screen.getByRole('alert')).toHaveTextContent('Informe a chave aleatória completa (36 caracteres).');
  });

  it('trocar o tipo limpa a chave digitada e o erro', async () => {
    const ui = await setup();
    await ui.click(screen.getByRole('radio', { name: 'E-mail' }));
    await ui.type(screen.getByLabelText('Chave e-mail'), 'ruim');
    await ui.click(advance());
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await ui.click(screen.getByRole('radio', { name: 'Celular' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Chave celular')).toHaveValue('');
  });

  it('com a chave CPF, avança para o valor', async () => {
    const ui = await setup();
    await ui.click(screen.getByRole('radio', { name: 'CPF' }));
    await ui.click(advance());
    expect(screen.getByRole('heading', { level: 1, name: 'Valor do resgate' })).toBeInTheDocument();
    expect(screen.getByText('Etapa 2 de 2')).toBeInTheDocument();
  });
});

describe('Novo saque: valor do resgate', () => {
  const toAmountStep = async (person: PublicUser = richUser) => {
    const ui = await openNewWithdrawal(person);
    await ui.click(screen.getByRole('radio', { name: 'CPF' }));
    await ui.click(screen.getByRole('button', { name: 'Avançar' }));
    return ui;
  };
  const amount = () => screen.getByRole('textbox', { name: /Valor do saque/ });
  const chip = (reais: number) => screen.getByRole('button', { name: `Sacar R$ ${reais},00` });
  const advance = () => screen.getByRole('button', { name: 'Avançar' });

  it('resumo do saldo: total − recarga − bônus = disponível', async () => {
    await toAmountStep();
    const summary = screen.getByRole('region', { name: 'Resumo do saldo' });
    expect(within(summary).getByText('R$ 360,00')).toBeInTheDocument();
    expect(within(summary).getByText('R$ 50,00')).toBeInTheDocument();
    expect(within(summary).getByText('R$ 10,00')).toBeInTheDocument();
    expect(within(summary).getByText('Disponível para resgate').nextElementSibling).toHaveTextContent('R$ 300,00');
  });

  it('mostra o valor zerado, a dica, para quem vai e o botão desabilitado', async () => {
    await toAmountStep();
    expect(amount()).toHaveValue('0,00');
    expect(screen.getByText('Digite o valor que deseja resgatar')).toBeInTheDocument();
    expect(screen.getByText(richUser.name)).toBeInTheDocument();
    expect(screen.getByText(richUser.document)).toBeInTheDocument();
    expect(advance()).toBeDisabled();
  });

  it('valores rápidos definem o valor e habilitam Avançar', async () => {
    const ui = await toAmountStep();
    await ui.click(chip(50));
    expect(amount()).toHaveValue('50,00');
    expect(chip(50)).toHaveAttribute('aria-pressed', 'true');
    expect(chip(20)).toHaveAttribute('aria-pressed', 'false');
    expect(advance()).toBeEnabled();
  });

  it('"Valor máximo" preenche com o disponível', async () => {
    const ui = await toAmountStep();
    await ui.click(screen.getByRole('button', { name: 'Valor máximo' }));
    expect(amount()).toHaveValue('300,00');
    expect(advance()).toBeEnabled();
  });

  it('acima do disponível: erro e botão desabilitado', async () => {
    const ui = await toAmountStep();
    await ui.type(amount(), '30001');
    expect(amount()).toHaveValue('300,01');
    expect(screen.getByRole('alert')).toHaveTextContent('Valor maior que o disponível para resgate');
    expect(advance()).toBeDisabled();
  });

  it('abaixo do mínimo (R$ 1,00): erro e botão desabilitado', async () => {
    const ui = await toAmountStep();
    await ui.type(amount(), '50');
    expect(screen.getByRole('alert')).toHaveTextContent('Valor mínimo para saque: R$ 1,00');
    expect(advance()).toBeDisabled();
    await ui.type(amount(), '0');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(advance()).toBeEnabled();
  });

  it('digitação limitada ao teto: dígitos a mais são ignorados', async () => {
    const ui = await toAmountStep();
    await ui.type(amount(), '99999999999999');
    expect(amount()).toHaveValue('999.999,99');
  });

  it('valores rápidos acima do disponível ficam desabilitados', async () => {
    const poorer: PublicUser = { ...richUser, wallet: { ...richUser.wallet, prizesJb: 2500, totalAvailableJb: 8500 } };
    await toAmountStep(poorer); // disponível R$ 25,00
    expect(chip(10)).toBeEnabled();
    expect(chip(20)).toBeEnabled();
    expect(chip(50)).toBeDisabled();
    expect(chip(100)).toBeDisabled();
  });

  it('sem saldo livre (só recarga e bônus): tudo desabilitado, como no print', async () => {
    const broke: PublicUser = {
      ...richUser,
      wallet: { ...richUser.wallet, prizesJb: 0, totalAvailableJb: 6000 },
    };
    const ui = await toAmountStep(broke);
    const summary = screen.getByRole('region', { name: 'Resumo do saldo' });
    expect(within(summary).getByText('Disponível para resgate').nextElementSibling).toHaveTextContent('R$ 0,00');
    for (const reais of [10, 20, 50, 100]) expect(chip(reais)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Valor máximo' })).toBeDisabled();
    expect(advance()).toBeDisabled();
    await ui.type(amount(), '1000');
    expect(screen.getByRole('alert')).toHaveTextContent('Valor maior que o disponível para resgate');
  });

  it('Avançar com valor válido abre a confirmação (nada é enviado ainda)', async () => {
    const ui = await toAmountStep();
    await ui.click(chip(100));
    await ui.click(advance());
    expect(screen.getByRole('dialog', { name: 'Confirmar saque' })).toBeInTheDocument();
  });

  it('voltar retorna à forma de pagamento com a chave preservada', async () => {
    const ui = await toAmountStep();
    await ui.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Novo saque' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'CPF' })).toBeChecked();
    expect(screen.getByLabelText('Chave CPF')).toHaveValue('529.982.247-25');
  });

  it('"Entenda" abre a explicação; Esc e "Entendi" fecham', async () => {
    const ui = await toAmountStep();
    await ui.click(screen.getByRole('button', { name: 'Entenda' }));
    const dialog = screen.getByRole('dialog', { name: EXPLAIN_TITLE });
    expect(within(dialog).getByText('Uso do saldo nas apostas')).toBeInTheDocument();
    expect(within(dialog).getByText('Disponível para saque')).toBeInTheDocument();
    expect(within(dialog).getByText(/1º Saldo livre/)).toBeInTheDocument();

    await ui.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: EXPLAIN_TITLE })).toBeNull();

    await ui.click(screen.getByRole('button', { name: 'Entenda' }));
    await ui.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('dialog', { name: EXPLAIN_TITLE })).toBeNull();
  });
});
