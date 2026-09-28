import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import type { DrawSchedule } from '@sysjb/contracts';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { DrawsService } from './draws.service.js';

/** Sorteios da banca para o jogador logado (telas de Loterias e Fazendinha). */
@Controller('v1/draws')
@UseGuards(TenantGuard, SessionGuard)
export class DrawsController {
  constructor(@Inject(DrawsService) private readonly draws: DrawsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  schedule(@CurrentTenant() tenant: ResolvedTenant): Promise<DrawSchedule> {
    return this.draws.schedule(tenant);
  }
}
