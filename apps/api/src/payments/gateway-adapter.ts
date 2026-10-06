import type { PaymentGatewayId, WithdrawalKeyType } from '@sysjb/contracts';
import type { GatewayCredentials } from './credentials-box.js';

/**
 * Contrato de um gateway de pagamento. Cada gateway (MisticPay, e os próximos) implementa estas três operações; o resto
 * do sistema (depósitos, painel) não conhece detalhes de nenhum deles.
 */
export interface PaymentGatewayAdapter {
  readonly id: PaymentGatewayId;
  /** Cria a cobrança Pix. O id do depósito vai como identificador da transação no gateway. */
  createCharge(credentials: GatewayCredentials, input: ChargeInput): Promise<ChargeResult>;
  /** Situação da cobrança no gateway, pelo id do depósito. É a única fonte aceita para creditar. */
  check(credentials: GatewayCredentials, depositId: string): Promise<CheckedCharge>;
  /** "Testar conexão" do painel. */
  test(credentials: GatewayCredentials): Promise<GatewayTestResult>;
  /**
   * Quem pagou, lido do aviso (webhook) de depósito; null se o aviso não traz um CPF/CNPJ legível. A API só usa isto
   * com o endereço do aviso assinado e a transação do aviso igual à do depósito.
   */
  parseWebhook(body: unknown): WebhookPayer | null;

  /**
   * Envia um saque (Pix para a chave). O gateway NÃO recebe um id nosso: repetir o envio pode pagar duas vezes. Por isso
   * só se chama uma vez por saque (a situação SENDING garante), e a falha sem resposta não é repetida.
   */
  createPayout(credentials: GatewayCredentials, input: PayoutInput): Promise<PayoutResult>;
  /** Situação do saque no gateway, pelo id da transação de lá. É a única fonte aceita para concluir. */
  checkPayout(credentials: GatewayCredentials, providerTransactionId: string): Promise<CheckedPayout>;
  /**
   * Procura no gateway um saque cujo envio ficou sem resposta (pela descrição, que leva o id do saque). Devolve o id da
   * transação de lá, ou null se não achou.
   */
  findPayout(credentials: GatewayCredentials, withdrawalId: string): Promise<string | null>;
}

export interface PayoutInput {
  withdrawalId: string;
  amountCents: number;
  keyType: WithdrawalKeyType;
  /** Chave normalizada (CPF e celular só dígitos; e-mail e aleatória em minúsculas). */
  keyValue: string;
  /** Texto da transação no gateway; leva o id do saque (é por ele que findPayout procura). */
  description: string;
  /** Endereço do aviso (webhook) deste saque; null = sem aviso (a rodada automática confere). */
  webhookUrl: string | null;
}

export interface PayoutResult {
  providerTransactionId: string;
}

export type CheckedPayout =
  | { state: 'PENDING' }
  /** Pago: quem recebeu, segundo o gateway (null se ele não informar). */
  | { state: 'PAID'; beneficiary: { document: string; name: string | null } | null }
  /** O gateway não conseguiu pagar (chave inexistente, banco recusou...). */
  | { state: 'FAILED' }
  | { state: 'NOT_FOUND' };

export interface WebhookPayer {
  /** Id da transação no gateway (tem de ser o do depósito). */
  providerTransactionId: string;
  /** CPF (11) ou CNPJ (14), só dígitos. */
  document: string;
  name: string | null;
}

export interface ChargeInput {
  depositId: string;
  amountCents: number;
  payerName: string;
  /** CPF, só dígitos. */
  payerDocument: string;
  description: string;
  /** Endereço do aviso (webhook) deste depósito; null = sem aviso (a conferência fica com a tela e a rodada). */
  webhookUrl: string | null;
}

export interface ChargeResult {
  providerTransactionId: string;
  /** BR Code "copia e cola". */
  pixCode: string;
}

export type CheckedCharge =
  | { state: 'PENDING' }
  /** Pago: valor efetivamente recebido, em centavos. */
  | { state: 'PAID'; paidCents: number }
  /** Recusada, falhou ou cancelada no gateway. */
  | { state: 'CANCELED' }
  /** O gateway não conhece a transação (a criação falhou antes de chegar lá). */
  | { state: 'NOT_FOUND' };

export interface GatewayTestResult {
  ok: boolean;
  message: string;
  balanceCents: number | null;
}

/**
 * Falha ao falar com o gateway, com mensagem segura para log (nunca credenciais, CPF ou corpo).
 * - auth: credenciais recusadas (401/403);
 * - unavailable: fora do ar, sem resposta, limite de requisições ou erro do servidor dele (tentar de novo depois);
 * - rejected: o gateway recusou o pedido (4xx);
 * - invalid_response: respondeu fora do formato documentado.
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'unavailable' | 'rejected' | 'invalid_response',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
