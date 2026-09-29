import { Body, Controller, Header, Inject, Post, UseGuards } from '@nestjs/common';
import type { PlaceLotteryTicketsResponse } from '@sysjb/contracts';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import {
  type PlaceLotteryTicketsInput,
  type RepeatLotteryTicketInput,
  placeLotteryTicketsSchema,
  repeatLotteryTicketSchema,
} from './lotteries.schemas.js';
import { LotteriesService } from './lotteries.service.js';

/** Loterias do cliente logado: credencial da banca E sessão; a compra é sempre em nome do usuário da sessão. */
@Controller('v1/lotteries')
@UseGuards(TenantGuard, SessionGuard)
export class LotteriesController {
  constructor(@Inject(LotteriesService) private readonly lotteries: LotteriesService) {}

  @Post('tickets')
  @Header('Cache-Control', 'no-store')
  place(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(placeLotteryTicketsSchema)) body: PlaceLotteryTicketsInput,
  ): Promise<PlaceLotteryTicketsResponse> {
    return this.lotteries.place(tenant, session, body);
  }

  /** Repetir pule: as apostas de uma pule do próprio jogador, na data e nas loterias escolhidas. */
  @Post('tickets/repeat')
  @Header('Cache-Control', 'no-store')
  repeat(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(repeatLotteryTicketSchema)) body: RepeatLotteryTicketInput,
  ): Promise<PlaceLotteryTicketsResponse> {
    return this.lotteries.repeat(tenant, session, body);
  }
}
