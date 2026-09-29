import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { LoginResponse, PublicUser } from '@sysjb/contracts';
import { RateLimitIp } from '../rate-limit/rate-limit.interceptor.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type LoginInput, loginSchema } from '../users/user.schemas.js';
import { AuthService } from './auth.service.js';
import { CurrentSession, SESSION_HEADER, SessionGuard } from './session.guard.js';
import type { UserSession } from './session.types.js';

@Controller('v1')
@UseGuards(TenantGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('auth/login')
  @RateLimitIp('login_ip')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
  ): Promise<LoginResponse> {
    return this.auth.login(tenant, body);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @Header('Cache-Control', 'no-store')
  me(@CurrentTenant() tenant: ResolvedTenant, @CurrentSession() session: UserSession): Promise<PublicUser> {
    return this.auth.me(tenant, session.userId);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@CurrentTenant() tenant: ResolvedTenant, @Headers(SESSION_HEADER) token?: string): Promise<void> {
    await this.auth.logout(tenant, token);
  }
}
