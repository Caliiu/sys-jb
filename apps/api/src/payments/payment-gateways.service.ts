import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AdminPaymentGateway,
  type AdminPaymentSettings,
  PAYMENT_GATEWAYS,
  type PaymentGatewayId,
  type PaymentGatewayTestResult,
} from '@sysjb/contracts';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import { AppError, Errors } from '../common/app-error.js';
import { hasSqlState } from '../common/prisma-errors.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type GatewayCredentials, credentialsHint, openCredentials, sealCredentials } from './credentials-box.js';
import type { PaymentGatewayAdapter } from './gateway-adapter.js';
import { MisticPayGateway } from './misticpay.gateway.js';
import type { PaymentsConfig } from './payments.config.js';
import type { SavePaymentGatewayInput } from './payments.schemas.js';

export const PAYMENT_GATEWAY_ADAPTERS = Symbol('PAYMENT_GATEWAY_ADAPTERS');
export type PaymentGatewayAdapters = Readonly<Record<PaymentGatewayId, PaymentGatewayAdapter>>;

/** Um adaptador por gateway, montados a partir da configuração (os testes trocam por provedores falsos). */
export function createGatewayAdapters(config: PaymentsConfig | null): PaymentGatewayAdapters | null {
  if (!config) return null;
  return { MISTICPAY: new MisticPayGateway(config.misticpayApiUrl) };
}

const unavailable = () =>
  new AppError(
    503,
    'SERVICE_UNAVAILABLE',
    'Pagamentos desligados neste servidor (PAYMENTS_SECRET_KEY ausente). Fale com o suporte técnico.',
  );
const notConfigured = () =>
  new AppError(404, 'NOT_FOUND', 'Gateway ainda não configurado. Salve as credenciais antes.');

/** Gateway ativo da banca, com as credenciais já abertas. */
export interface ActiveGateway {
  gateway: PaymentGatewayId;
  adapter: PaymentGatewayAdapter;
  credentials: GatewayCredentials;
}

/**
 * Gateways de pagamento da banca (Configurações > Pagamentos). As credenciais são cifradas aqui (AES-256-GCM, chave
 * derivada de PAYMENTS_SECRET_KEY) antes de ir para o banco e nunca voltam ao painel: ele recebe só se estão
 * configuradas e uma pista. Gravar e ativar passam pelas funções payment_gateway_*, que conferem de novo que quem age é
 * Gerente ativo desta banca; a auditoria vai na mesma transação (só o gateway, nunca a credencial).
 */
