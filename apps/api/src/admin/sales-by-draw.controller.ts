import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { AdminSalesByDrawReport } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type SalesByDrawQuery, salesByDrawQuerySchema } from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';
import { SalesByDrawService } from './sales-by-draw.service.js';

/** Vendas por extração da banca do operador: só consulta, com `operation.read` (Gerente e Financeiro). */
@Controller('v1/admin/reports/sales-by-draw')
@UseGuards(ConsoleGuard, OperatorGuard)
export class SalesByDrawController {
  constructor(@Inject(SalesByDrawService) private readonly reports: SalesByDrawService) {}

  @Get()
  @RequirePermission('operation.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(salesByDrawQuerySchema)) query: SalesByDrawQuery,
  ): Promise<AdminSalesByDrawReport> {
    return this.reports.report(tenant, query);
  }
}
