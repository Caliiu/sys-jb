import { Body, Controller, Get, Header, Inject, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { AdminOperator, OperatorPasswordResponse } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';
import {
  type OperatorStatusInput,
  operatorIdSchema,
  operatorStatusSchema,
  type SaveOperatorInput,
  saveOperatorSchema,
} from './operators.schemas.js';
import { OperatorsService } from './operators.service.js';

/** Administração > Operadores: só o Gerente (`operators.manage`), na própria banca, com auditoria. */
@Controller('v1/admin/operators')
@UseGuards(ConsoleGuard, OperatorGuard)
@RequirePermission('operators.manage')
export class OperatorsController {
  constructor(@Inject(OperatorsService) private readonly operators: OperatorsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() actor: AuthenticatedOperator,
  ): Promise<AdminOperator[]> {
    return this.operators.list(tenant, actor);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() actor: AuthenticatedOperator,
    @Body(new ZodValidationPipe(saveOperatorSchema)) body: SaveOperatorInput,
  ): Promise<OperatorPasswordResponse> {
    return this.operators.create(tenant, actor, body);
  }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() actor: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(operatorIdSchema)) id: string,
    @Body(new ZodValidationPipe(saveOperatorSchema)) body: SaveOperatorInput,
  ): Promise<AdminOperator> {
    return this.operators.update(tenant, actor, id, body);
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  setStatus(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() actor: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(operatorIdSchema)) id: string,
    @Body(new ZodValidationPipe(operatorStatusSchema)) body: OperatorStatusInput,
  ): Promise<AdminOperator> {
    return this.operators.setActive(tenant, actor, id, body.active);
  }

  @Post(':id/password')
  @Header('Cache-Control', 'no-store')
  resetPassword(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() actor: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(operatorIdSchema)) id: string,
  ): Promise<OperatorPasswordResponse> {
    return this.operators.resetPassword(tenant, actor, id);
  }
}
