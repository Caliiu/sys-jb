import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import type { PublicQuotes } from '@sysjb/contracts';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { QuotesService } from './quotes.service.js';

/** Cotações da banca para o jogador logado (Relatórios > Cotações e as telas de aposta). */
@Controller('v1/quotes')
@UseGuards(TenantGuard, SessionGuard)
export class QuotesController {
  constructor(@Inject(QuotesService) private readonly quotes: QuotesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@CurrentTenant() tenant: ResolvedTenant): Promise<PublicQuotes> {
    return this.quotes.get(tenant);
  }
}
