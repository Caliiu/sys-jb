import { Body, Controller, Delete, Get, Header, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { AdminDrawsResponse } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateDrawExceptionInput,
  type SaveDrawInput,
  createDrawExceptionSchema,
  drawIdSchema,
  saveDrawSchema,
} from '../draws/draws.schemas.js';
import { DrawsService } from '../draws/draws.service.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Sorteios no painel: consultar exige `draws.read`; cadastrar/alterar/excluir, `draws.manage` (com auditoria). */
@Controller('v1/admin/draws')
@UseGuards(ConsoleGuard, OperatorGuard)
export class DrawsAdminController {
  constructor(@Inject(DrawsService) private readonly draws: DrawsService) {}

  @Get()
  @RequirePermission('draws.read')
  @Header('Cache-Control', 'no-store')
  list(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminDrawsResponse> {
    return this.draws.list(tenant);
  }

  @Post()
  @RequirePermission('draws.manage')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(saveDrawSchema)) body: SaveDrawInput,
  ): Promise<AdminDrawsResponse> {
    return this.draws.create(tenant, operator, body);
  }

  @Post('exceptions')
  @RequirePermission('draws.manage')
  @Header('Cache-Control', 'no-store')
  createException(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(createDrawExceptionSchema)) body: CreateDrawExceptionInput,
  ): Promise<AdminDrawsResponse> {
    return this.draws.createException(tenant, operator, body);
  }

  @Delete('exceptions/:id')
  @RequirePermission('draws.manage')
  @Header('Cache-Control', 'no-store')
  removeException(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(drawIdSchema)) id: string,
  ): Promise<AdminDrawsResponse> {
    return this.draws.removeException(tenant, operator, id);
  }

  @Put(':id')
  @RequirePermission('draws.manage')
  @Header('Cache-Control', 'no-store')
  update(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(drawIdSchema)) id: string,
    @Body(new ZodValidationPipe(saveDrawSchema)) body: SaveDrawInput,
  ): Promise<AdminDrawsResponse> {
    return this.draws.update(tenant, operator, id, body);
  }

  @Delete(':id')
  @RequirePermission('draws.manage')
  @Header('Cache-Control', 'no-store')
  remove(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(drawIdSchema)) id: string,
  ): Promise<AdminDrawsResponse> {
    return this.draws.remove(tenant, operator, id);
  }
}
