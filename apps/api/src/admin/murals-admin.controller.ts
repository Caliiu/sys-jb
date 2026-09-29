import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AdminMural } from '@sysjb/contracts';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { muralIdSchema, type SaveMuralInput, saveMuralSchema } from '../murals/murals.schemas.js';
import { MuralsService } from '../murals/murals.service.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Mural no painel: consultar exige `murals.read`; cadastrar/alterar/excluir, `murals.manage` (com auditoria). */
@Controller('v1/admin/murals')
@UseGuards(ConsoleGuard, OperatorGuard)
export class MuralsAdminController {
  constructor(@Inject(MuralsService) private readonly murals: MuralsService) {}

  @Get()
  @RequirePermission('murals.read')
  @Header('Cache-Control', 'no-store')
  list(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminMural[]> {
    return this.murals.list(tenant);
  }

  @Get(':id/image')
  @RequirePermission('murals.read')
  async image(
    @CurrentTenant() tenant: ResolvedTenant,
    @Param('id', new ZodValidationPipe(muralIdSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const image = await this.murals.adminImage(tenant, id);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(image.data, { type: image.type, length: image.data.byteLength });
  }

  @Post()
  @RequirePermission('murals.manage')
  @Header('Cache-Control', 'no-store')
  create(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(saveMuralSchema)) body: SaveMuralInput,
  ): Promise<AdminMural[]> {
    return this.murals.create(tenant, operator, body);
  }

  @Put(':id')
  @RequirePermission('murals.manage')
  @Header('Cache-Control', 'no-store')
  update(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(muralIdSchema)) id: string,
    @Body(new ZodValidationPipe(saveMuralSchema)) body: SaveMuralInput,
  ): Promise<AdminMural[]> {
    return this.murals.update(tenant, operator, id, body);
  }

  @Delete(':id')
  @RequirePermission('murals.manage')
  @Header('Cache-Control', 'no-store')
  remove(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Param('id', new ZodValidationPipe(muralIdSchema)) id: string,
  ): Promise<AdminMural[]> {
    return this.murals.remove(tenant, operator, id);
  }
}
