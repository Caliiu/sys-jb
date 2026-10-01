import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { AdminPrizeList } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type ListPrizesQuery, listPrizesQuerySchema } from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';
import { PrizesAdminService } from './prizes-admin.service.js';

/** Pules premiadas da banca do operador: só consulta, com `tickets.read` (quem vê os pules vê os prêmios deles). */
@Controller('v1/admin/prizes')
@UseGuards(ConsoleGuard, OperatorGuard)
export class PrizesAdminController {
  constructor(@Inject(PrizesAdminService) private readonly prizes: PrizesAdminService) {}

  @Get()
  @RequirePermission('tickets.read')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(listPrizesQuerySchema)) query: ListPrizesQuery,
  ): Promise<AdminPrizeList> {
    return this.prizes.list(tenant, query);
  }
}
