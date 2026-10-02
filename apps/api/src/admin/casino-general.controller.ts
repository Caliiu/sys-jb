import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { AdminCasinoGeneralReport } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type CasinoGeneralQuery, casinoGeneralQuerySchema } from './admin.schemas.js';
import { CasinoGeneralService } from './casino-general.service.js';
import { ConsoleGuard } from './console.guard.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';

/** Geral cassino da banca do operador: só consulta, com `operation.read` (Gerente e Financeiro). */
@Controller('v1/admin/reports/casino/general')
@UseGuards(ConsoleGuard, OperatorGuard)
export class CasinoGeneralController {
  constructor(@Inject(CasinoGeneralService) private readonly reports: CasinoGeneralService) {}

  @Get()
  @RequirePermission('operation.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(casinoGeneralQuerySchema)) query: CasinoGeneralQuery,
  ): Promise<AdminCasinoGeneralReport> {
    return this.reports.report(tenant, query);
  }
}
