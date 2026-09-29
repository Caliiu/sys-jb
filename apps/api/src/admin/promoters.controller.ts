import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Put, Query, UseGuards } from '@nestjs/common';
import type { AdminPromoterListItem, AdminPromoterOption, AdminUserListItem, Page } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { userIdSchema } from '../users/user.schemas.js';
import {
  type ListPromotersQuery,
  listPromotersQuerySchema,
  type ReferralsQuery,
  referralsQuerySchema,
  type SetPromoterInput,
  setPromoterSchema,
} from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';
import { PromotersService } from './promoters.service.js';

/**
 * Promotores vistos pelo operador: ler exige `promoters.read`; promover, alterar e remover, `promoters.manage`.
 * Exceção: as opções do filtro da lista de usuários exigem só `users.read` (a lista já mostra o nome do promotor).
 */
@Controller('v1/admin/promoters')
@UseGuards(ConsoleGuard, OperatorGuard)
export class PromotersController {
  constructor(@Inject(PromotersService) private readonly promoters: PromotersService) {}

  @Get()
  @RequirePermission('promoters.read')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(listPromotersQuerySchema)) query: ListPromotersQuery,
  ): Promise<Page<AdminPromoterListItem>> {
    return this.promoters.list(tenant, query);
  }

  /** Declarada antes de `:id`, senão "options" seria lido como id. */
  @Get('options')
  @RequirePermission('users.read')
  @Header('Cache-Control', 'no-store')
  options(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminPromoterOption[]> {
    return this.promoters.options(tenant);
  }

  @Get(':id')
  @RequirePermission('promoters.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
  ): Promise<AdminPromoterListItem> {
    return this.promoters.get(tenant, id);
  }

  @Get(':id/referrals')
  @RequirePermission('promoters.read')
  @Header('Cache-Control', 'no-store')
  referrals(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
    @Query(new ZodValidationPipe(referralsQuerySchema)) query: ReferralsQuery,
  ): Promise<Page<AdminUserListItem>> {
    return this.promoters.referrals(tenant, id, query);
  }

  @Put(':id')
  @RequirePermission('promoters.manage')
  @Header('Cache-Control', 'no-store')
  set(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
    @Body(new ZodValidationPipe(setPromoterSchema)) body: SetPromoterInput,
  ): Promise<AdminPromoterListItem> {
    return this.promoters.set(tenant, operator, id, body.commissionBps);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('promoters.manage')
  async remove(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
  ): Promise<void> {
    await this.promoters.remove(tenant, operator, id);
  }
}
