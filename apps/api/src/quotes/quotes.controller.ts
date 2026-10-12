import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import type { PublicQuotes } from '@sysjb/contracts';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { QuotesService } from './quotes.service.js';

/**
 * Cotações para o jogador logado (Relatórios > Cotações e as telas de aposta): a tabela dele, ou a padrão da banca
 * quando ele não tem tabela própria. É a mesma tabela que a compra usa.
 */
@Controller('v1/quotes')
@UseGuards(TenantGuard, SessionGuard)
export class QuotesController {
  constructor(@Inject(QuotesService) private readonly quotes: QuotesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@CurrentTenant() tenant: ResolvedTenant, @CurrentSession() session: UserSession): Promise<PublicQuotes> {
    return this.quotes.getForUser(tenant, session.userId);
  }
}
