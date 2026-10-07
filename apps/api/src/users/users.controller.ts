import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { PublicUser } from '@sysjb/contracts';
import { RateLimitIp } from '../rate-limit/rate-limit.interceptor.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type CreateUserInput, createUserSchema } from './user.schemas.js';
import { UsersService } from './users.service.js';

/**
 * Cadastro de jogador (sem login: a banca vem do hostname e da credencial de serviço). Consulta e alteração de dados
 * só pelo próprio jogador logado (/v1/me) ou pelo painel (/v1/admin/users), nunca por id com a credencial de serviço.
 */
@Controller('v1/users')
@UseGuards(TenantGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Post()
  @RateLimitIp('signup_ip')
  @HttpCode(201)
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ): Promise<PublicUser> {
    return this.users.create(tenant, body);
  }
}
