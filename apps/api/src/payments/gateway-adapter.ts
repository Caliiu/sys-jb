import type { PaymentGatewayId } from '@sysjb/contracts';
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
}

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
