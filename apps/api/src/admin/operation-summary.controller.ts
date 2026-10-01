import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { AdminOperationSummary } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type OperationSummaryQuery, operationSummaryQuerySchema } from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { OperationSummaryService } from './operation-summary.service.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';

/** Resumo da operação da banca do operador: só consulta, com `operation.read` (Gerente e Financeiro). */
@Controller('v1/admin/operation-summary')
@UseGuards(ConsoleGuard, OperatorGuard)
export class OperationSummaryController {
  constructor(@Inject(OperationSummaryService) private readonly summary: OperationSummaryService) {}

  @Get()
  @RequirePermission('operation.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(operationSummaryQuerySchema)) query: OperationSummaryQuery,
  ): Promise<AdminOperationSummary> {
    return this.summary.summary(tenant, query);
  }
}
