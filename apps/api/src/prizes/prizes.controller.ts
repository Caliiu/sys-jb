import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { PrizeClaim, PrizesReport } from '@sysjb/contracts';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type ClaimQuery, claimQuerySchema, type PrizesQuery, prizesQuerySchema } from './prizes.schemas.js';
import { PrizesService } from './prizes.service.js';

/** Premiadas (Consultar premiadas e Reclame): sempre do jogador da sessão, nunca de outro usuário. */
@Controller('v1/me/prizes')
@UseGuards(TenantGuard, SessionGuard)
export class PrizesController {
  constructor(@Inject(PrizesService) private readonly prizes: PrizesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  report(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Query(new ZodValidationPipe(prizesQuerySchema)) query: PrizesQuery,
  ): Promise<PrizesReport> {
    return this.prizes.report(tenant, session, query.date);
  }

  @Get('claim')
  @Header('Cache-Control', 'no-store')
  claim(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Query(new ZodValidationPipe(claimQuerySchema)) query: ClaimQuery,
  ): Promise<PrizeClaim> {
    return this.prizes.claim(tenant, session, query.pule);
  }
}
