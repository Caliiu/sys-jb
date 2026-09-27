import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { OperatorLoginResponse, OperatorMeResponse } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
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
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
      },
    };
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Headers(OPERATOR_HEADER) token?: string): Promise<void> {
    await this.auth.logout(token);
  }
}
