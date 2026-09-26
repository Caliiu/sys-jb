import type { PublicUser } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { user } from '@/test/render';

const resolveRequest = vi.fn();

// O módulo real usa "server-only" e cabeçalhos do Next: aqui só interessa o que a action faz com o resultado.
vi.mock('@/lib/request-context', () => ({ resolveRequest: (...args: unknown[]) => resolveRequest(...args) }));

const { requestWithdrawalAction } = await import('./withdrawal-actions');

/** Saldo lido do servidor: 30.000 de prêmios (livre), 5.000 de recarga, 1.000 de bônus => disponível R$ 300,00. */
const richUser: PublicUser = {
  ...user,
  wallet: { ...user.wallet, balanceJb: 5000, bonusJb: 1000, prizesJb: 30000, totalAvailableJb: 36000 },
};
const session = (me: PublicUser | null) =>
  resolveRequest.mockResolvedValue({ ok: true, hostname: 'x', tenant: {}, me });
const valid = { keyType: 'cpf', keyValue: richUser.document, amountCents: 5000 };

beforeEach(() => vi.clearAllMocks());

describe('requestWithdrawalAction', () => {
  it('sem sessão ou sem banca, não processa nada', async () => {
    session(null);
    expect(await requestWithdrawalAction(valid)).toMatchObject({ ok: false, code: 'SESSION_INVALID' });

    resolveRequest.mockResolvedValue({ ok: false, hostname: null, message: 'sem banca' });
    expect(await requestWithdrawalAction(valid)).toMatchObject({ ok: false, code: 'SESSION_INVALID' });
  });

  it('pedido inválido é recusado com a mensagem do problema', async () => {
    session(richUser);
    expect(await requestWithdrawalAction(null)).toEqual({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'Pedido de saque inválido.',
    });
    expect(await requestWithdrawalAction({ ...valid, keyType: 'email', keyValue: 'ruim' })).toMatchObject({
      code: 'INVALID_REQUEST',
      message: 'Informe um e-mail válido.',
    });
  });

  it('o CPF da chave é o do titular da SESSÃO, não o que o navegador mandou', async () => {
    session(richUser);
    expect(await requestWithdrawalAction({ ...valid, keyValue: '111.444.777-35' })).toEqual({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'A chave CPF deve ser a do titular da conta.',
    });
  });

  it('o valor é conferido contra o saldo de agora no servidor', async () => {
    session(richUser);
    expect(await requestWithdrawalAction({ ...valid, amountCents: 30001 })).toEqual({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'Valor maior que o disponível para resgate',
    });

    // Sem saldo livre (só recarga e bônus): nada pode ser sacado, seja qual for o valor enviado.
    session({ ...richUser, wallet: { ...richUser.wallet, prizesJb: 0, totalAvailableJb: 6000 } });
    expect(await requestWithdrawalAction({ ...valid, amountCents: 100 })).toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('pedido válido: sem backend de saques, responde indisponível (nunca um sucesso falso)', async () => {
    session(richUser);
    const result = await requestWithdrawalAction(valid);
    expect(result).toEqual({
      ok: false,
      code: 'UNAVAILABLE',
      message: 'Saque indisponível no momento. Tente novamente mais tarde.',
    });
  });
});
