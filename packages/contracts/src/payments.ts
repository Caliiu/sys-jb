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
      '(depósitos) e WITHDRAW_CREATE (saques). BALANCE_READ é opcional e permite o teste mostrar o saldo.',
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
  /** Bônus de recarga que este depósito ganhou (centavos; 0 = nenhum). */
  bonusCents: number;
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

// ---------------------------------------------------------------------------
// Saques (Pix). O valor sai dos prêmios (loterias, depois cassino) na solicitação e volta se o saque não for pago.
// ---------------------------------------------------------------------------

/** Tela "Meus saques" do app do jogador (aberta pelos avisos de saque). */
export const WITHDRAWALS_PATH = '/saques';

/** Tipo da chave Pix de destino. CPF é sempre o do titular da conta. */
export const WITHDRAWAL_KEY_TYPES = ['CPF', 'EMAIL', 'PHONE', 'RANDOM'] as const;
export type WithdrawalKeyType = (typeof WITHDRAWAL_KEY_TYPES)[number];

/**
 * Situação completa (painel). REVIEW: aguarda o Gerente. QUEUED: aprovado, a enviar. SENDING: enviando ao gateway (sem
 * confirmação de que chegou lá). PROCESSING: no gateway. PAID: pago. FAILED: o gateway não pagou (valor devolvido).
 * REJECTED: recusado pelo Gerente (devolvido). CANCELED: cancelado pelo jogador em análise (devolvido).
 */
export const WITHDRAWAL_STATUSES = [
  'REVIEW',
  'QUEUED',
  'SENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'REJECTED',
  'CANCELED',
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];

