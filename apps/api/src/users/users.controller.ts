import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { PublicUser } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant, TenantGuard } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import {
  type CreateUserInput,
  createUserSchema,
  type UpdateUserInput,
  updateUserSchema,
  userIdSchema,
} from './user.schemas.js';
import { UsersService } from './users.service.js';

@Controller('v1/users')
@UseGuards(TenantGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ): Promise<PublicUser> {
    return this.users.create(tenant, body);
  }

  @Get(':id')
  get(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
  ): Promise<PublicUser> {
    return this.users.get(tenant, id);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(userIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ): Promise<PublicUser> {
    return this.users.update(tenant, id, body);
  }
}
