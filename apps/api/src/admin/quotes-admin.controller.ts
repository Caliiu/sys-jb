import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AdminGiftMilharSettings, AdminQuoteTable, AdminQuoteTableSummary } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { QuotesService } from '../quotes/quotes.service.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import {
  type CreateQuoteTableInput,
  type RenameQuoteTableInput,
  type SetFazendinhaQuotesInput,
  type SetGiftMilharInput,
  type SetTraditionalQuotesInput,
  createQuoteTableSchema,
  quoteTableIdSchema,
  renameQuoteTableSchema,
  setFazendinhaQuotesSchema,
  setGiftMilharSchema,
  setTraditionalQuotesSchema,
} from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/**
 * Tabelas de cotação da banca no painel: consultar exige `quotes.read`; criar, renomear, editar prêmios, escolher a
 * padrão e excluir exigem `quotes.manage` (tudo auditado). O Milhar Brinde fica aqui também (é prêmio pago pela
 * cotação da milhar): consultar com `quotes.read`, alterar com `quotes.manage` (auditado).
 */
@Controller('v1/admin/quote-tables')
@UseGuards(ConsoleGuard, OperatorGuard)
export class QuotesAdminController {
  constructor(@Inject(QuotesService) private readonly quotes: QuotesService) {}

  @Get()
  @RequirePermission('quotes.read')
  @Header('Cache-Control', 'no-store')
  list(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminQuoteTableSummary[]> {
    return this.quotes.list(tenant);
  }

  // Rotas fixas antes de ':id'.
  @Get('gift-milhar')
  @RequirePermission('quotes.read')
  @Header('Cache-Control', 'no-store')
  getGiftMilhar(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminGiftMilharSettings> {
    return this.quotes.getGiftMilhar(tenant);
  }

  @Put('gift-milhar')
  @RequirePermission('quotes.manage')
  @Header('Cache-Control', 'no-store')
  setGiftMilhar(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(setGiftMilharSchema)) body: SetGiftMilharInput,
  ): Promise<AdminGiftMilharSettings> {
    return this.quotes.setGiftMilhar(tenant, operator, body);
  }

  @Get(':id')
  @RequirePermission('quotes.read')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(quoteTableIdSchema)) id: string,
  ): Promise<AdminQuoteTable> {
    return this.quotes.get(tenant, id);
  }

  @Post()
  @RequirePermission('quotes.manage')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(createQuoteTableSchema)) body: CreateQuoteTableInput,
  ): Promise<AdminQuoteTable> {
    return this.quotes.create(tenant, operator, body);
  }

  @Patch(':id')
  @RequirePermission('quotes.manage')
  @Header('Cache-Control', 'no-store')
  rename(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(quoteTableIdSchema)) id: string,
    @Body(new ZodValidationPipe(renameQuoteTableSchema)) body: RenameQuoteTableInput,
  ): Promise<AdminQuoteTable> {
    return this.quotes.rename(tenant, operator, id, body);
  }

  @Post(':id/default')
  @HttpCode(200)
  @RequirePermission('quotes.manage')
  @Header('Cache-Control', 'no-store')
  setDefault(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(quoteTableIdSchema)) id: string,
  ): Promise<AdminQuoteTable> {
    return this.quotes.setDefault(tenant, operator, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('quotes.manage')
  remove(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(quoteTableIdSchema)) id: string,
  ): Promise<void> {
    return this.quotes.remove(tenant, operator, id);
  }

  @Put(':id/tradicional')
  @RequirePermission('quotes.manage')
  @Header('Cache-Control', 'no-store')
  setTraditional(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(quoteTableIdSchema)) id: string,
    @Body(new ZodValidationPipe(setTraditionalQuotesSchema)) body: SetTraditionalQuotesInput,
  ): Promise<AdminQuoteTable> {
    return this.quotes.setTraditional(tenant, operator, id, body);
  }

  @Put(':id/fazendinha')
  @RequirePermission('quotes.manage')
  @Header('Cache-Control', 'no-store')
  setFazendinha(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(quoteTableIdSchema)) id: string,
    @Body(new ZodValidationPipe(setFazendinhaQuotesSchema)) body: SetFazendinhaQuotesInput,
  ): Promise<AdminQuoteTable> {
    return this.quotes.setFazendinha(tenant, operator, id, body);
  }
}
