import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import {
  type AdminWithdrawalList,
  type AdminWithdrawalListItem,
  type MyWithdrawals,
  type PaymentGatewayId,
  type PublicWithdrawal,
  type WithdrawalFailureReason,
  type WithdrawalKeyType,
  type WithdrawalResult,
  type WithdrawalSettings,
  type WithdrawalStatus,
  WITHDRAWALS_PATH,
  publicWithdrawalStatus,
} from '@sysjb/contracts';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import type { UserSession } from '../auth/session.types.js';
import { AppError, Errors } from '../common/app-error.js';
import { hasSqlState } from '../common/prisma-errors.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import { PushService } from '../push/push.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toPublicWallet } from '../users/user.mapper.js';
import { publicDomain } from './deposits.service.js';
import { GatewayError } from './gateway-adapter.js';
import { PaymentGatewaysService } from './payment-gateways.service.js';
import type { CreateWithdrawalInput, ListWithdrawalsQuery, WithdrawalSettingsInput } from './withdrawals.schemas.js';

/** "Meus saques": os 50 mais recentes. */
const PLAYER_LIST_LIMIT = 50;
/** Saques movidos por rodada automática, por banca. */
const SWEEP_BATCH = 50;
const DAY_MS = 24 * 60 * 60_000;
/** Mesmos prazos da conclusão manual no banco (pix_withdrawal_resolve). */
const RESOLVE_SENDING_MS = 10 * 60_000;
const RESOLVE_PROCESSING_MS = 60 * 60_000;

/** Padrão quando a banca ainda não gravou limites (o mesmo do banco). */
const DEFAULT_SETTINGS: WithdrawalSettings = {
  enabled: true,
  minCents: 1000,
  maxCents: 500000,
  dailyCount: 3,
  autoLimitCents: 20000,
};

const withdrawalNotFound = () => new AppError(404, 'NOT_FOUND', 'Saque não encontrado.');

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Avisos no app instalado. Mesma tag por saque: o "pago" substitui o "solicitado" (não empilha). Só o valor e a
 * situação; nunca a chave Pix. O aviso do pedido também alerta o titular se não foi ele (conta usada por outra pessoa).
 */
export function withdrawalPush(
  event: 'requested' | 'paid',
  withdrawal: { id: string; amountCents: number; status: WithdrawalStatus },
) {
  const amount = brl.format(withdrawal.amountCents / 100);
  const tag = `withdrawal:${withdrawal.id}`;
  if (event === 'paid') {
    return { title: 'Saque pago', body: `${amount} enviado via Pix para a sua chave.`, url: WITHDRAWALS_PATH, tag };
  }
  const situation = withdrawal.status === 'REVIEW' ? 'está em análise pela banca' : 'está sendo processado';
  return {
    title: 'Saque solicitado',
    body: `Seu saque de ${amount} ${situation}. Não foi você? Troque sua senha e fale com o suporte.`,
    url: WITHDRAWALS_PATH,
    tag,
  };
}

/** Falhas das funções do banco (pix_withdrawal_*), com mensagens para o jogador ou o painel. */
function translate(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (hasSqlState(error, 'SJ001')) {
    throw new AppError(409, 'INSUFFICIENT_FUNDS', 'Saldo de prêmios insuficiente para este saque.');
  }
  if (hasSqlState(error, 'SJ013')) {
    throw new AppError(409, 'CONFLICT', 'Este pedido já foi enviado com outros dados. Atualize a página.');
  }
  if (hasSqlState(error, 'SJ014')) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Saques pausados no momento. Tente novamente mais tarde.');
  }
  if (hasSqlState(error, 'SJ015')) throw new AppError(400, 'VALIDATION_ERROR', 'Valor fora dos limites de saque.');
  if (hasSqlState(error, 'SJ016')) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Você chegou ao limite de saques de hoje. Tente amanhã.');
  }
  if (hasSqlState(error, 'SJ017')) {
    throw new AppError(409, 'CONFLICT', 'A situação deste saque mudou. Atualize a página.');
  }
  if (hasSqlState(error, 'SJ018')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A chave CPF deve ser a do titular da conta.');
  }
  if (hasSqlState(error, 'SJ019')) throw Errors.accountBlocked();
  if (hasSqlState(error, 'P0002')) throw withdrawalNotFound();
  if (hasSqlState(error, '42501')) throw Errors.permissionDenied();
  throw error;
}

