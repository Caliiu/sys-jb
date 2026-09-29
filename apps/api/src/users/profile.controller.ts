import { Body, Controller, Get, Header, HttpCode, Inject, Patch, Post, UseGuards } from '@nestjs/common';
import type { PublicProfile, SupportContact } from '@sysjb/contracts';
import { CurrentSession, SessionGuard } from '../auth/session.guard.js';
import type { UserSession } from '../auth/session.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { ProfileService } from './profile.service.js';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type UpdateProfileInput,
  updateProfileSchema,
} from './user.schemas.js';

/**
 * Perfil do próprio usuário. Exige a credencial de serviço da banca E a sessão do cliente (X-Session-Token):
 * não há id na rota, então só dá para ver e alterar a conta da sessão.
 */
@Controller('v1/me')
@UseGuards(TenantGuard, SessionGuard)
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profile: ProfileService) {}

  @Get('profile')
  @Header('Cache-Control', 'no-store')
  get(@CurrentTenant() tenant: ResolvedTenant, @CurrentSession() session: UserSession): Promise<PublicProfile> {
    return this.profile.get(tenant, session.userId);
  }

  /** WhatsApp do atendimento (promotor vinculado ou, sem ele, a banca). */
  @Get('support')
  @Header('Cache-Control', 'no-store')
  support(@CurrentTenant() tenant: ResolvedTenant, @CurrentSession() session: UserSession): Promise<SupportContact> {
    return this.profile.support(tenant, session.userId);
  }

  @Patch()
  @Header('Cache-Control', 'no-store')
  update(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<PublicProfile> {
    return this.profile.update(tenant, session.userId, body);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentSession() session: UserSession,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ): Promise<void> {
    await this.profile.changePassword(tenant, session, body.password);
  }
}
