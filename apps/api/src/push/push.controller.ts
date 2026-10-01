import { Body, Controller, Delete, Header, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import {
  type PushSubscriptionInput,
  type PushUnsubscribeInput,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from './push.schemas.js';
import { PushService } from './push.service.js';

/** Aparelhos do jogador logado inscritos nas notificações do app instalado. */
@Controller('v1/me/push-subscriptions')
@UseGuards(TenantGuard, SessionGuard)
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}

  @Post()
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async subscribe(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(pushSubscriptionSchema)) body: PushSubscriptionInput,
  ): Promise<void> {
    await this.push.subscribe(tenant, session, body);
  }

  @Delete()
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async unsubscribe(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: PushUnsubscribeInput,
  ): Promise<void> {
    await this.push.unsubscribe(tenant, session, body.endpoint);
  }
}
