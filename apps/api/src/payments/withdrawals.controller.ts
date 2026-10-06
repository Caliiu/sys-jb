import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  type AdminWithdrawalList,
  type AdminWithdrawalListItem,
  type MyWithdrawals,
  type WithdrawalResult,
  type WithdrawalSettings,
  hasPermission,
} from '@sysjb/contracts';
import { ConsoleGuard } from '../admin/console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from '../admin/operator.guard.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import {
  type CreateWithdrawalInput,
  type ListWithdrawalsQuery,
  type ReviewWithdrawalInput,
  type WithdrawalSettingsInput,
  createWithdrawalSchema,
  listWithdrawalsQuerySchema,
  resolveWithdrawalSchema,
  reviewWithdrawalSchema,
  withdrawalIdSchema,
  withdrawalSettingsSchema,
} from './withdrawals.schemas.js';
import { WithdrawalsService } from './withdrawals.service.js';

/** Saques do jogador logado: sempre do usuário da sessão, nunca de outro. */
@Controller('v1/payments/withdrawals')
@UseGuards(TenantGuard, SessionGuard)
export class WithdrawalsController {
  constructor(@Inject(WithdrawalsService) private readonly withdrawals: WithdrawalsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  mine(@CurrentTenant() tenant: ResolvedTenant, @CurrentSession() session: UserSession): Promise<MyWithdrawals> {
    return this.withdrawals.mine(tenant, session);
  }

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(createWithdrawalSchema)) body: CreateWithdrawalInput,
  ): Promise<WithdrawalResult> {
    return this.withdrawals.create(tenant, session, body);
  }

  /** Cancela o próprio saque enquanto está em análise (o valor volta para os prêmios). */
  @Post(':id/cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  cancel(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Param('id', new ZodValidationPipe(withdrawalIdSchema)) id: string,
  ): Promise<WithdrawalResult> {
    return this.withdrawals.cancel(tenant, session, id);
  }
}

/** Carteira > Saques: consultar é a permissão do menu (todo perfil); aprovar, recusar e concluir, só o Gerente. */
@Controller('v1/admin/withdrawals')
@UseGuards(ConsoleGuard, OperatorGuard)
export class WithdrawalsAdminController {
  constructor(@Inject(WithdrawalsService) private readonly withdrawals: WithdrawalsService) {}

  @Get()
  @RequirePermission('users.read')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Query(new ZodValidationPipe(listWithdrawalsQuerySchema)) query: ListWithdrawalsQuery,
  ): Promise<AdminWithdrawalList> {
    return this.withdrawals.list(tenant, query, hasPermission(operator.role, 'payments.read'));
  }

  @Post(':id/review')
  @HttpCode(200)
  @RequirePermission('payments.manage')
  @Header('Cache-Control', 'no-store')
  review(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(withdrawalIdSchema)) id: string,
    @Body(new ZodValidationPipe(reviewWithdrawalSchema)) body: ReviewWithdrawalInput,
  ): Promise<AdminWithdrawalListItem> {
    return this.withdrawals.review(tenant, operator, id, body.approve, body.note);
  }

  /** Envio sem resposta: o Gerente conferiu no painel do gateway e informa se foi pago. */
  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermission('payments.manage')
  @Header('Cache-Control', 'no-store')
  resolve(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(withdrawalIdSchema)) id: string,
    @Body(new ZodValidationPipe(resolveWithdrawalSchema)) body: { paid: boolean },
  ): Promise<AdminWithdrawalListItem> {
    return this.withdrawals.resolve(tenant, operator, id, body.paid);
  }
}

/** Configurações > Pagamentos > Saques: limites da banca. */
@Controller('v1/admin/withdrawal-settings')
@UseGuards(ConsoleGuard, OperatorGuard)
export class WithdrawalSettingsController {
  constructor(@Inject(WithdrawalsService) private readonly withdrawals: WithdrawalsService) {}

  @Get()
  @RequirePermission('payments.read')
  @Header('Cache-Control', 'no-store')
  get(@CurrentTenant() tenant: ResolvedTenant): Promise<WithdrawalSettings> {
    return this.withdrawals.settings(tenant);
  }

  @Put()
  @RequirePermission('payments.manage')
  @Header('Cache-Control', 'no-store')
  save(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(withdrawalSettingsSchema)) body: WithdrawalSettingsInput,
  ): Promise<WithdrawalSettings> {
    return this.withdrawals.saveSettings(tenant, operator, body);
  }
}
