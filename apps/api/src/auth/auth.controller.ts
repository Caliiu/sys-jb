import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { LoginResponse, PublicUser } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type LoginInput, loginSchema } from '../users/user.schemas.js';
import { AuthService } from './auth.service.js';

/** Header com o token de sessão do cliente (a credencial de serviço continua em Authorization). */
export const SESSION_HEADER = 'x-session-token';

@Controller('v1')
@UseGuards(TenantGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
  ): Promise<LoginResponse> {
    return this.auth.login(tenant, body);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentTenant() tenant: ResolvedTenant, @Headers(SESSION_HEADER) token?: string): Promise<PublicUser> {
    return this.auth.me(tenant, token);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@CurrentTenant() tenant: ResolvedTenant, @Headers(SESSION_HEADER) token?: string): Promise<void> {
    await this.auth.logout(tenant, token);
  }
}
