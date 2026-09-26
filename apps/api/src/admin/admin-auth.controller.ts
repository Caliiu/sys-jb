import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { OperatorLoginResponse, PublicOperator } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type OperatorLoginInput, operatorLoginSchema } from './admin.schemas.js';
import { OperatorAuthService, toPublicOperator } from './operator-auth.service.js';
import { CurrentOperator, OPERATOR_HEADER, OperatorGuard } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Sessão do operador do painel. Todas as rotas exigem a credencial de serviço da banca. */
@Controller('v1/admin')
@UseGuards(TenantGuard)
export class AdminAuthController {
  constructor(@Inject(OperatorAuthService) private readonly auth: OperatorAuthService) {}

  @Post('auth/login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodValidationPipe(operatorLoginSchema)) body: OperatorLoginInput,
  ): Promise<OperatorLoginResponse> {
    return this.auth.login(tenant, body);
  }

  @Get('me')
  @UseGuards(OperatorGuard)
  @Header('Cache-Control', 'no-store')
  me(@CurrentOperator() operator: AuthenticatedOperator): PublicOperator {
    return toPublicOperator(operator);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@CurrentTenant() tenant: ResolvedTenant, @Headers(OPERATOR_HEADER) token?: string): Promise<void> {
    await this.auth.logout(tenant, token);
  }
}
