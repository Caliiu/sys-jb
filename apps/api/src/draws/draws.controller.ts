import { Controller, Get, Header, Inject, Param, UseGuards } from '@nestjs/common';
import type { DrawOverdueResponse, DrawSchedule } from '@sysjb/contracts';
import { SessionGuard } from '../auth/session.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OverdueService } from '../overdue/overdue.service.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { drawIdSchema } from './draws.schemas.js';
import { DrawsService } from './draws.service.js';

/** Sorteios da banca para o jogador logado (telas de Loterias, Fazendinha e Atrasados). */
@Controller('v1/draws')
@UseGuards(TenantGuard, SessionGuard)
export class DrawsController {
  constructor(
    @Inject(DrawsService) private readonly draws: DrawsService,
    @Inject(OverdueService) private readonly overdueService: OverdueService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  schedule(@CurrentTenant() tenant: ResolvedTenant): Promise<DrawSchedule> {
    return this.draws.schedule(tenant);
  }

  /** Loterias > Atrasados: há quantos dias cada grupo não sai na cabeça do sorteio. */
  @Get(':id/overdue')
  @Header('Cache-Control', 'no-store')
  overdue(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(drawIdSchema)) id: string,
  ): Promise<DrawOverdueResponse> {
    return this.overdueService.forDraw(tenant, id);
  }
}
