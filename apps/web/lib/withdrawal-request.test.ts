import { describe, expect, it } from 'vitest';
import { MIN_WITHDRAWAL_CENTS, parseWithdrawalRequest } from './withdrawal';

const DOC = '52998224725';
const RANDOM = '123e4567-e89b-42d3-a456-426614174000';
const AVAILABLE = 30000; // R$ 300,00

const parse = (input: unknown, available = AVAILABLE) => parseWithdrawalRequest(input, DOC, available);

describe('parseWithdrawalRequest', () => {
  it('aceita um pedido válido e devolve a chave normalizada', () => {
    expect(parse({ keyType: 'cpf', keyValue: '529.982.247-25', amountCents: 5000 })).toEqual({
      ok: true,
      request: { keyType: 'cpf', keyValue: DOC, amountCents: 5000 },
    });
    expect(parse({ keyType: 'email', keyValue: ' Ana@Example.COM ', amountCents: 100 })).toMatchObject({
      ok: true,
      request: { keyValue: 'ana@example.com' },
    });
    expect(parse({ keyType: 'phone', keyValue: '(11) 91234-5678', amountCents: 100 })).toMatchObject({
      ok: true,
      request: { keyValue: '11912345678' },
    });
    expect(parse({ keyType: 'random', keyValue: RANDOM.toUpperCase(), amountCents: 100 })).toMatchObject({
      ok: true,
      request: { keyValue: RANDOM },
    });
  });

  it('aceita exatamente o mínimo e exatamente o disponível', () => {
    expect(parse({ keyType: 'cpf', keyValue: DOC, amountCents: MIN_WITHDRAWAL_CENTS }).ok).toBe(true);
    expect(parse({ keyType: 'cpf', keyValue: DOC, amountCents: AVAILABLE }).ok).toBe(true);
  });

  it('rejeita entrada que não é um objeto', () => {
    for (const input of [null, undefined, 'x', 5000, true, []]) {
      expect(parse(input), String(input)).toEqual({ ok: false, message: 'Pedido de saque inválido.' });
    }
  });

  it('rejeita tipo de chave, chave ou valor com o tipo errado', () => {
    const invalid: Array<Record<string, unknown>> = [
      { keyValue: DOC, amountCents: 5000 },
      { keyType: 'outro', keyValue: DOC, amountCents: 5000 },
      { keyType: ['cpf'], keyValue: DOC, amountCents: 5000 },
      { keyType: 'cpf', amountCents: 5000 },
      { keyType: 'cpf', keyValue: 123, amountCents: 5000 },
      { keyType: 'cpf', keyValue: 'x'.repeat(201), amountCents: 5000 },
      { keyType: 'cpf', keyValue: DOC },
      { keyType: 'cpf', keyValue: DOC, amountCents: '5000' },
      { keyType: 'cpf', keyValue: DOC, amountCents: 50.5 },
      { keyType: 'cpf', keyValue: DOC, amountCents: NaN },
      { keyType: 'cpf', keyValue: DOC, amountCents: Infinity },
      { keyType: 'cpf', keyValue: DOC, amountCents: Number.MAX_SAFE_INTEGER + 2 },
    ];
    for (const input of invalid) {
      expect(parse(input).ok, JSON.stringify(input)).toBe(false);
    }
  });

  it('a chave CPF só vale se for a do titular (não dá para sacar para o CPF de outra pessoa)', () => {
    expect(parse({ keyType: 'cpf', keyValue: '111.444.777-35', amountCents: 5000 })).toEqual({
      ok: false,
      message: 'A chave CPF deve ser a do titular da conta.',
    });
  });

  it('chaves de outros tipos precisam ter o formato do tipo', () => {
    expect(parse({ keyType: 'email', keyValue: 'sem-arroba', amountCents: 5000 })).toMatchObject({ ok: false });
    expect(parse({ keyType: 'phone', keyValue: '123', amountCents: 5000 })).toMatchObject({ ok: false });
    expect(parse({ keyType: 'random', keyValue: 'curta', amountCents: 5000 })).toMatchObject({ ok: false });
  });

  it('o valor é conferido contra o disponível de AGORA, não contra o que a tela achava', () => {
    expect(parse({ keyType: 'cpf', keyValue: DOC, amountCents: AVAILABLE + 1 })).toEqual({
      ok: false,
      message: 'Valor maior que o disponível para resgate',
    });
    // Saldo livre zerado no servidor: nenhum valor passa, mesmo que o navegador tenha mostrado saldo.
    expect(parse({ keyType: 'cpf', keyValue: DOC, amountCents: 1000 }, 0).ok).toBe(false);
  });

  it('abaixo do mínimo, zero e negativo são recusados', () => {
    expect(parse({ keyType: 'cpf', keyValue: DOC, amountCents: MIN_WITHDRAWAL_CENTS - 1 })).toEqual({
      ok: false,
      message: 'Valor mínimo para saque: R$ 1,00',
    });
    expect(parse({ keyType: 'cpf', keyValue: DOC, amountCents: 0 }).ok).toBe(false);
    expect(parse({ keyType: 'cpf', keyValue: DOC, amountCents: -100 }).ok).toBe(false);
  });

  it('campos extras são ignorados: só chave e valor entram no pedido', () => {
    const result = parse({ keyType: 'cpf', keyValue: DOC, amountCents: 5000, userId: 'outro', status: 'PAID' });
    expect(result).toEqual({ ok: true, request: { keyType: 'cpf', keyValue: DOC, amountCents: 5000 } });
  });
});
