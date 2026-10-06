import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { hasPermission } from '@sysjb/contracts';
import type {
  AdminDepositList,
  AdminDepositListItem,
  AdminPaymentSettings,
  PaymentGatewayId,
  PaymentGatewayTestResult,
  PublicDeposit,
  PublicDepositStatus,
} from '@sysjb/contracts';
import { ConsoleGuard } from '../admin/console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from '../admin/operator.guard.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { AppError } from '../common/app-error.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { DepositsService } from './deposits.service.js';
import { PaymentGatewaysService } from './payment-gateways.service.js';
import {
  type CreateDepositInput,
  type ListDepositsQuery,
  type SavePaymentGatewayInput,
  createDepositSchema,
  depositIdSchema,
  depositWebhookQuerySchema,
  listDepositsQuerySchema,
  paymentGatewayParamSchema,
  reviewDepositSchema,
  savePaymentGatewaySchema,
  setPaymentGatewayActiveSchema,
} from './payments.schemas.js';

/** Recarga Pix do jogador logado: a cobrança é sempre em nome do usuário da sessão. */
@Controller('v1/payments/deposits')
@UseGuards(TenantGuard, SessionGuard)
export class DepositsController {
  constructor(@Inject(DepositsService) private readonly deposits: DepositsService) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(createDepositSchema)) body: CreateDepositInput,
  ): Promise<PublicDeposit> {
    return this.deposits.create(tenant, session, body);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  status(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Param('id', new ZodValidationPipe(depositIdSchema)) id: string,
  ): Promise<PublicDepositStatus> {
    return this.deposits.status(tenant, session, id);
  }
}

/**
 * Aviso do gateway de pagamento (webhook). Sem banca: o endereço de cada depósito leva o id e a assinatura dele
 * (?d=...&t=..., gerados na criação). A API não é exposta à internet; o web repassa o POST público
 * (/integracoes/pagamentos/<gateway>) para cá. Com a assinatura certa, do corpo só se aproveita quem pagou; situação
 * e valor vêm da consulta ao próprio gateway.
 */
@Controller('v1/integrations/payments')
export class PaymentsWebhookController {
  constructor(@Inject(DepositsService) private readonly deposits: DepositsService) {}

  @Post(':gateway')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async receive(
    @Param('gateway') rawGateway: string,
    @Query() rawQuery: unknown,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const gateway = paymentGatewayParamSchema.safeParse(rawGateway.toUpperCase());
    const query = depositWebhookQuerySchema.safeParse(rawQuery);
    if (!gateway.success || !query.success) throw invalidWebhook();
    const accepted = await this.deposits.webhook(gateway.data, query.data.d, query.data.t, body);
    if (!accepted) throw invalidWebhook();
    return { ok: true };
  }
}

const invalidWebhook = () => new AppError(401, 'UNAUTHORIZED', 'Aviso de pagamento inválido.');

/**
 * Configurações > Pagamentos: consultar exige `payments.read`; gravar credenciais, testar e ativar, `payments.manage`
 * (só o Gerente; o banco confere de novo). As credenciais nunca voltam nas respostas.
 */
@Controller('v1/admin/payments')
@UseGuards(ConsoleGuard, OperatorGuard)
export class PaymentsAdminController {
  constructor(@Inject(PaymentGatewaysService) private readonly gateways: PaymentGatewaysService) {}

  @Get()
  @RequirePermission('payments.read')
  @Header('Cache-Control', 'no-store')
  settings(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminPaymentSettings> {
    return this.gateways.settings(tenant);
  }

  @Put(':gateway')
  @RequirePermission('payments.manage')
  @Header('Cache-Control', 'no-store')
  save(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('gateway', new ZodValidationPipe(paymentGatewayParamSchema)) gateway: PaymentGatewayId,
    @Body(new ZodValidationPipe(savePaymentGatewaySchema)) body: SavePaymentGatewayInput,
  ): Promise<AdminPaymentSettings> {
    return this.gateways.save(tenant, operator, gateway, body);
  }

  @Put(':gateway/active')
  @RequirePermission('payments.manage')
  @Header('Cache-Control', 'no-store')
  setActive(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('gateway', new ZodValidationPipe(paymentGatewayParamSchema)) gateway: PaymentGatewayId,
    @Body(new ZodValidationPipe(setPaymentGatewayActiveSchema)) body: { active: boolean },
  ): Promise<AdminPaymentSettings> {
    return this.gateways.setActive(tenant, operator, gateway, body.active);
  }

  @Post(':gateway/test')
  @HttpCode(200)
  @RequirePermission('payments.manage')
  @Header('Cache-Control', 'no-store')
  test(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('gateway', new ZodValidationPipe(paymentGatewayParamSchema)) gateway: PaymentGatewayId,
  ): Promise<PaymentGatewayTestResult> {
    return this.gateways.test(tenant, gateway);
  }
}

/** Carteira > Depósitos: a mesma permissão do menu (todo perfil consulta). */
@Controller('v1/admin/deposits')
@UseGuards(ConsoleGuard, OperatorGuard)
export class DepositsAdminController {
  constructor(@Inject(DepositsService) private readonly deposits: DepositsService) {}

  @Get()
  @RequirePermission('users.read')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Query(new ZodValidationPipe(listDepositsQuerySchema)) query: ListDepositsQuery,
  ): Promise<AdminDepositList> {
    return this.deposits.list(tenant, query, hasPermission(operator.role, 'payments.read'));
  }

  /** Depósito em análise (pago por outro titular): liberar o crédito ou recusar. Só o Gerente. */
  @Post(':id/review')
  @HttpCode(200)
  @RequirePermission('payments.manage')
  @Header('Cache-Control', 'no-store')
  review(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(depositIdSchema)) id: string,
    @Body(new ZodValidationPipe(reviewDepositSchema)) body: { approve: boolean },
  ): Promise<AdminDepositListItem> {
    return this.deposits.review(tenant, operator, id, body.approve);
  }
}
