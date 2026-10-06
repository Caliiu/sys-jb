import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import {
  type AdminDepositList,
  type AdminDepositListItem,
  DEPOSIT_LIMITS,
  type DepositReviewReason,
  type DepositDestination,
  type DepositStatus,
  type PaymentGatewayId,
  type PublicDeposit,
  type PublicDepositStatus,
} from '@sysjb/contracts';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import type { UserSession } from '../auth/session.types.js';
import { AppError, Errors } from '../common/app-error.js';
import { hasSqlState } from '../common/prisma-errors.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toPublicWallet } from '../users/user.mapper.js';
import { GatewayError } from './gateway-adapter.js';
import { PaymentGatewaysService } from './payment-gateways.service.js';
import type { CreateDepositInput, ListDepositsQuery } from './payments.schemas.js';

/** A tela consulta o gateway no máximo a cada 5 segundos por depósito (a resposta dele fica em cache uns segundos). */
const PLAYER_RECHECK_MS = 5_000;
/** Cobranças abertas por jogador: no máximo 5 pendentes criadas nos últimos 15 minutos. */
const MAX_OPEN_DEPOSITS = 5;
const OPEN_WINDOW_MS = 15 * 60_000;
/** Sem resposta do gateway por 24 h, o depósito pendente vira expirado (pagamento depois disso ainda é creditado). */
const EXPIRE_AFTER_MS = 24 * 60 * 60_000;
/** Cobrança que o gateway não conhece depois de 10 minutos: a criação falhou antes de chegar lá. */
const NOT_FOUND_GRACE_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
/** Depósitos conferidos por rodada automática, por banca. */
const SWEEP_BATCH = 50;

const pixUnavailable = () =>
  new AppError(503, 'SERVICE_UNAVAILABLE', 'Pix indisponível no momento. Tente novamente mais tarde.');
const tooManyOpen = () =>
  new AppError(
    429,
    'TOO_MANY_ATTEMPTS',
    'Você já tem várias cobranças Pix abertas. Pague uma delas ou aguarde alguns minutos.',
    undefined,
    { 'Retry-After': '300' },
  );
const depositNotFound = () => new AppError(404, 'NOT_FOUND', 'Depósito não encontrado.');

interface DepositRow {
  id: string;
  tenantId: string;
  userId: string;
  gateway: string;
  destination: string;
  amountCents: bigint;
  status: string;
  pixCode: string | null;
  expiresAt: Date;
  lastCheckedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
}

const DEPOSIT_SELECT = {
  id: true,
  tenantId: true,
  userId: true,
  gateway: true,
  destination: true,
  amountCents: true,
  status: true,
  pixCode: true,
  expiresAt: true,
  lastCheckedAt: true,
  paidAt: true,
  createdAt: true,
} as const;