interface WithdrawalRow {
  id: string;
  amountCents: bigint;
  status: string;
  keyType: string;
  keyValue: string;
  decisionNote: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

const PUBLIC_SELECT = {
  id: true,
  amountCents: true,
  status: true,
  keyType: true,
  keyValue: true,
  decisionNote: true,
  paidAt: true,
  createdAt: true,
} as const;

function toPublicWithdrawal(row: WithdrawalRow): PublicWithdrawal {
  const status = row.status as WithdrawalStatus;
  return {
    id: row.id,
    amountCents: Number(row.amountCents),
    status: publicWithdrawalStatus(status),
    keyType: row.keyType as WithdrawalKeyType,
    keyValue: row.keyValue,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    note: status === 'REJECTED' ? row.decisionNote : null,
    cancellable: status === 'REVIEW',
  };
}

/** Início do dia em Brasília (sempre -03:00, sem horário de verão). */
function brasiliaDayStart(now: Date): Date {
  const local = new Date(now.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 10);
  return new Date(`${local}T00:00:00-03:00`);
}

/**
 * Saques via Pix. O pedido reserva o valor na carteira (prêmios das loterias, depois do cassino) e, até o limite
 * automático da banca, vai direto para o gateway; acima, espera o Gerente. Todo movimento de dinheiro e toda passagem de
 * situação é de uma função do banco, com o saque travado.
 *
 * Envio: o gateway (MisticPay) não aceita um id nosso, então reenviar pode pagar duas vezes. O saque passa a SENDING
 * antes de chamar o gateway (só um envio por saque) e:
 *  - aceito: PROCESSING com o id de lá;
 *  - recusado com certeza (credencial, pedido inválido): volta para análise; limite de requisições (429): volta à fila;
 *  - sem resposta (fora do ar, tempo esgotado, resposta ilegível): fica SENDING. A rodada procura o saque no gateway
 *    pela descrição (que leva o id); sem achar, o Gerente conclui à mão depois de conferir no painel do gateway.
 * Conclusão (pago/falhou) só depois de consultar a transação no próprio gateway: o aviso (webhook) só dispara a
 * consulta. A rodada automática também confere os pendentes.
 */
@Injectable()
export class WithdrawalsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Withdrawals');
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweeping: Promise<number> | null = null;
  /** Envios em segundo plano (depois de responder ao jogador ou ao Gerente). */
  private readonly background = new Set<Promise<void>>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PaymentGatewaysService) private readonly gateways: PaymentGatewaysService,
    @Inject(PushService) private readonly push: PushService,
  ) {}

  onApplicationBootstrap(): void {
    const every = this.config.payments?.sweepIntervalMs ?? null;
    if (every === null || !this.gateways.enabled) return;
    this.timer = setInterval(() => void this.sweep(), every);
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.idle();
  }

  /** Espera os envios em segundo plano terminarem (desligamento e testes). */
  async idle(): Promise<void> {
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  private inBackground(tenantId: string, withdrawalId: string): void {
    this.track(
      this.dispatch(tenantId, withdrawalId).catch(() =>
        this.logger.error(`saque ${withdrawalId}: envio falhou inesperadamente (a rodada tenta de novo)`),
      ),
    );
  }

  private track(work: Promise<void>): void {
    const task = work.finally(() => this.background.delete(task));
    this.background.add(task);
  }

  /** Aviso no app instalado do jogador, em segundo plano e sem afetar o saque (melhor esforço). */
  private notify(
    tenantId: string,
    userId: string,
    event: 'requested' | 'paid',
    withdrawal: { id: string; amountCents: number; status: WithdrawalStatus },
  ): void {
    if (!this.push.enabled) return;
    this.track(
      this.push
        .sendToUsers(tenantId, [userId], withdrawalPush(event, withdrawal))
        .then(() => undefined)
        .catch(() => this.logger.warn(`aviso de saque (${event}) não enviado`)),
    );
  }

  // -------------------------------------------------------------------------
  // Jogador
  // -------------------------------------------------------------------------

  async mine(tenant: ResolvedTenant, session: UserSession): Promise<MyWithdrawals> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const [rows, wallet, settings, usedToday] = await Promise.all([
        tx.pixWithdrawal.findMany({
          where: { tenantId: tenant.id, userId: session.userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: PLAYER_LIST_LIMIT,
          select: PUBLIC_SELECT,
        }),
        tx.wallet.findFirst({
          where: { tenantId: tenant.id, userId: session.userId },
          select: { prizesJb: true, prizesGames: true },
        }),
        this.readSettings(tx, tenant.id),
        tx.pixWithdrawal.count({
          where: {
            tenantId: tenant.id,
            userId: session.userId,
            status: { notIn: ['CANCELED', 'REJECTED', 'FAILED'] },
            createdAt: { gte: brasiliaDayStart(new Date()) },
          },
        }),
      ]);
      if (!wallet) throw Errors.sessionInvalid();
      return {
        items: rows.map(toPublicWithdrawal),
        withdrawableCents: Number(wallet.prizesJb + wallet.prizesGames),
        limits: { ...settings, usedToday },
      };
    });
  }

  async create(tenant: ResolvedTenant, session: UserSession, input: CreateWithdrawalInput): Promise<WithdrawalResult> {
    let created: { result: WithdrawalResult; queued: boolean; isNew: boolean };
    try {
      created = await this.db.withTenant(tenant.id, async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ withdrawal_id: string; created: boolean }>>`
          SELECT * FROM "pix_withdrawal_request"(${session.userId}::uuid, ${BigInt(input.amountCents)}::bigint,
                                                 ${input.keyType}, ${input.keyValue}, ${input.idempotencyKey}::uuid)`;
        if (!row) throw withdrawalNotFound();
        return {
          ...(await this.result(tx, tenant.id, session.userId, row.withdrawal_id)),
          isNew: row.created,
        };
      });
    } catch (error) {
      translate(error);
    }
    const { withdrawal } = created.result;
    if (created.isNew) {
      this.logger.log(`saque solicitado (${created.queued ? 'automático' : 'em análise'})`);
      this.notify(tenant.id, session.userId, 'requested', {
        id: withdrawal.id,
        amountCents: withdrawal.amountCents,
        status: created.queued ? 'QUEUED' : 'REVIEW',
      });
    }
    if (created.queued) this.inBackground(tenant.id, withdrawal.id);
    return created.result;
  }

  async cancel(tenant: ResolvedTenant, session: UserSession, withdrawalId: string): Promise<WithdrawalResult> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        await tx.$executeRaw`SELECT "pix_withdrawal_cancel"(${session.userId}::uuid, ${withdrawalId}::uuid)`;
        return (await this.result(tx, tenant.id, session.userId, withdrawalId)).result;
      });
    } catch (error) {
      translate(error);
    }
  }

  private async result(
    tx: TenantTx,
    tenantId: string,
    userId: string,
    withdrawalId: string,
  ): Promise<{ result: WithdrawalResult; queued: boolean }> {
    const [row, wallet] = await Promise.all([
      tx.pixWithdrawal.findFirst({ where: { tenantId, userId, id: withdrawalId }, select: PUBLIC_SELECT }),
      tx.wallet.findFirst({ where: { tenantId, userId } }),
    ]);
    if (!row) throw withdrawalNotFound();
    if (!wallet) throw Errors.sessionInvalid();
    return {
      result: { withdrawal: toPublicWithdrawal(row), wallet: toPublicWallet(wallet) },
      queued: row.status === 'QUEUED',
    };
  }

  // -------------------------------------------------------------------------
  // Envio e conferência no gateway
  // -------------------------------------------------------------------------

  /** Envia um saque da fila. Sem gateway ativo, volta para análise. Uma vez só (pix_withdrawal_claim). */
  async dispatch(tenantId: string, withdrawalId: string): Promise<void> {
    const prepared = await this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.pixWithdrawal.findFirst({
        where: { tenantId, id: withdrawalId, status: 'QUEUED' },
        select: { amountCents: true, keyType: true, keyValue: true, tenant: { select: { domain: true } } },
      });
      if (!row) return null;
      const active = await this.gateways.active(tx, tenantId);
      if (!active) {
        await tx.$queryRaw`SELECT "pix_withdrawal_hold"(${withdrawalId}::uuid) AS ok`;
        this.logger.warn(`saque ${withdrawalId}: sem gateway ativo; voltou para análise`);
        return null;
      }
      const [claim] = await tx.$queryRaw<Array<{ ok: boolean }>>`
        SELECT "pix_withdrawal_claim"(${withdrawalId}::uuid, ${active.gateway}) AS ok`;
      return claim?.ok ? { row, active } : null;
    });
    if (!prepared) return;
    const { row, active } = prepared;

    let providerTransactionId: string;
    try {
      ({ providerTransactionId } = await active.adapter.createPayout(active.credentials, {
        withdrawalId,
        amountCents: Number(row.amountCents),
        keyType: row.keyType as WithdrawalKeyType,
        keyValue: row.keyValue,
        description: `Saque ${withdrawalId}`,
        webhookUrl: this.webhookUrl(row.tenant.domain, active.gateway, withdrawalId),
      }));
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error;
      await this.afterSendFailure(tenantId, withdrawalId, error);
      return;
    }
    await this.db.withTenant(
      tenantId,
      (tx) => tx.$queryRaw`SELECT "pix_withdrawal_sent"(${withdrawalId}::uuid, ${providerTransactionId}) AS ok`,
    );
    this.logger.log('saque enviado ao gateway');
  }

  /** Falha no envio: só desfaz o que COM CERTEZA não chegou ao gateway; o resto fica SENDING (procura depois). */
  private async afterSendFailure(tenantId: string, withdrawalId: string, error: GatewayError): Promise<void> {
    if (error.status === 429) {
      await this.db.withTenant(
        tenantId,
        (tx) => tx.$queryRaw`SELECT "pix_withdrawal_requeue"(${withdrawalId}::uuid) AS ok`,
      );
      this.logger.warn(`saque ${withdrawalId}: gateway com limite de requisições; volta à fila`);
      return;
    }
    if (error.kind === 'auth' || error.kind === 'rejected') {
      const reason: WithdrawalFailureReason = error.kind === 'auth' ? 'GATEWAY_AUTH' : 'GATEWAY_REJECTED';
      await this.db.withTenant(
        tenantId,
        (tx) => tx.$queryRaw`SELECT "pix_withdrawal_unsend"(${withdrawalId}::uuid, ${reason}) AS ok`,
      );
      this.logger.warn(`saque ${withdrawalId} não aceito pelo gateway; voltou para análise: ${error.message}`);
      return;
    }
    this.logger.error(
      `saque ${withdrawalId}: envio sem resposta, NÃO será reenviado (procura no gateway): ${error.message}`,
    );
  }

  /**
   * Confere no gateway um saque enviado: sem resposta (SENDING) procura pela descrição; no gateway (PROCESSING)
   * consulta a situação e conclui (pago, ou falhou e devolve). Falha do gateway não altera nada.
   */
  async reconcile(tenantId: string, withdrawalId: string): Promise<void> {
    const prepared = await this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.pixWithdrawal.findFirst({
        where: { tenantId, id: withdrawalId, status: { in: ['SENDING', 'PROCESSING'] } },
        select: { status: true, gateway: true, providerTransactionId: true, sendStartedAt: true },
      });
      if (!row?.gateway) return null;
      await tx.pixWithdrawal.update({ where: { id: withdrawalId }, data: { lastCheckedAt: new Date() } });
      const gateway = await this.gateways.forDeposit(tx, tenantId, row.gateway as PaymentGatewayId);
      return gateway ? { ...gateway, row } : null;
    });
    if (!prepared) return;
    const { adapter, credentials, row } = prepared;

    try {
      let providerId = row.providerTransactionId;
      if (row.status === 'SENDING') {
        // Recém-enviado: o próprio envio ainda pode estar em andamento.
        if (!row.sendStartedAt || Date.now() - row.sendStartedAt.getTime() < 2 * 60_000) return;
        providerId = await adapter.findPayout(credentials, withdrawalId);
        if (!providerId) return;
        await this.db.withTenant(
          tenantId,
          (tx) => tx.$queryRaw`SELECT "pix_withdrawal_sent"(${withdrawalId}::uuid, ${providerId}) AS ok`,
        );
        this.logger.log(`saque ${withdrawalId}: envio sem resposta encontrado no gateway`);
      }
      if (!providerId) return;
      const checked = await adapter.checkPayout(credentials, providerId);
      if (checked.state !== 'PAID' && checked.state !== 'FAILED') return;
      const paid = checked.state === 'PAID';
      const beneficiary = paid ? checked.beneficiary : null;
      await this.db.withTenant(tenantId, async (tx) => {
        const [result] = await tx.$queryRaw<Array<{ outcome: string }>>`
          SELECT "pix_withdrawal_settle"(${withdrawalId}::uuid, ${paid}, ${beneficiary?.document ?? null},
                                         ${beneficiary?.name ?? null}) AS outcome`;
        if (result?.outcome === 'failed')
          this.logger.warn(`saque ${withdrawalId}: o gateway não pagou; valor devolvido`);
        if (result?.outcome !== 'paid') return;
        this.logger.log('saque pago');
        const owner = await tx.pixWithdrawal.findFirst({
          where: { tenantId, id: withdrawalId },
          select: { amountCents: true, user: { select: { id: true, document: true } } },
        });
        if (!owner) return;
        if (beneficiary && owner.user.document !== beneficiary.document) {
          this.logger.warn(`saque ${withdrawalId} pago a outro titular (conferir em Carteira > Saques)`);
        }
        this.notify(tenantId, owner.user.id, 'paid', {
          id: withdrawalId,
          amountCents: Number(owner.amountCents),
          status: 'PAID',
        });
      });
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error;
      this.logger.warn(`saque ${withdrawalId} não conferido agora: ${error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Aviso do gateway (webhook)
  // -------------------------------------------------------------------------

  /** Assinatura do endereço do aviso de um saque (separada da dos depósitos: uma não serve para a outra). */
  sign(gateway: PaymentGatewayId, withdrawalId: string): string | null {
    const key = this.config.payments?.webhookKey;
    return key ? createHmac('sha256', key).update(`${gateway}:withdrawal:${withdrawalId}`).digest('base64url') : null;
  }

  private webhookUrl(domain: string, gateway: PaymentGatewayId, withdrawalId: string): string | null {
    const token = this.sign(gateway, withdrawalId);
    if (!token || !publicDomain(domain)) return null;
    const url = new URL(`https://${domain}/integracoes/pagamentos/${gateway.toLowerCase()}`);
    url.searchParams.set('s', withdrawalId);
    url.searchParams.set('t', token);
    return url.toString();
  }

  /** Aviso do gateway: com a assinatura certa, confere o saque no gateway (o corpo é ignorado). false = assinatura errada. */
  async webhook(gateway: PaymentGatewayId, withdrawalId: string, token: string): Promise<boolean> {
    const expected = this.sign(gateway, withdrawalId);
    if (!expected || token.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return false;
    const found = await this.db.withLookup('app.pix_withdrawal', withdrawalId, (tx) =>
      tx.pixWithdrawal.findFirst({ where: { id: withdrawalId }, select: { tenantId: true, gateway: true } }),
    );
    if (!found || found.gateway !== gateway) return true;
    await this.reconcile(found.tenantId, withdrawalId);
    return true;
  }

  // -------------------------------------------------------------------------
  // Rodada automática
  // -------------------------------------------------------------------------

  /** Envia a fila e confere os enviados, de todas as bancas. Uma rodada por vez nesta instância. */
  sweep(): Promise<number> {
    this.sweeping ??= this.runSweep().finally(() => {
      this.sweeping = null;
    });
    return this.sweeping;
  }

  private async runSweep(): Promise<number> {
    const every = this.config.payments?.sweepRecheckSeconds;
    if (!every || !this.gateways.enabled) return 0;
    try {
      const due = await this.db.client.$queryRaw<Array<{ id: string; tenant_id: string; status: string }>>`
        SELECT * FROM "pix_withdrawals_due"(${SWEEP_BATCH}::int, ${every}::int)`;
      for (const item of due) {
        if (item.status === 'QUEUED') await this.dispatch(item.tenant_id, item.id);
        else await this.reconcile(item.tenant_id, item.id);
      }
      return due.length;
    } catch {
      this.logger.error('rodada de saques: falha inesperada (tenta de novo na próxima)');
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Painel: Carteira > Saques e Configurações > Pagamentos
  // -------------------------------------------------------------------------

  async list(
    tenant: ResolvedTenant,
    query: ListWithdrawalsQuery,
    showBeneficiary: boolean,
  ): Promise<AdminWithdrawalList> {
    const start = new Date(`${query.from}T00:00:00-03:00`);
    const end = new Date(new Date(`${query.to}T00:00:00-03:00`).getTime() + DAY_MS);
    const where = {
      tenantId: tenant.id,
      createdAt: { gte: start, lt: end },
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.promoterId ? { user: { referredByUserId: query.promoterId } } : {}),
    };
    return this.db.withTenant(tenant.id, async (tx) => {
      const [rows, total, paid] = await Promise.all([
        tx.pixWithdrawal.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: ADMIN_SELECT,
        }),
        tx.pixWithdrawal.count({ where }),
        tx.pixWithdrawal.aggregate({ where: { ...where, status: 'PAID' }, _sum: { amountCents: true } }),
      ]);
      const now = Date.now();
      return {
        items: rows.map((row) => toAdminWithdrawal(row, showBeneficiary, now)),
        total,
        page: query.page,
        pageSize: query.pageSize,
        paidTotalCents: Number(paid._sum.amountCents ?? 0n),
      };
    });
  }

  /** Aprovar (vai para o gateway em seguida) ou recusar (devolve). A função confere o perfil de novo; audita junto. */
  async review(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    withdrawalId: string,
    approve: boolean,
    note: string | undefined,
  ): Promise<AdminWithdrawalListItem> {
    let item: AdminWithdrawalListItem;
    try {
      item = await this.db.withTenant(tenant.id, async (tx) => {
        await tx.$executeRaw`
          SELECT "pix_withdrawal_review"(${actor.id}::uuid, ${withdrawalId}::uuid, ${approve}, ${note ?? null})`;
        const row = await this.adminRow(tx, tenant.id, withdrawalId);
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: actor.id,
          action: approve ? 'withdrawal.approve' : 'withdrawal.reject',
          targetType: 'user',
          targetId: row.user.id,
          details: { fields: ['prizesJb', 'prizesGames'], amount: Number(row.amountCents) },
        });
        return toAdminWithdrawal(row, true, Date.now());
      });
    } catch (error) {
      translate(error);
    }
    if (approve) this.inBackground(tenant.id, withdrawalId);
    return item;
  }

  /** Conclusão manual de um envio sem resposta, depois de conferir no painel do gateway. */
  async resolve(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    withdrawalId: string,
    paid: boolean,
  ): Promise<AdminWithdrawalListItem> {
    let item: AdminWithdrawalListItem;
    try {
      item = await this.db.withTenant(tenant.id, async (tx) => {
        await tx.$executeRaw`SELECT "pix_withdrawal_resolve"(${actor.id}::uuid, ${withdrawalId}::uuid, ${paid})`;
        const row = await this.adminRow(tx, tenant.id, withdrawalId);
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: actor.id,
          action: 'withdrawal.resolve',
          targetType: 'user',
          targetId: row.user.id,
          details: { fields: [paid ? 'paid' : 'notPaid'], amount: Number(row.amountCents) },
        });
        return toAdminWithdrawal(row, true, Date.now());
      });
    } catch (error) {
      translate(error);
    }
    if (paid)
      this.notify(tenant.id, item.user.id, 'paid', { id: item.id, amountCents: item.amountCents, status: 'PAID' });
    return item;
  }

  settings(tenant: ResolvedTenant): Promise<WithdrawalSettings> {
    return this.db.withTenant(tenant.id, (tx) => this.readSettings(tx, tenant.id));
  }

  async saveSettings(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    input: WithdrawalSettingsInput,
  ): Promise<WithdrawalSettings> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        await tx.$executeRaw`
          SELECT "withdrawal_settings_save"(${actor.id}::uuid, ${input.enabled}, ${input.minCents}::int,
                                            ${input.maxCents}::int, ${input.dailyCount}::int,
                                            ${input.autoLimitCents}::int)`;
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: actor.id,
          action: 'withdrawal.settings',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: ['enabled', 'minCents', 'maxCents', 'dailyCount', 'autoLimitCents'] },
        });
        return this.readSettings(tx, tenant.id);
      });
    } catch (error) {
      translate(error);
    }
  }

  private async readSettings(tx: TenantTx, tenantId: string): Promise<WithdrawalSettings> {
    const row = await tx.tenantSettings.findFirst({
      where: { tenantId },
      select: {
        withdrawalsEnabled: true,
        withdrawalMinCents: true,
        withdrawalMaxCents: true,
        withdrawalDailyCount: true,
        withdrawalAutoLimitCents: true,
      },
    });
    if (!row) return DEFAULT_SETTINGS;
    return {
      enabled: row.withdrawalsEnabled,
      minCents: row.withdrawalMinCents,
      maxCents: row.withdrawalMaxCents,
      dailyCount: row.withdrawalDailyCount,
      autoLimitCents: row.withdrawalAutoLimitCents,
    };
  }

  private async adminRow(tx: TenantTx, tenantId: string, withdrawalId: string): Promise<AdminWithdrawalRow> {
    const row = await tx.pixWithdrawal.findFirst({ where: { tenantId, id: withdrawalId }, select: ADMIN_SELECT });
    if (!row) throw withdrawalNotFound();
    return row;
  }
}

