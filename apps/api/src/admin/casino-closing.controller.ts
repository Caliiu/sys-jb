import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { AdminCasinoClosing } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type CasinoClosingQuery, casinoClosingQuerySchema } from './admin.schemas.js';
import { CasinoClosingService } from './casino-closing.service.js';
import { ConsoleGuard } from './console.guard.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';

/** Fechamento cassino da banca do operador: só consulta, com `operation.read` (Gerente e Financeiro). */
@Controller('v1/admin/reports/casino/closing')
@UseGuards(ConsoleGuard, OperatorGuard)
export class CasinoClosingController {
  constructor(@Inject(CasinoClosingService) private readonly reports: CasinoClosingService) {}

  @Get()
  @RequirePermission('operation.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(casinoClosingQuerySchema)) query: CasinoClosingQuery,
  ): Promise<AdminCasinoClosing> {
    return this.reports.report(tenant, query);
  }
}
