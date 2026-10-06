import { randomUUID } from 'node:crypto';
import { ResponseTooLargeError, providerMessage, readJsonLimited } from '../common/provider-http.js';
import type { GatewayCredentials } from './credentials-box.js';
import type { WithdrawalKeyType } from '@sysjb/contracts';
import {
  type ChargeInput,
  type ChargeResult,
  type CheckedCharge,
  type CheckedPayout,
  GatewayError,
  type GatewayTestResult,
  type PaymentGatewayAdapter,
  type PayoutInput,
  type PayoutResult,
  type WebhookPayer,
} from './gateway-adapter.js';

export interface MisticPayOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** A resposta da criação traz o QR em base64 (algumas dezenas de KB); as outras são pequenas. */
const CREATE_MAX_BYTES = 512_000;
const SMALL_MAX_BYTES = 64_000;
/** Maior valor aceito vindo do gateway: R$ 1 bilhão (em centavos), muito acima do teto do depósito. */
const MAX_CENTS = 100_000_000_000;
const PROVIDER_ID = /^[\x21-\x7e]{1,128}$/;
/** Busca de um saque sem resposta: até 3 páginas de 50 saídas recentes. */
const FIND_PAGES = 3;
const FIND_PAGE_SIZE = 50;

/** Tipo da chave como a MisticPay chama. */
const PIX_KEY_TYPE: Readonly<Record<WithdrawalKeyType, string>> = {
  CPF: 'CPF',
  EMAIL: 'EMAIL',
  PHONE: 'TELEFONE',
  RANDOM: 'CHAVE_ALEATORIA',
};

/**
 * Chave "sem formatação", como a MisticPay pede. Celular no formato do DICT (+55 e DDD): a documentação não traz
 * exemplo de celular, então confira com um saque de valor baixo antes de liberar para os jogadores.
 */
export const misticPayPixKey = (type: WithdrawalKeyType, value: string) => (type === 'PHONE' ? `+55${value}` : value);

