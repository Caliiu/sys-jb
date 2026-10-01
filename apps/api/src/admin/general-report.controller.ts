import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { AdminGeneralReport } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type GeneralReportQuery, generalReportQuerySchema } from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { GeneralReportService } from './general-report.service.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';

/** Relatório geral da banca do operador: só consulta, com `operation.read` (Gerente e Financeiro). */
@Controller('v1/admin/reports/general')
@UseGuards(ConsoleGuard, OperatorGuard)
export class GeneralReportController {
  constructor(@Inject(GeneralReportService) private readonly reports: GeneralReportService) {}

  @Get()
  @RequirePermission('operation.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(generalReportQuerySchema)) query: GeneralReportQuery,
  ): Promise<AdminGeneralReport> {
    return this.reports.report(tenant, query);
  }
}