const ADMIN_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  paidAt: true,
  amountCents: true,
  fromPrizesJbCents: true,
  fromPrizesGamesCents: true,
  keyType: true,
  keyValue: true,
  status: true,
  gateway: true,
  providerTransactionId: true,
  failureReason: true,
  decisionNote: true,
  reviewedAt: true,
  resolvedAt: true,
  sendStartedAt: true,
  beneficiaryDocument: true,
  beneficiaryName: true,
  reviewer: { select: { id: true, name: true } },
  resolver: { select: { id: true, name: true } },
  user: { select: { id: true, displayId: true, name: true, document: true } },
} as const;

interface AdminWithdrawalRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  amountCents: bigint;
  fromPrizesJbCents: bigint;
  fromPrizesGamesCents: bigint;
  keyType: string;
  keyValue: string;
  status: string;
  gateway: string | null;
  providerTransactionId: string | null;
  failureReason: string | null;
  decisionNote: string | null;
  reviewedAt: Date | null;
  resolvedAt: Date | null;
  sendStartedAt: Date | null;
  beneficiaryDocument: string | null;
  beneficiaryName: string | null;
  reviewer: { id: string; name: string } | null;
  resolver: { id: string; name: string } | null;
  user: { id: string; displayId: number; name: string; document: string };
}