@Injectable()
export class PaymentGatewaysService {
  private readonly logger = new Logger('PaymentGateways');

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PAYMENT_GATEWAY_ADAPTERS) private readonly adapters: PaymentGatewayAdapters | null,
  ) {}

  get enabled(): boolean {
    return this.config.payments !== null && this.adapters !== null;
  }

  private require(): { config: PaymentsConfig; adapters: PaymentGatewayAdapters } {
    if (!this.config.payments || !this.adapters) throw unavailable();
    return { config: this.config.payments, adapters: this.adapters };
  }

  async settings(tenant: ResolvedTenant): Promise<AdminPaymentSettings> {
    const rows = await this.db.withTenant(tenant.id, (tx) =>
      tx.paymentGateway.findMany({
        where: { tenantId: tenant.id },
        select: {
          gateway: true,
          credentialsHint: true,
          active: true,
          updatedAt: true,
          operator: { select: { id: true, name: true } },
        },
      }),
    );
    const gateways = PAYMENT_GATEWAYS.map((gateway): AdminPaymentGateway => {
      const row = rows.find((r) => r.gateway === gateway);
      return {
        gateway,
        configured: !!row,
        active: row?.active ?? false,
        credentialsHint: row?.credentialsHint ?? null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedBy: row ? { id: row.operator.id, name: row.operator.name } : null,
      };
    });
    return { available: this.enabled, gateways };
  }

  async save(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    gateway: PaymentGatewayId,
    input: SavePaymentGatewayInput,
  ): Promise<AdminPaymentSettings> {
    const { config } = this.require();
    const credentials: GatewayCredentials = { clientId: input.clientId, clientSecret: input.clientSecret };
    const sealed = sealCredentials(config.credentialsKey, tenant.id, gateway, credentials);
    try {
      await this.db.withTenant(tenant.id, async (tx) => {
        const before = await tx.paymentGateway.findFirst({
          where: { tenantId: tenant.id, gateway },
          select: { active: true },
        });
        await tx.$executeRaw`
          SELECT "payment_gateway_save"(${actor.id}::uuid, ${gateway}, ${sealed}, ${credentialsHint(input.clientId)},
                                        ${input.activate})`;
        await this.audit(tx, tenant, actor, 'payment.gateway.update', gateway, ['clientId', 'clientSecret']);
        if (input.activate && !before?.active) {
          await this.audit(tx, tenant, actor, 'payment.gateway.activate', gateway, []);
        }
      });
    } catch (error) {
      translate(error);
    }
    return this.settings(tenant);
  }

  async setActive(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    gateway: PaymentGatewayId,
    active: boolean,
  ): Promise<AdminPaymentSettings> {
    this.require();
    try {
      await this.db.withTenant(tenant.id, async (tx) => {
        const before = await tx.paymentGateway.findMany({
          where: { tenantId: tenant.id, active: true },
          select: { gateway: true },
        });
        const [row] = await tx.$queryRaw<Array<{ ok: boolean }>>`
          SELECT "payment_gateway_set_active"(${actor.id}::uuid, ${gateway}, ${active}) AS ok`;
        if (!row?.ok) throw notConfigured();
        const wasActive = before.some((b) => b.gateway === gateway);
        if (active && !wasActive) {
          for (const other of before) {
            await this.audit(tx, tenant, actor, 'payment.gateway.deactivate', other.gateway, []);
          }
          await this.audit(tx, tenant, actor, 'payment.gateway.activate', gateway, []);
        } else if (!active && wasActive) {
          await this.audit(tx, tenant, actor, 'payment.gateway.deactivate', gateway, []);
        }
      });
    } catch (error) {
      translate(error);
    }
    return this.settings(tenant);
  }

  /** "Testar conexão" com as credenciais gravadas (nada é alterado). */
  async test(tenant: ResolvedTenant, gateway: PaymentGatewayId): Promise<PaymentGatewayTestResult> {
    const { adapters } = this.require();
    const credentials = await this.db.withTenant(tenant.id, (tx) => this.credentials(tx, tenant.id, gateway));
    if (credentials === undefined) throw notConfigured();
    if (credentials === null) {
      return {
        ok: false,
        message: 'Não foi possível abrir as credenciais gravadas (a chave do servidor mudou). Salve-as de novo.',
        balanceCents: null,
      };
    }
    return adapters[gateway].test(credentials);
  }

  /** Adaptador do gateway (null com pagamentos desligados). */
  adapter(gateway: PaymentGatewayId): PaymentGatewayAdapter | null {
    return this.adapters?.[gateway] ?? null;
  }

  /** Gateway ativo da banca (null se nenhum ou se as credenciais não abrem), dentro da transação da banca. */
  async active(tx: TenantTx, tenantId: string): Promise<ActiveGateway | null> {
    if (!this.config.payments || !this.adapters) return null;
    const row = await tx.paymentGateway.findFirst({
      where: { tenantId, active: true },
      select: { gateway: true },
    });
    if (!row) return null;
    const gateway = row.gateway as PaymentGatewayId;
    const credentials = await this.credentials(tx, tenantId, gateway);
    if (!credentials) return null;
    return { gateway, adapter: this.adapters[gateway], credentials };
  }

  /** Gateway que gerou um depósito (mesmo que não seja mais o ativo). null se não abre ou não existe mais. */
  async forDeposit(
    tx: TenantTx,
    tenantId: string,
    gateway: PaymentGatewayId,
  ): Promise<Omit<ActiveGateway, 'gateway'> | null> {
    if (!this.adapters) return null;
    const credentials = await this.credentials(tx, tenantId, gateway);
    return credentials ? { adapter: this.adapters[gateway], credentials } : null;
  }

  /** undefined = não configurado; null = configurado, mas não abre (chave do servidor trocada). */
  private async credentials(
    tx: TenantTx,
    tenantId: string,
    gateway: PaymentGatewayId,
  ): Promise<GatewayCredentials | null | undefined> {
    const row = await tx.paymentGateway.findFirst({
      where: { tenantId, gateway },
      select: { credentials: true },
    });
    if (!row) return undefined;
    const key = this.config.payments?.credentialsKey;
    const opened = key ? openCredentials(key, tenantId, gateway, row.credentials) : null;
    if (!opened) this.logger.error(`credenciais do gateway ${gateway} não abrem (PAYMENTS_SECRET_KEY trocada?)`);
    return opened;
  }

  private audit(
    tx: TenantTx,
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    action: 'payment.gateway.update' | 'payment.gateway.activate' | 'payment.gateway.deactivate',
    gateway: string,
    fields: string[],
  ) {
    return recordAudit(tx, {
      tenantId: tenant.id,
      operatorId: actor.id,
      action,
      targetType: 'tenant',
      targetId: tenant.id,
      details: { fields, gateway },
    });
  }
}

/** Falhas das funções do banco (payment_gateway_*) traduzidas para a API. */
function translate(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (hasSqlState(error, '42501')) throw Errors.permissionDenied();
  throw error;
}
