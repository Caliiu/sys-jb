import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { OperatorLoginResponse, OperatorMeResponse } from '@sysjb/contracts';
import { RateLimitIp } from '../rate-limit/rate-limit.interceptor.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { toPublicTenant } from '../tenancy/tenant-mapper.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type OperatorLoginInput, operatorLoginSchema } from './admin.schemas.js';
import { ConsoleGuard } from './console.guard.js';
import { OperatorAuthService, toPublicOperator } from './operator-auth.service.js';
import { CurrentOperator, OPERATOR_HEADER, OperatorGuard } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Sessão do operador do painel único. Todas as rotas exigem a credencial do painel (ADMIN_SERVICE_KEY). */
@Controller('v1/admin')
@UseGuards(ConsoleGuard)
export class AdminAuthController {
  constructor(@Inject(OperatorAuthService) private readonly auth: OperatorAuthService) {}

  @Post('auth/login')
  @RateLimitIp('login_ip')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(@Body(new ZodValidationPipe(operatorLoginSchema)) body: OperatorLoginInput): Promise<OperatorLoginResponse> {
    return this.auth.login(body);
  }

  @Get('me')
  @UseGuards(OperatorGuard)
  @Header('Cache-Control', 'no-store')
  me(@CurrentOperator() operator: AuthenticatedOperator, @CurrentTenant() tenant: ResolvedTenant): OperatorMeResponse {
    return {
      operator: toPublicOperator(operator),
      tenant: toPublicTenant(tenant),
    };
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Headers(OPERATOR_HEADER) token?: string): Promise<void> {
    await this.auth.logout(token);
  }
}
