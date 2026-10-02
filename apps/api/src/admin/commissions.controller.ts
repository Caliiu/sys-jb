import { Body, Controller, Get, Header, Inject, Put, UseGuards } from '@nestjs/common';
import type { AdminCommissionSettings } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type SetCommissionSettingsInput, setCommissionSettingsSchema } from './admin.schemas.js';
import { CommissionsService } from './commissions.service.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** % do "Indique e ganhe": consultar exige `commissions.read`; alterar, `commissions.manage`. */
@Controller('v1/admin/commissions')
@UseGuards(ConsoleGuard, OperatorGuard)
export class CommissionsController {
  constructor(@Inject(CommissionsService) private readonly commissions: CommissionsService) {}

  @Get('settings')
  @RequirePermission('commissions.read')
  @Header('Cache-Control', 'no-store')
  getSettings(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminCommissionSettings> {
    return this.commissions.getSettings(tenant);
  }

  @Put('settings')
  @RequirePermission('commissions.manage')
  @Header('Cache-Control', 'no-store')
  setSettings(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(setCommissionSettingsSchema)) body: SetCommissionSettingsInput,
  ): Promise<AdminCommissionSettings> {
    return this.commissions.setSettings(tenant, operator, body.referralCommissionBps);
  }
}
