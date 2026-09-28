import { Body, Controller, Get, Header, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AdminUserDetail, AdminUserListItem, Page } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type AdminUpdateUserInput, adminUpdateUserSchema, userIdSchema } from '../users/user.schemas.js';
import { AdminUsersService } from './admin-users.service.js';
import {
  type ListUsersQuery,
  listUsersQuerySchema,
  type SetUserStatusInput,
  setUserStatusSchema,
  type WalletCreditInput,
  walletCreditSchema,
} from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Usuários vistos pelo operador. Cada rota exige a permissão correspondente ao perfil. */
@Controller('v1/admin/users')
@UseGuards(ConsoleGuard, OperatorGuard)
export class AdminUsersController {
  constructor(@Inject(AdminUsersService) private readonly users: AdminUsersService) {}

  @Get()
  @RequirePermission('users.read')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<Page<AdminUserListItem>> {
    return this.users.list(tenant, query);
  }

  @Get(':id')
  @RequirePermission('users.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
  ): Promise<AdminUserDetail> {
    return this.users.get(tenant, id);
  }

  @Patch(':id')
  @RequirePermission('users.update')
  @Header('Cache-Control', 'no-store')
  update(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
    @Body(new ZodValidationPipe(adminUpdateUserSchema)) body: AdminUpdateUserInput,
  ): Promise<AdminUserDetail> {
    return this.users.update(tenant, operator, id, body);
  }

  @Patch(':id/status')
  @RequirePermission('users.status')
  @Header('Cache-Control', 'no-store')
  setStatus(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
    @Body(new ZodValidationPipe(setUserStatusSchema)) body: SetUserStatusInput,
  ): Promise<AdminUserDetail> {
    return this.users.setStatus(tenant, operator, id, body.status);
  }

  /** Adiciona saldo, bônus ou disponível em games. Repetir a mesma chave não credita de novo (200 igual). */
  @Post(':id/wallet/credits')
  @RequirePermission('wallet.adjust')
  @Header('Cache-Control', 'no-store')
  creditWallet(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
    @Body(new ZodValidationPipe(walletCreditSchema)) body: WalletCreditInput,
  ): Promise<AdminUserDetail> {
    return this.users.creditWallet(tenant, operator, id, body);
  }
}
