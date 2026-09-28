import { Body, Controller, Get, Header, Inject, Post, Query, UseGuards } from '@nestjs/common';
import type { FazendinhaSoldEntry, PlaceFazendinhaBetResponse } from '@sysjb/contracts';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type PlaceBetInput, placeBetSchema, type SoldQuery, soldQuerySchema } from './fazendinha.schemas.js';
import { FazendinhaService } from './fazendinha.service.js';

/**
 * Fazendinha do cliente logado: exige a credencial de serviço da banca E a sessão (X-Session-Token).
 * A compra é sempre em nome do usuário da sessão.
 */
@Controller('v1/fazendinha')
@UseGuards(TenantGuard, SessionGuard)
export class FazendinhaController {
  constructor(@Inject(FazendinhaService) private readonly fazendinha: FazendinhaService) {}

  @Post('bets')
  @Header('Cache-Control', 'no-store')
  place(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(placeBetSchema)) body: PlaceBetInput,
  ): Promise<PlaceFazendinhaBetResponse> {
    return this.fazendinha.place(tenant, session, body);
  }

  @Get('sold')
  @Header('Cache-Control', 'no-store')
  sold(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(soldQuerySchema)) query: SoldQuery,
  ): Promise<FazendinhaSoldEntry[]> {
    return this.fazendinha.sold(tenant, query.drawDate);
  }
}