/** Situação vista pelo jogador: fila, envio e gateway viram "Processando". */
export const PUBLIC_WITHDRAWAL_STATUSES = ['REVIEW', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELED'] as const;
export type PublicWithdrawalStatus = (typeof PUBLIC_WITHDRAWAL_STATUSES)[number];

export const publicWithdrawalStatus = (status: WithdrawalStatus): PublicWithdrawalStatus =>
  status === 'QUEUED' || status === 'SENDING' ? 'PROCESSING' : status;

/** Por que voltou para análise ou falhou (painel). */
export const WITHDRAWAL_FAILURE_REASONS = [
  'GATEWAY_REJECTED',
  'GATEWAY_AUTH',
  'NO_GATEWAY',
  'GATEWAY_FAILED',
  'MANUAL_NOT_PAID',
] as const;
export type WithdrawalFailureReason = (typeof WITHDRAWAL_FAILURE_REASONS)[number];

/** Faixa aceita na configuração da banca (o banco confere de novo). */
export const WITHDRAWAL_LIMITS = {
  /** R$ 1,00 a R$ 1.000.000,00 por saque. */
  minCents: 100,
  maxCents: 100_000_000,
  /** Até 50 saques por dia por jogador. */
  maxDailyCount: 50,
  /** Motivo da recusa: 3 a 200 caracteres. */
  noteMin: 3,
  noteMax: 200,
} as const;

/** Limites de saque da banca (Configurações > Pagamentos). Centavos. */
export interface WithdrawalSettings {
  /** false = saques pausados (ninguém solicita). */
  enabled: boolean;
  minCents: number;
  maxCents: number;
  /** Saques por jogador por dia (Brasília); cancelados, recusados e falhos não contam. */
  dailyCount: number;
  /** Até este valor o saque vai direto ao gateway; acima, o Gerente aprova. 0 = todos passam pela aprovação. */
  autoLimitCents: number;
}

// Jogador -----------------------------------------------------------------

export interface PublicWithdrawal {
  id: string;
  amountCents: number;
  status: PublicWithdrawalStatus;
  keyType: WithdrawalKeyType;
  /** Chave normalizada (CPF e celular só dígitos). */
  keyValue: string;
  /** ISO 8601. */
  createdAt: string;
  paidAt: string | null;
  /** Motivo da recusa informado pelo Gerente (só em REJECTED). */
  note: string | null;
  /** Pode cancelar agora (só em análise). */
  cancellable: boolean;
}

/** GET /v1/me/withdrawals: os saques recentes, quanto pode sacar e os limites de hoje. */
export interface MyWithdrawals {
  items: PublicWithdrawal[];
  /** Prêmios das loterias + prêmios do cassino (centavos). */
  withdrawableCents: number;
  limits: WithdrawalSettings & {
    /** Saques que já contam no limite de hoje. */
    usedToday: number;
  };
}

/** POST /v1/me/withdrawals. A mesma `idempotencyKey` devolve o mesmo saque (clique duplo, reenvio). */
export interface CreateWithdrawalRequest {
  amountCents: number;
  keyType: WithdrawalKeyType;
  keyValue: string;
  idempotencyKey: string;
}

/** Saque criado ou cancelado, com a carteira já atualizada. */
export interface WithdrawalResult {
  withdrawal: PublicWithdrawal;
  wallet: PublicWallet;
}

// Painel: Carteira > Saques --------------------------------------------------

export interface AdminWithdrawalListItem {
  id: string;
  createdAt: string;
  paidAt: string | null;
  user: { id: string; displayId: number; name: string };
  amountCents: number;
  /** De onde saiu: prêmios das loterias e do cassino. */
  fromPrizesJbCents: number;
  fromPrizesGamesCents: number;
  keyType: WithdrawalKeyType;
  keyValue: string;
  status: WithdrawalStatus;
  gateway: PaymentGatewayId | null;
  /** Id da transação no gateway (para conferir lá). */
  providerTransactionId: string | null;
  failureReason: WithdrawalFailureReason | null;
  /** Motivo da recusa. */
  note: string | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  /** Gerente que concluiu à mão um envio sem resposta. */
  resolvedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  /** Quem recebeu, segundo o gateway; null se não informado ou para perfil sem `payments.read`. */
  beneficiary: { name: string | null; document: string } | null;
  /** Quem recebeu é o titular (CPF do jogador)? null enquanto o gateway não informar. */
  beneficiaryMatches: boolean | null;
  /** O Gerente pode concluir à mão (envio sem resposta há 10 min, ou no gateway sem conclusão há 1 h). */
  resolvable: boolean;
}

export interface AdminWithdrawalList {
  items: AdminWithdrawalListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Soma dos saques pagos no filtro (centavos). */
  paidTotalCents: number;
}

/** Aprovar (vai para o gateway) ou recusar (devolve; motivo opcional, mostrado ao jogador). */
export interface ReviewWithdrawalRequest {
  approve: boolean;
  note?: string;
}

/** Conclusão manual, depois de conferir no painel do gateway: pago ou não pago (devolve). */
export interface ResolveWithdrawalRequest {
  paid: boolean;
}

// ---------------------------------------------------------------------------
// Bônus de recarga de Loterias
// ---------------------------------------------------------------------------

/**
 * Regras do bônus (cada recarga ganha no máximo um, o de maior valor; empate: nesta ordem):
 * - FIRST_DEPOSIT: primeira recarga de Loterias da conta;
 * - FEDERAL: primeira recarga de Loterias do dia em dia com sorteio da Federal na banca;
 * - DAILY: primeira recarga de Loterias do dia (Brasília).
 * O bônus vai para a bolsa de bônus: é gasto primeiro nas apostas de Loterias e Fazendinha, nunca é sacável e não
 * expira. Só recarga de Loterias, a partir do mínimo da banca.
 */
export const DEPOSIT_BONUS_RULES = ['FIRST_DEPOSIT', 'FEDERAL', 'DAILY'] as const;
export type DepositBonusRule = (typeof DEPOSIT_BONUS_RULES)[number];

export const DEPOSIT_BONUS_RULE_LABELS: Record<DepositBonusRule, string> = {
  FIRST_DEPOSIT: 'Primeira recarga',
  FEDERAL: 'Recarga do dia da Federal',
  DAILY: 'Primeira recarga do dia',
};

export const DEPOSIT_BONUS_LIMITS = {
  /** 100%. */
  maxBps: 10_000,
  /** Teto de cada regra: R$ 100.000,00. */
  maxCapCents: 10_000_000,
  /** Recarga mínima para ganhar: de R$ 1,00 a R$ 100.000,00. */
  minDepositMinCents: 100,
  minDepositMaxCents: 10_000_000,
} as const;

/** Uma regra: ativa (o interruptor; pausada mantém % e teto), % (centésimos) e teto do bônus (centavos). Ativa exige
 * % e teto maiores que zero. */
export interface DepositBonusRuleSettings {
  enabled: boolean;
  bps: number;
  maxCents: number;
}

/** Configurações > Personalização > Bônus. */
export interface DepositBonusSettings {
  /** Recarga mínima para ganhar bônus (centavos). */
  minDepositCents: number;
  firstDeposit: DepositBonusRuleSettings;
  daily: DepositBonusRuleSettings;
  federal: DepositBonusRuleSettings;
}

/** Regra (ativa) que vale agora para a próxima recarga de Loterias do jogador. */
export interface DepositBonusOffer {
  rule: DepositBonusRule;
  bps: number;
  maxCents: number;
}

/** GET /v1/payments/deposit-bonus: as regras que valem agora (na ordem de desempate) e a recarga mínima. */
export interface PublicDepositBonusOffers {
  offers: DepositBonusOffer[];
  minDepositCents: number;
}

/**
 * Bônus que uma recarga de Loterias de `amountCents` ganharia com as ofertas (o mesmo cálculo do banco): % do valor,
 * para baixo no centavo, limitado ao teto; o maior; null se nenhum (ou abaixo do mínimo).
 */
export function depositBonusFor(
  amountCents: number,
  { offers, minDepositCents }: PublicDepositBonusOffers,
): { rule: DepositBonusRule; amountCents: number } | null {
  if (!Number.isSafeInteger(amountCents) || amountCents < minDepositCents) return null;
  let best: { rule: DepositBonusRule; amountCents: number } | null = null;
  for (const offer of offers) {
    const value = Math.min(Math.floor((amountCents * offer.bps) / 10_000), offer.maxCents);
    // Empate: fica o primeiro (as ofertas vêm na ordem de desempate).
    if (value > 0 && (!best || value > best.amountCents)) best = { rule: offer.rule, amountCents: value };
  }
  return best;
}
