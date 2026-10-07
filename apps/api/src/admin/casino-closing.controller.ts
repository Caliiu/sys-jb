import { Body, Controller, Get, Header, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import type { AdminCasinoClosing, CasinoClosingPayResult } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import {
  type CasinoClosingPayInput,
  type CasinoClosingQuery,
  casinoClosingPaySchema,
  casinoClosingQuerySchema,
} from './admin.schemas.js';
import { CasinoClosingService } from './casino-closing.service.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/**
 * Fechamento cassino da banca do operador: consulta com `operation.read` (Gerente e Financeiro); pagar com
 * `commissions.manage` (só o Gerente; o banco confere o perfil de novo).
 */
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

  /** Paga a comissão do mês encerrado a um promotor (promoterId) ou a todos os pendentes. */
  @Post('pay')
  @HttpCode(200)
  @RequirePermission('commissions.manage')
  @Header('Cache-Control', 'no-store')
  pay(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(casinoClosingPaySchema)) body: CasinoClosingPayInput,
  ): Promise<CasinoClosingPayResult> {
    return this.reports.pay(tenant, operator, body);
  }
}