function toAdminWithdrawal(row: AdminWithdrawalRow, showBeneficiary: boolean, now: number): AdminWithdrawalListItem {
  const status = row.status as WithdrawalStatus;
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    user: { id: row.user.id, displayId: row.user.displayId, name: row.user.name },
    amountCents: Number(row.amountCents),
    fromPrizesJbCents: Number(row.fromPrizesJbCents),
    fromPrizesGamesCents: Number(row.fromPrizesGamesCents),
    keyType: row.keyType as WithdrawalKeyType,
    keyValue: row.keyValue,
    status,
    gateway: row.gateway as PaymentGatewayId | null,
    providerTransactionId: row.providerTransactionId,
    failureReason: row.failureReason as WithdrawalFailureReason | null,
    note: row.decisionNote,
    reviewedBy: row.reviewer,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    resolvedBy: row.resolver,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    beneficiary:
      row.beneficiaryDocument && showBeneficiary
        ? { name: row.beneficiaryName, document: row.beneficiaryDocument }
        : null,
    beneficiaryMatches: row.beneficiaryDocument ? row.beneficiaryDocument === row.user.document : null,
    resolvable:
      (status === 'SENDING' && !!row.sendStartedAt && now - row.sendStartedAt.getTime() > RESOLVE_SENDING_MS) ||
      (status === 'PROCESSING' && now - row.updatedAt.getTime() > RESOLVE_PROCESSING_MS),
  };
}