function toPublicDeposit(row: DepositRow): PublicDeposit {
  return {
    id: row.id,
    amountCents: Number(row.amountCents),
    destination: row.destination as DepositDestination,
    status: row.status as DepositStatus,
    pixCode: row.pixCode ?? '',
    expiresAt: row.expiresAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Domínio que o gateway consegue chamar pela internet (os de desenvolvimento e teste, não). */
export function publicDomain(domain: string): boolean {
  const host = domain.toLowerCase();
  return (
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) &&
    !/(^|\.)(localhost|test|local|internal|example|invalid)$/.test(host)
  );
}

/**
 * Depósitos via Pix (Recarga Pix). O depósito é gravado ANTES de chamar o gateway (o nosso id vai como identificador
 * da transação lá), assim nada pago fica sem registro. O pagamento só vale depois de conferido no próprio gateway, pelo
 * id do depósito, com as credenciais da banca: o aviso do gateway (webhook, sem assinatura) só dispara essa conferência,
 * e o corpo dele é ignorado. A conferência também roda quando a tela do jogador pergunta e numa rodada automática
 * (o aviso pode não chegar). Quem credita é a função pix_deposit_confirm: uma vez por depósito, com o valor conferido.
 */
@Injectable()
export class DepositsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Deposits');
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweeping: Promise<number> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PaymentGatewaysService) private readonly gateways: PaymentGatewaysService,
  ) {}

  onApplicationBootstrap(): void {
    const every = this.config.payments?.sweepIntervalMs ?? null;
    if (every === null || !this.gateways.enabled) return;
    this.timer = setInterval(() => void this.sweep(), every);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // -------------------------------------------------------------------------
  // Jogador
  // -------------------------------------------------------------------------

  async create(tenant: ResolvedTenant, session: UserSession, input: CreateDepositInput): Promise<PublicDeposit> {
    const prepared = await this.db.withTenant(tenant.id, async (tx) => {
      const active = await this.gateways.active(tx, tenant.id);
      if (!active) return null;
      const user = await tx.user.findFirst({
        where: { tenantId: tenant.id, id: session.userId },
        select: { name: true, document: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE') throw Errors.sessionInvalid();
      const open = await tx.pixDeposit.count({
        where: {
          tenantId: tenant.id,
          userId: session.userId,
          status: 'PENDING',
          createdAt: { gt: new Date(Date.now() - OPEN_WINDOW_MS) },
        },
      });
      if (open >= MAX_OPEN_DEPOSITS) throw tooManyOpen();
      const deposit = await tx.pixDeposit.create({
        data: {
          tenantId: tenant.id,
          userId: session.userId,
          gateway: active.gateway,
          destination: input.destination,
          amountCents: BigInt(input.amountCents),
          expiresAt: new Date(Date.now() + DEPOSIT_LIMITS.expiresInSeconds * 1000),
        },
        select: { id: true },
      });
      return { active, user, depositId: deposit.id };
    });
    if (!prepared) throw pixUnavailable();
    const { active, user, depositId } = prepared;

    let charge;
    try {
      charge = await active.adapter.createCharge(active.credentials, {
        depositId,
        amountCents: input.amountCents,
        payerName: user.name.slice(0, 100),
        payerDocument: user.document,
        description: `Recarga ${tenant.name}`.slice(0, 100),
        webhookUrl: this.webhookUrl(tenant, active.gateway, depositId),
      });
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error;
      this.logger.error(`cobrança Pix não criada: ${error.message}`);
      // Recusada ou sem resposta: o depósito não vale. A rodada automática ainda confere se ele chegou ao gateway.
      if (error.kind !== 'unavailable') {
        await this.db.withTenant(tenant.id, (tx) => this.close(tx, depositId, 'CANCELED'));
      }
      throw pixUnavailable();
    }

    return this.db.withTenant(tenant.id, async (tx) => {
      await tx.$queryRaw`
        SELECT "pix_deposit_attach"(${depositId}::uuid, ${charge.providerTransactionId}, ${charge.pixCode}) AS ok`;
      return toPublicDeposit(await this.row(tx, tenant.id, depositId));
    });
  }

  /** Situação do depósito do próprio jogador; pendente: confere no gateway (no máximo a cada 5 s). */
  async status(tenant: ResolvedTenant, session: UserSession, depositId: string): Promise<PublicDepositStatus> {
    const row = await this.db.withTenant(tenant.id, (tx) =>
      tx.pixDeposit.findFirst({
        where: { tenantId: tenant.id, id: depositId, userId: session.userId },
        select: DEPOSIT_SELECT,
      }),
    );
    if (!row) throw depositNotFound();
    const due = !row.lastCheckedAt || Date.now() - row.lastCheckedAt.getTime() >= PLAYER_RECHECK_MS;
    if (row.status === 'PENDING' && due) await this.reconcile(tenant.id, depositId, { onlyPending: true });

    return this.db.withTenant(tenant.id, async (tx) => {
      const current = await this.row(tx, tenant.id, depositId);
      const wallet =
        current.status === 'PAID'
          ? await tx.wallet.findFirst({ where: { tenantId: tenant.id, userId: session.userId } })
          : null;
      return { deposit: toPublicDeposit(current), wallet: wallet ? toPublicWallet(wallet) : null };
    });
  }

  // -------------------------------------------------------------------------
  // Aviso do gateway (webhook)
  // -------------------------------------------------------------------------

  /** Assinatura do endereço do aviso de um depósito: HMAC-SHA256 do gateway e do id, em base64url (43 caracteres). */
  sign(gateway: PaymentGatewayId, depositId: string): string | null {
    const key = this.config.payments?.webhookKey;
    return key ? createHmac('sha256', key).update(`${gateway}:${depositId}`).digest('base64url') : null;
  }

  private webhookUrl(tenant: ResolvedTenant, gateway: PaymentGatewayId, depositId: string): string | null {
    const token = this.sign(gateway, depositId);
    if (!token || !publicDomain(tenant.domain)) return null;
    const url = new URL(`https://${tenant.domain}/integracoes/pagamentos/${gateway.toLowerCase()}`);
    url.searchParams.set('d', depositId);
    url.searchParams.set('t', token);
    return url.toString();
  }

  /**
   * Aviso do gateway: confere a assinatura do endereço e, se ela bate, grava quem pagou (só se o aviso é da transação
   * deste depósito) e confere o depósito no gateway. Devolve false se a assinatura não bate (o controlador responde
   * 401). Do corpo, só o pagador é usado: situação e valor vêm sempre da consulta ao gateway.
   */
  async webhook(gateway: PaymentGatewayId, depositId: string, token: string, body: unknown): Promise<boolean> {
    const expected = this.sign(gateway, depositId);
    if (!expected || token.length !== expected.length) return false;
    if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return false;
    const found = await this.db.withLookup('app.pix_deposit', depositId, (tx) =>
      tx.pixDeposit.findFirst({
        where: { id: depositId },
        select: { tenantId: true, gateway: true, providerTransactionId: true },
      }),
    );
    if (!found || found.gateway !== gateway) return true;

    const payer = this.gateways.adapter(gateway)?.parseWebhook(body) ?? null;
    if (payer && found.providerTransactionId && payer.providerTransactionId === found.providerTransactionId) {
      await this.db.withTenant(
        found.tenantId,
        (tx) =>
          tx.$queryRaw`
          SELECT "pix_deposit_set_payer"(${depositId}::uuid, ${payer.document}, ${payer.name}) AS ok`,
      );
    } else if (payer) {
      this.logger.warn(`aviso do depósito ${depositId} com outra transação do gateway: pagador ignorado`);
    }
    await this.reconcile(found.tenantId, depositId, { onlyPending: false });
    return true;
  }

  // -------------------------------------------------------------------------
  // Rodada automática
  // -------------------------------------------------------------------------

  /** Confere no gateway os depósitos pendentes de todas as bancas. Uma rodada por vez nesta instância. */
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
      const due = await this.db.client.$queryRaw<Array<{ id: string; tenant_id: string }>>`
        SELECT * FROM "pix_deposits_due"(${SWEEP_BATCH}::int, ${every}::int)`;
      for (const deposit of due) {
        await this.reconcile(deposit.tenant_id, deposit.id, { onlyPending: true });
      }
      return due.length;
    } catch {
      this.logger.error('rodada de depósitos: falha inesperada (tenta de novo na próxima)');
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Conferência no gateway (única porta para creditar)
  // -------------------------------------------------------------------------

  /**
   * Consulta o depósito no gateway que o gerou e aplica o resultado: pago (a função confere o valor e quem pagou:
   * credita, aguarda o aviso com o pagador ou põe em análise), cancelado, desconhecido pelo gateway (cancela depois de
   * 10 min) ou ainda pendente (expira depois de 24 h). Falha do gateway não altera nada (a próxima conferência tenta de
   * novo). `onlyPending`: a tela e a rodada só conferem pendentes; o aviso do gateway confere também expirados e
   * cancelados (pagamento atrasado segue as mesmas regras). Em análise, pago ou recusado: nada a conferir.
   */
  async reconcile(tenantId: string, depositId: string, options: { onlyPending: boolean }): Promise<void> {
    const prepared = await this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.pixDeposit.findFirst({
        where: { tenantId, id: depositId },
        select: { gateway: true, status: true, createdAt: true },
      });
      if (!row || ['PAID', 'REVIEW', 'REJECTED'].includes(row.status)) return null;
      if (options.onlyPending && row.status !== 'PENDING') return null;
      await tx.pixDeposit.update({ where: { id: depositId }, data: { lastCheckedAt: new Date() } });
      const gateway = await this.gateways.forDeposit(tx, tenantId, row.gateway as PaymentGatewayId);
      return gateway ? { ...gateway, status: row.status, createdAt: row.createdAt } : null;
    });
    if (!prepared) return;

    let checked;
    try {
      checked = await prepared.adapter.check(prepared.credentials, depositId);
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error;
      this.logger.warn(`depósito não conferido agora: ${error.message}`);
      return;
    }

    const age = Date.now() - prepared.createdAt.getTime();
    await this.db.withTenant(tenantId, async (tx) => {
      if (checked.state === 'PAID') {
        try {
          const [result] = await tx.$queryRaw<Array<{ outcome: string }>>`
            SELECT "pix_deposit_confirm"(${depositId}::uuid, ${BigInt(checked.paidCents)}) AS outcome`;
          if (result?.outcome === 'applied') this.logger.log('depósito Pix pago e creditado');
          else if (result?.outcome === 'review') this.logger.warn(`depósito ${depositId} pago: em análise (titular)`);
        } catch (error) {
          if (!hasSqlState(error, 'SJ011')) throw error;
          // Valor diferente do cobrado: não credita; fica pendente para o operador conferir no gateway.
          this.logger.error(`depósito ${depositId}: valor pago no gateway difere do cobrado; NÃO creditado`);
        }
        return;
      }
      if (prepared.status !== 'PENDING') return;
      if (checked.state === 'CANCELED') await this.close(tx, depositId, 'CANCELED');
      else if (checked.state === 'NOT_FOUND' && age > NOT_FOUND_GRACE_MS) await this.close(tx, depositId, 'CANCELED');
      else if (checked.state === 'PENDING' && age > EXPIRE_AFTER_MS) await this.close(tx, depositId, 'EXPIRED');
    });
  }

  private async close(tx: TenantTx, depositId: string, status: 'EXPIRED' | 'CANCELED'): Promise<void> {
    await tx.$queryRaw`SELECT "pix_deposit_close"(${depositId}::uuid, ${status}) AS ok`;
  }

  private async row(tx: TenantTx, tenantId: string, depositId: string): Promise<DepositRow> {
    const row = await tx.pixDeposit.findFirst({ where: { tenantId, id: depositId }, select: DEPOSIT_SELECT });
    if (!row) throw depositNotFound();
    return row;
  }

  // -------------------------------------------------------------------------
  // Painel: Carteira > Depósitos
  // -------------------------------------------------------------------------

  /**
   * Carteira > Depósitos. Nome e CPF/CNPJ de quem pagou (dado de terceiro) só para quem pode ver os pagamentos
   * (`showPayer`); os outros perfis veem só se foi o titular.
   */
  async list(tenant: ResolvedTenant, query: ListDepositsQuery, showPayer: boolean): Promise<AdminDepositList> {
    // Dias de Brasília (sempre -03:00, sem horário de verão), fim exclusivo.
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
      const rows = await tx.pixDeposit.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: ADMIN_DEPOSIT_SELECT,
      });
      const total = await tx.pixDeposit.count({ where });
      const paid = await tx.pixDeposit.aggregate({ where: { ...where, status: 'PAID' }, _sum: { amountCents: true } });
      return {
        items: rows.map((row) => toAdminDeposit(row, showPayer)),
        total,
        page: query.page,
        pageSize: query.pageSize,
        paidTotalCents: Number(paid._sum.amountCents ?? 0n),
      };
    });
  }

  /**
   * Depósito em análise (pago por outro titular, ou sem o aviso de quem pagou): o Gerente libera o crédito ou recusa
   * (a devolução ao pagador é feita fora do sistema). A função do banco confere de novo o perfil e a situação; a
   * auditoria vai na mesma transação (o valor, nunca dados do pagador).
   */
  async review(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    depositId: string,
    approve: boolean,
  ): Promise<AdminDepositListItem> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        await tx.$queryRaw`SELECT "pix_deposit_review"(${actor.id}::uuid, ${depositId}::uuid, ${approve}) AS outcome`;
        const row = await tx.pixDeposit.findFirst({
          where: { tenantId: tenant.id, id: depositId },
          select: ADMIN_DEPOSIT_SELECT,
        });
        if (!row) throw depositNotFound();
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: actor.id,
          action: approve ? 'deposit.approve' : 'deposit.reject',
          targetType: 'user',
          targetId: row.user.id,
          details: {
            fields: [row.destination === 'GAMES' ? 'balanceGames' : 'balanceJb'],
            amount: Number(row.amountCents),
          },
        });
        return toAdminDeposit(row, true);
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (hasSqlState(error, 'SJ012')) throw notUnderReview();
      if (hasSqlState(error, 'P0002')) throw depositNotFound();
      if (hasSqlState(error, '42501')) throw Errors.permissionDenied();
      throw error;
    }
  }
}

