/**
 * Pagamentos: gateways da banca (Configurações > Pagamentos) e depósitos via Pix (Recarga Pix e Carteira > Depósitos).
 * Valores em centavos. Credenciais nunca saem da API: o painel recebe só se estão configuradas e uma pista.
 */
import type { PublicWallet } from './index.js';

export const PAYMENT_GATEWAYS = ['MISTICPAY'] as const;
export type PaymentGatewayId = (typeof PAYMENT_GATEWAYS)[number];

export interface PaymentGatewayInfo {
  label: string;
  /** Documentação do gateway (link no painel). */
  docsUrl: string;
  /** Nomes dos campos da credencial como o gateway os chama. */
  clientIdLabel: string;
  clientSecretLabel: string;
  /** O que precisa estar liberado na chave do gateway (texto de ajuda no painel). */
  requirements: string;
}

export const PAYMENT_GATEWAY_INFO: Readonly<Record<PaymentGatewayId, PaymentGatewayInfo>> = {
  MISTICPAY: {
    label: 'MisticPay',
    docsUrl: 'https://docs.misticpay.com/',
    clientIdLabel: 'Client ID (pk_…)',
    clientSecretLabel: 'Client Secret (sk_…)',
    requirements:
      'Crie uma chave de acesso em API → Chaves de Acesso com os escopos TRANSACTION_CREATE e TRANSACTION_READ ' +
      '(BALANCE_READ é opcional e permite o teste mostrar o saldo).',
  },
};

/** Formato da credencial (só caracteres visíveis, sem espaço); o gateway confere de verdade no "Testar conexão". */
export const PAYMENT_CREDENTIAL_PATTERN = /^[\x21-\x7e]{8,256}$/;

/** Onde o crédito do depósito entra: saldo de loterias ou saldo de games. */
export const DEPOSIT_DESTINATIONS = ['LOTTERIES', 'GAMES'] as const;
export type DepositDestination = (typeof DEPOSIT_DESTINATIONS)[number];

/**
 * PENDING: aguardando o pagamento (ou, pago, aguardando o aviso de quem pagou). PAID: pago e creditado. EXPIRED: o
 * prazo passou sem pagamento confirmado. CANCELED: o gateway recusou ou cancelou. REVIEW: pago, mas por outro titular
 * (ou sem o aviso de quem pagou): só credita se o Gerente liberar. REJECTED: o Gerente recusou (devolução fora do
 * sistema). Pagamento confirmado depois do prazo segue as mesmas regras.
 */
export const DEPOSIT_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELED', 'REVIEW', 'REJECTED'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

/** Por que o depósito está em análise: pago por outro CPF/CNPJ, ou o aviso de quem pagou não chegou. */
export const DEPOSIT_REVIEW_REASONS = ['PAYER_MISMATCH', 'PAYER_UNKNOWN'] as const;
export type DepositReviewReason = (typeof DEPOSIT_REVIEW_REASONS)[number];

export const DEPOSIT_LIMITS = {
  /** R$ 1,00. */
  minCents: 100,
  /** R$ 10.000,00 (mesmo teto da tela de recarga e do banco). */
  maxCents: 1_000_000,
  /** Prazo mostrado ao jogador para pagar (segundos). */
  expiresInSeconds: 15 * 60,
} as const;

// ---------------------------------------------------------------------------
// Jogador (Recarga Pix)
// ---------------------------------------------------------------------------

export interface CreateDepositRequest {
  amountCents: number;
  destination: DepositDestination;
}

/** Cobrança Pix pronta para o jogador pagar. */
export interface PublicDeposit {
  id: string;
  amountCents: number;
  destination: DepositDestination;
  status: DepositStatus;
  /** BR Code "copia e cola" (o mesmo texto vira o QR Code). */
  pixCode: string;
  /** ISO 8601: prazo para pagar. */
  expiresAt: string;
  /** ISO 8601; null enquanto não pago. */
  paidAt: string | null;
  createdAt: string;
}

/** Situação do depósito consultada pela tela; com a carteira atualizada quando já pago. */
export interface PublicDepositStatus {
  deposit: PublicDeposit;
  /** Carteira depois do crédito (só quando PAID). */
  wallet: PublicWallet | null;
}

// ---------------------------------------------------------------------------
// Painel: Configurações > Pagamentos
// ---------------------------------------------------------------------------

export interface AdminPaymentGateway {
  gateway: PaymentGatewayId;
  configured: boolean;
  active: boolean;
  /** Pista da credencial gravada (ex.: "pk_…ab12"); null se não configurado. */
  credentialsHint: string | null;
  /** ISO 8601 da última alteração; null se não configurado. */
  updatedAt: string | null;
  /** Operador que alterou por último. */
  updatedBy: { id: string; name: string } | null;
}

export interface AdminPaymentSettings {
  /** false: o servidor está sem PAYMENTS_SECRET_KEY (não dá para gravar nem usar credenciais). */
  available: boolean;
  gateways: AdminPaymentGateway[];
}

/** Grava as credenciais do gateway (substitui as anteriores); `activate` já o deixa como o gateway da banca. */
export interface SavePaymentGatewayRequest {
  clientId: string;
  clientSecret: string;
  activate: boolean;
}

export interface SetPaymentGatewayActiveRequest {
  active: boolean;
}

/** "Testar conexão": as credenciais gravadas funcionam no gateway? */
export interface PaymentGatewayTestResult {
  ok: boolean;
  message: string;
  /** Saldo da conta no gateway (centavos), quando a chave permite consultar. */
  balanceCents: number | null;
}

// ---------------------------------------------------------------------------
// Painel: Carteira > Depósitos
// ---------------------------------------------------------------------------

export interface AdminDepositListItem {
  id: string;
  createdAt: string;
  paidAt: string | null;
  user: { id: string; displayId: number; name: string };
  gateway: PaymentGatewayId;
  destination: DepositDestination;
  amountCents: number;
  status: DepositStatus;
  /**
   * Quem pagou (do aviso do gateway); null enquanto não informado ou para perfil sem `payments.read` (dado de
   * terceiro: esses perfis veem só `payerMatches`).
   */
  payer: { name: string | null; document: string } | null;
  /** O CPF do pagador é o do jogador? null enquanto não informado. */
  payerMatches: boolean | null;
  reviewReason: DepositReviewReason | null;
  /** Gerente que liberou ou recusou (depósito em análise), e quando. */
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
}

/** Decisão do Gerente sobre um depósito em análise. */
export interface ReviewDepositRequest {
  approve: boolean;
}

export interface AdminDepositList {
  items: AdminDepositListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Soma dos depósitos pagos no filtro (centavos). */
  paidTotalCents: number;
}
