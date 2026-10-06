import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { CrmInactiveList, CrmNeverDepositedList } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { ConsoleGuard } from './console.guard.js';
import {
  type CrmInactiveQuery,
  type CrmNeverDepositedQuery,
  crmInactiveQuerySchema,
  crmNeverDepositedQuerySchema,
} from './crm.schemas.js';
import { CrmService } from './crm.service.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';

/** CRM da banca do operador: só consulta, com a permissão de ver os apostadores (`users.read`, todo perfil). */
@Controller('v1/admin/crm')
@UseGuards(ConsoleGuard, OperatorGuard)
export class CrmController {
  constructor(@Inject(CrmService) private readonly crm: CrmService) {}

  @Get('inactive')
  @RequirePermission('users.read')
  @Header('Cache-Control', 'no-store')
  inactive(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(crmInactiveQuerySchema)) query: CrmInactiveQuery,
  ): Promise<CrmInactiveList> {
    return this.crm.inactive(tenant, query);
  }

  @Get('never-deposited')
  @RequirePermission('users.read')
  @Header('Cache-Control', 'no-store')
  neverDeposited(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(crmNeverDepositedQuerySchema)) query: CrmNeverDepositedQuery,
  ): Promise<CrmNeverDepositedList> {
    return this.crm.neverDeposited(tenant, query);
  }
}