const notUnderReview = () =>
  new AppError(409, 'CONFLICT', 'Este depósito não está em análise (já foi liberado, recusado ou ainda não foi pago).');

const ADMIN_DEPOSIT_SELECT = {
  id: true,
  createdAt: true,
  paidAt: true,
  gateway: true,
  destination: true,
  amountCents: true,
  status: true,
  payerDocument: true,
  payerName: true,
  reviewReason: true,
  reviewedAt: true,
  reviewer: { select: { id: true, name: true } },
  user: { select: { id: true, displayId: true, name: true, document: true } },
} as const;

interface AdminDepositRow {
  id: string;
  createdAt: Date;
  paidAt: Date | null;
  gateway: string;
  destination: string;
  amountCents: bigint;
  status: string;
  payerDocument: string | null;
  payerName: string | null;
  reviewReason: string | null;
  reviewedAt: Date | null;
  reviewer: { id: string; name: string } | null;
  user: { id: string; displayId: number; name: string; document: string };
}

function toAdminDeposit(row: AdminDepositRow, showPayer: boolean): AdminDepositListItem {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    user: { id: row.user.id, displayId: row.user.displayId, name: row.user.name },
    gateway: row.gateway as PaymentGatewayId,
    destination: row.destination as DepositDestination,
    amountCents: Number(row.amountCents),
    status: row.status as DepositStatus,
    payer: row.payerDocument && showPayer ? { name: row.payerName, document: row.payerDocument } : null,
    payerMatches: row.payerDocument ? row.payerDocument === row.user.document : null,
    reviewReason: row.reviewReason as DepositReviewReason | null,
    reviewedBy: row.reviewer,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}
