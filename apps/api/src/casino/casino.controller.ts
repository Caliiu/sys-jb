import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { CasinoGamesPage, CasinoLaunchResponse, CasinoLobby } from '@sysjb/contracts';
import type { Response } from 'express';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { CasinoWebhookGuard } from './casino-webhook.guard.js';
import { CasinoWebhookService } from './casino-webhook.service.js';
import { type CasinoGamesQuery, casinoGameIdSchema, casinoGamesQuerySchema } from './casino.schemas.js';
import { CasinoService } from './casino.service.js';

/** Cassino do jogador logado: lobby, lista ("Ver todos" e busca) e abertura do jogo. */
@Controller('v1/casino')
@UseGuards(TenantGuard, SessionGuard)
export class CasinoController {
  constructor(@Inject(CasinoService) private readonly casino: CasinoService) {}

  @Get('lobby')
  @Header('Cache-Control', 'no-store')
  lobby(@CurrentTenant() tenant: ResolvedTenant): Promise<CasinoLobby> {
    return this.casino.lobby(tenant);
  }

  @Get('games')
  @Header('Cache-Control', 'no-store')
  games(@Query(new ZodValidationPipe(casinoGamesQuerySchema)) query: CasinoGamesQuery): Promise<CasinoGamesPage> {
    return this.casino.games(query);
  }

  @Post('games/:id/launch')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  launch(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Param('id', new ZodValidationPipe(casinoGameIdSchema)) id: number,
  ): Promise<CasinoLaunchResponse> {
    return this.casino.launch(tenant, session, id);
  }
}

/**
 * Webhook do provedor do cassino (PlayFivers): saldo e rodadas. Sem banca (o jogador diz qual é). A API não é exposta
 * à internet; o web repassa o POST público (/integracoes/cassino?token=...) para cá com o token num cabeçalho.
 */
@Controller('v1/integrations/casino')
@UseGuards(CasinoWebhookGuard)
export class CasinoWebhookController {
  constructor(@Inject(CasinoWebhookService) private readonly webhook: CasinoWebhookService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  async receive(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ msg: string; balance: number }> {
    const answer = await this.webhook.receive(body);
    res.status(answer.status);
    return answer.body;
  }
}
