import type { PublicUser, PublicWithdrawal } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { user } from '@/test/render';

const resolveRequest = vi.fn();
const apiRequest = vi.fn();
const readSessionToken = vi.fn();

// Os módulos reais usam "server-only" e cabeçalhos do Next: aqui só interessa o que a action faz com o resultado.
vi.mock('@/lib/request-context', () => ({ resolveRequest: (...args: unknown[]) => resolveRequest(...args) }));
vi.mock('@/lib/api-client', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock('@/lib/session', () => ({ readSessionToken: (...args: unknown[]) => readSessionToken(...args) }));

const { cancelWithdrawalAction, requestWithdrawalAction } = await import('./withdrawal-actions');

const KEY = '0f8e2a4c-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
/** Sacável lido do servidor: R$ 300,00 de prêmios (recarga e bônus não entram). */
const richUser: PublicUser = {
  ...user,
  wallet: { ...user.wallet, balanceJb: 5000, bonusJb: 1000, prizesJb: 30000, withdrawable: 30000 },
};
const session = (me: PublicUser | null) =>
  resolveRequest.mockResolvedValue({ ok: true, hostname: 'banca.test', tenant: {}, me });
const valid = { keyType: 'cpf', keyValue: richUser.document, amountCents: 5000, idempotencyKey: KEY };

const created: PublicWithdrawal = {
  id: '6a1f6c1e-2f43-4d3b-9a7e-6f1b2c3d4e5f',
  amountCents: 5000,
  status: 'PROCESSING',
  keyType: 'CPF',
  keyValue: richUser.document,
  createdAt: '2026-10-06T12:00:00.000Z',
  paidAt: null,
  note: null,
  cancellable: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  readSessionToken.mockResolvedValue('token-de-sessao');
});

describe('requestWithdrawalAction', () => {
  it('sem sessão ou sem banca, não processa nada', async () => {
    session(null);
    expect(await requestWithdrawalAction(valid)).toMatchObject({ ok: false, code: 'SESSION_INVALID' });

    resolveRequest.mockResolvedValue({ ok: false, hostname: null, message: 'sem banca' });
    expect(await requestWithdrawalAction(valid)).toMatchObject({ ok: false, code: 'SESSION_INVALID' });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('pedido inválido é recusado aqui mesmo, com a mensagem do problema', async () => {
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
    expect(await requestWithdrawalAction({ ...valid, keyValue: '111.444.777-35' })).toMatchObject({
      message: 'A chave CPF deve ser a do titular da conta.',
    });
    expect(await requestWithdrawalAction({ ...valid, amountCents: 30001 })).toMatchObject({
      message: 'Valor maior que o disponível para resgate',
    });
    expect(await requestWithdrawalAction({ ...valid, idempotencyKey: undefined })).toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('pedido válido vai à API com o tipo da API, a chave normalizada e a chave de idempotência', async () => {
    session(richUser);
    apiRequest.mockResolvedValue({ ok: true, status: 201, data: { withdrawal: created, wallet: richUser.wallet } });
    const result = await requestWithdrawalAction({ ...valid, keyValue: '529.982.247-25' });
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      'banca.test',
      'POST',
      '/v1/payments/withdrawals',
      { amountCents: 5000, keyType: 'CPF', keyValue: richUser.document, idempotencyKey: KEY },
      { sessionToken: 'token-de-sessao' },
    );
    expect(result).toMatchObject({
      ok: true,
      withdrawal: { id: created.id, status: 'PROCESSING', keyType: 'cpf' },
      wallet: richUser.wallet,
    });
  });

  it('recusa da API traz a mensagem dela; 401 encerra a sessão; o resto é indisponível', async () => {
    session(richUser);
    apiRequest.mockResolvedValueOnce({
      ok: false,
      status: 429,
      error: { statusCode: 429, code: 'TOO_MANY_ATTEMPTS', message: 'Você chegou ao limite de saques de hoje.' },
    });
    expect(await requestWithdrawalAction(valid)).toEqual({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'Você chegou ao limite de saques de hoje.',
    });
    apiRequest.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: { statusCode: 401, code: 'SESSION_INVALID', message: 'x' },
    });
    expect(await requestWithdrawalAction(valid)).toMatchObject({ code: 'SESSION_INVALID' });
    apiRequest.mockResolvedValueOnce({
      ok: false,
      status: 502,
      error: { statusCode: 502, code: 'INTERNAL_ERROR', message: 'x' },
    });
    expect(await requestWithdrawalAction(valid)).toMatchObject({ code: 'UNAVAILABLE' });
  });
});

describe('cancelWithdrawalAction', () => {
  it('só com id válido e sessão; chama a API do próprio jogador', async () => {
    expect(await cancelWithdrawalAction('../outro')).toMatchObject({ code: 'INVALID_REQUEST' });
    session(richUser);
    apiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      data: { withdrawal: { ...created, status: 'CANCELED' }, wallet: richUser.wallet },
    });
    expect(await cancelWithdrawalAction(created.id)).toMatchObject({ ok: true, withdrawal: { status: 'CANCELED' } });
    expect(apiRequest).toHaveBeenCalledWith(
      'banca.test',
      'POST',
      `/v1/payments/withdrawals/${created.id}/cancel`,
      {},
      { sessionToken: 'token-de-sessao' },
    );
  });
});