/** Reais (número ou texto numérico, com casas decimais — como a MisticPay documenta) -> centavos; null se inválido. */
export function reaisToCents(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  const cents = Math.round(n * 100);
  return cents <= MAX_CENTS ? cents : null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const idText = (value: unknown): string | null => {
  const text =
    typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : '';
  return PROVIDER_ID.test(text) ? text : null;
};

/**
 * MisticPay (https://docs.misticpay.com/): chave de acesso pk_/sk_ no cabeçalho Authorization Basic. Valores em reais
 * com casas decimais. Sem ambiente de testes (validar em produção com valores baixos). Os avisos (webhooks) não são
 * assinados: por isso o pagamento só vale depois de conferido aqui em /transactions/check.
 */
export class MisticPayGateway implements PaymentGatewayAdapter {
  readonly id = 'MISTICPAY' as const;

  constructor(
    private readonly baseUrl: URL,
    private readonly options: MisticPayOptions = {},
  ) {}

  private async call(
    credentials: GatewayCredentials,
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    maxBytes: number,
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(path, this.baseUrl);
    const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`, 'utf8').toString('base64');
    let res: Response;
    try {
      res = await (this.options.fetchImpl ?? fetch)(url, {
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        // Redirecionamento poderia levar as credenciais para outro host.
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
      });
    } catch {
      throw new GatewayError('MisticPay fora do ar ou sem resposta', 'unavailable');
    }
    try {
      return { status: res.status, body: await readJsonLimited(res, maxBytes) };
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        throw new GatewayError('MisticPay: resposta grande demais', 'invalid_response', res.status);
      }
      throw new GatewayError('MisticPay: resposta ilegível', 'invalid_response', res.status);
    }
  }

  /** Erro HTTP do gateway -> GatewayError (mensagem curta do gateway, sem dados do pedido). */
  private fail(status: number, body: unknown, action: string): never {
    const detail = providerMessage(body);
    const suffix = detail ? `: ${detail}` : '';
    if (status === 401 || status === 403) {
      throw new GatewayError(`MisticPay recusou as credenciais ao ${action} (HTTP ${status})${suffix}`, 'auth', status);
    }
    if (status === 429 || status >= 500) {
      throw new GatewayError(`MisticPay indisponível ao ${action} (HTTP ${status})`, 'unavailable', status);
    }
    throw new GatewayError(`MisticPay recusou ao ${action} (HTTP ${status})${suffix}`, 'rejected', status);
  }

  async createCharge(credentials: GatewayCredentials, input: ChargeInput): Promise<ChargeResult> {
    const res = await this.call(
      credentials,
      'POST',
      'transactions/create',
      {
        amount: input.amountCents / 100,
        payerName: input.payerName,
        payerDocument: input.payerDocument,
        transactionId: input.depositId,
        description: input.description,
        ...(input.webhookUrl ? { projectWebhook: input.webhookUrl } : {}),
      },
      CREATE_MAX_BYTES,
    );
    if (res.status < 200 || res.status >= 300) this.fail(res.status, res.body, 'criar a cobrança');
    const data = record(record(res.body)?.data);
    const providerTransactionId = idText(data?.transactionId);
    const pixCode = typeof data?.copyPaste === 'string' ? data.copyPaste.trim() : '';
    // BR Code começa pelo indicador de formato "000201"; sem controle e de tamanho razoável.
    if (!providerTransactionId || !/^000201[^\p{Cc}]{14,1018}$/u.test(pixCode)) {
      throw new GatewayError('MisticPay: cobrança criada fora do formato', 'invalid_response', res.status);
    }
    return { providerTransactionId, pixCode };
  }

  async check(credentials: GatewayCredentials, depositId: string): Promise<CheckedCharge> {
    const res = await this.call(
      credentials,
      'POST',
      'transactions/check',
      { transactionId: depositId },
      SMALL_MAX_BYTES,
    );
    if (res.status === 404) return { state: 'NOT_FOUND' };
    if (res.status < 200 || res.status >= 300) this.fail(res.status, res.body, 'consultar a cobrança');
    const transaction = record(record(res.body)?.transaction);
    const state = typeof transaction?.transactionState === 'string' ? transaction.transactionState.toUpperCase() : '';
    const type = typeof transaction?.transactionType === 'string' ? transaction.transactionType.toUpperCase() : '';
    // Só depósito: o id consultado é sempre de um depósito nosso, mas qualquer outra coisa é recusada.
    if (!transaction || type !== 'DEPOSITO') {
      throw new GatewayError('MisticPay: consulta fora do formato', 'invalid_response', res.status);
    }
    if (state === 'PENDENTE') return { state: 'PENDING' };
    if (state === 'FALHA' || state === 'CANCELADO') return { state: 'CANCELED' };
    if (state === 'COMPLETO') {
      const paidCents = reaisToCents(transaction.value);
      if (paidCents === null) throw new GatewayError('MisticPay: valor pago ilegível', 'invalid_response', res.status);
      return { state: 'PAID', paidCents };
    }
    throw new GatewayError('MisticPay: situação desconhecida na consulta', 'invalid_response', res.status);
  }

  /**
   * Quem pagou, pelo aviso de depósito (`clientDocument` = CPF/CNPJ de quem efetivamente pagou, `clientName`).
   * Documento mascarado ou fora do formato = desconhecido (o depósito fica em análise se o pagamento não for conferido).
   */
  parseWebhook(body: unknown): WebhookPayer | null {
    const data = record(body);
    if (!data || String(data.transactionType ?? '').toUpperCase() !== 'DEPOSITO') return null;
    const providerTransactionId = idText(data.transactionId);
    const raw = typeof data.clientDocument === 'string' ? data.clientDocument.trim() : '';
    // Só dígitos e a pontuação usual; asterisco ou outra coisa (mascarado) = desconhecido.
    if (!providerTransactionId || !/^[0-9./ -]{11,20}$/.test(raw)) return null;
    const document = raw.replace(/\D/g, '');
    if (document.length !== 11 && document.length !== 14) return null;
    const name =
      typeof data.clientName === 'string'
        ? data.clientName
            .replace(/\p{Cc}/gu, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120) || null
        : null;
    return { providerTransactionId, document, name };
  }

  async createPayout(credentials: GatewayCredentials, input: PayoutInput): Promise<PayoutResult> {
    const res = await this.call(
      credentials,
      'POST',
      'transactions/withdraw',
      {
        amount: input.amountCents / 100,
        pixKey: misticPayPixKey(input.keyType, input.keyValue),
        pixKeyType: PIX_KEY_TYPE[input.keyType],
        description: input.description,
        ...(input.webhookUrl ? { projectWebhook: input.webhookUrl } : {}),
      },
      SMALL_MAX_BYTES,
    );
    if (res.status < 200 || res.status >= 300) this.fail(res.status, res.body, 'enviar o saque');
    const providerTransactionId = idText(record(record(res.body)?.data)?.transactionId);
    // Aceito sem id legível: o saque pode existir lá; quem chama trata como envio sem resposta (procura depois).
    if (!providerTransactionId) {
      throw new GatewayError('MisticPay: saque aceito fora do formato', 'invalid_response', res.status);
    }
    return { providerTransactionId };
  }

  async checkPayout(credentials: GatewayCredentials, providerTransactionId: string): Promise<CheckedPayout> {
    const res = await this.call(
      credentials,
      'POST',
      'transactions/check',
      { transactionId: providerTransactionId },
      SMALL_MAX_BYTES,
    );
    if (res.status === 404) return { state: 'NOT_FOUND' };
    if (res.status < 200 || res.status >= 300) this.fail(res.status, res.body, 'consultar o saque');
    const transaction = record(record(res.body)?.transaction);
    const state = typeof transaction?.transactionState === 'string' ? transaction.transactionState.toUpperCase() : '';
    const type = typeof transaction?.transactionType === 'string' ? transaction.transactionType.toUpperCase() : '';
    // Só saída: o id consultado é sempre de um saque nosso, mas qualquer outra coisa é recusada.
    if (!transaction || type !== 'RETIRADA') {
      throw new GatewayError('MisticPay: consulta de saque fora do formato', 'invalid_response', res.status);
    }
    if (state === 'PENDENTE') return { state: 'PENDING' };
    if (state === 'FALHA' || state === 'CANCELADO') return { state: 'FAILED' };
    if (state === 'COMPLETO') return { state: 'PAID', beneficiary: beneficiaryOf(transaction.beneficiary) };
    throw new GatewayError('MisticPay: situação desconhecida no saque', 'invalid_response', res.status);
  }

  async findPayout(credentials: GatewayCredentials, withdrawalId: string): Promise<string | null> {
    for (let page = 1; page <= FIND_PAGES; page += 1) {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(FIND_PAGE_SIZE),
        type: 'saida',
        search: withdrawalId,
      });
      const res = await this.call(credentials, 'GET', `transactions/list?${query}`, undefined, CREATE_MAX_BYTES);
      if (res.status < 200 || res.status >= 300) this.fail(res.status, res.body, 'procurar o saque');
      const items = listItems(res.body);
      for (const item of items) {
        const description = typeof item.description === 'string' ? item.description : '';
        if (description.includes(withdrawalId)) return idText(item.id ?? item.transactionId);
      }
      if (items.length < FIND_PAGE_SIZE) return null;
    }
    return null;
  }

  /**
   * Confere as credenciais: consulta uma transação que não existe (precisa do escopo TRANSACTION_READ, o mesmo da
   * confirmação dos depósitos) e, se a chave permitir, o saldo (BALANCE_READ, opcional).
   */
  async test(credentials: GatewayCredentials): Promise<GatewayTestResult> {
    try {
      const probe = await this.call(
        credentials,
        'POST',
        'transactions/check',
        { transactionId: `teste-${randomUUID()}` },
        SMALL_MAX_BYTES,
      );
      if (probe.status === 401)
        return { ok: false, message: 'Credenciais recusadas pela MisticPay.', balanceCents: null };
      if (probe.status === 403) {
        return {
          ok: false,
          message: 'A chave não tem o escopo TRANSACTION_READ (necessário para confirmar os depósitos).',
          balanceCents: null,
        };
      }
      if (probe.status === 429 || probe.status >= 500) {
        return { ok: false, message: 'MisticPay indisponível agora. Tente de novo.', balanceCents: null };
      }

      const balance = await this.call(credentials, 'GET', 'users/balance', undefined, SMALL_MAX_BYTES);
      const cents =
        balance.status >= 200 && balance.status < 300
          ? reaisToCents(record(record(balance.body)?.data)?.balance)
          : null;
      return { ok: true, message: 'Conexão com a MisticPay funcionando.', balanceCents: cents };
    } catch (error) {
      if (error instanceof GatewayError) {
        return { ok: false, message: 'Não foi possível falar com a MisticPay. Tente de novo.', balanceCents: null };
      }
      throw error;
    }
  }
}

/** Itens da listagem (a documentação não fixa o envelope: aceita os formatos usuais). */
function listItems(body: unknown): Array<Record<string, unknown>> {
  const root = record(body);
  const data = root?.data;
  const candidates = [data, record(data)?.items, record(data)?.transactions, record(data)?.data, root?.transactions];
  const list = candidates.find(Array.isArray) as unknown[] | undefined;
  return (list ?? []).map(record).filter((item): item is Record<string, unknown> => item !== null);
}

/** Quem recebeu (CPF/CNPJ só dígitos e nome curto); null se o gateway não informar ou vier mascarado. */
function beneficiaryOf(value: unknown): { document: string; name: string | null } | null {
  const data = record(value);
  const raw = typeof data?.document === 'string' ? data.document.trim() : '';
  if (!/^[0-9./ -]{11,20}$/.test(raw)) return null;
  const document = raw.replace(/\D/g, '');
  if (document.length !== 11 && document.length !== 14) return null;
  const name =
    typeof data?.name === 'string'
      ? data.name
          .replace(/\p{Cc}/gu, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120) || null
      : null;
  return { document, name };
}
