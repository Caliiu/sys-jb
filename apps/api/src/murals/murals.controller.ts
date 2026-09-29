import { Controller, Get, Header, HttpCode, Inject, Param, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { PublicMural } from '@sysjb/contracts';
import type { Response } from 'express';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { muralIdSchema } from './murals.schemas.js';
import { MuralsService } from './murals.service.js';

/** Mural para o jogador logado: os avisos no ar que ele deve ver, a imagem e o registro de "já vi". */
@Controller('v1/murals')
@UseGuards(TenantGuard, SessionGuard)
export class MuralsController {
  constructor(@Inject(MuralsService) private readonly murals: MuralsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentTenant() tenant: ResolvedTenant, @CurrentSession() session: UserSession): Promise<PublicMural[]> {
    return this.murals.forPlayer(tenant, session.userId);
  }

  @Get(':id/image')
  async image(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(muralIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const image = await this.murals.playerImage(tenant, id);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(image.data, { type: image.type, length: image.data.byteLength });
  }

  @Post(':id/seen')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async seen(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Param('id', new ZodValidationPipe(muralIdSchema)) id: string,
  ): Promise<void> {
    await this.murals.markSeen(tenant, session.userId, id);
  }
}
