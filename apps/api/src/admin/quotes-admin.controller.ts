import { Body, Controller, Get, Header, Inject, Put, UseGuards } from '@nestjs/common';
import type { PublicQuotes } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { QuotesService } from '../quotes/quotes.service.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import {
  type SetFazendinhaQuotesInput,
  type SetTraditionalQuotesInput,
  setFazendinhaQuotesSchema,
  setTraditionalQuotesSchema,
} from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Cotações da banca no painel: consultar exige `quotes.read`; editar, `quotes.manage` (com auditoria). */
@Controller('v1/admin/quotes')
@UseGuards(ConsoleGuard, OperatorGuard)
export class QuotesAdminController {
  constructor(@Inject(QuotesService) private readonly quotes: QuotesService) {}

  @Get()
  @RequirePermission('quotes.read')
  @Header('Cache-Control', 'no-store')
  get(@CurrentTenant() tenant: ResolvedTenant): Promise<PublicQuotes> {
    return this.quotes.get(tenant);
  }

  @Put('tradicional')
  @RequirePermission('quotes.manage')
  @Header('Cache-Control', 'no-store')
  setTraditional(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(setTraditionalQuotesSchema)) body: SetTraditionalQuotesInput,
  ): Promise<PublicQuotes> {
    return this.quotes.setTraditional(tenant, operator, body);
  }

  @Put('fazendinha')
  @RequirePermission('quotes.manage')
  @Header('Cache-Control', 'no-store')
  setFazendinha(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(setFazendinhaQuotesSchema)) body: SetFazendinhaQuotesInput,
  ): Promise<PublicQuotes> {
    return this.quotes.setFazendinha(tenant, operator, body);
  }
}
