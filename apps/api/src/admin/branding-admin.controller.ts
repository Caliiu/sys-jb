import { Body, Controller, Get, Header, Inject, Put, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { AdminBranding, HomeLayout } from '@sysjb/contracts';
import type { Response } from 'express';
import { type SaveBrandingInput, saveBrandingSchema } from '../branding/branding.schemas.js';
import { BrandingService } from '../branding/branding.service.js';
import { type HomeLayoutInput, HomeLayoutService, homeLayoutSchema } from '../branding/home-layout.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { ConsoleGuard } from './console.guard.js';
import { CurrentOperator, OperatorGuard, RequirePermission } from './operator.guard.js';
import type { AuthenticatedOperator } from './operator.types.js';

/**
 * Identidade visual no painel: consultar exige `branding.read`; alterar, `branding.manage` (com auditoria). A logo
 * vale para qualquer operador logado (aparece no menu do painel).
 */
@Controller('v1/admin/branding')
@UseGuards(ConsoleGuard, OperatorGuard)
export class BrandingAdminController {
  constructor(
    @Inject(BrandingService) private readonly branding: BrandingService,
    @Inject(HomeLayoutService) private readonly homeLayout: HomeLayoutService,
  ) {}

  @Get()
  @RequirePermission('branding.read')
  @Header('Cache-Control', 'no-store')
  get(@CurrentTenant() tenant: ResolvedTenant): Promise<AdminBranding> {
    return this.branding.get(tenant);
  }

  @Put()
  @RequirePermission('branding.manage')
  @Header('Cache-Control', 'no-store')
  save(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(saveBrandingSchema)) body: SaveBrandingInput,
  ): Promise<AdminBranding> {
    return this.branding.save(tenant, operator, body);
  }

  /** Cards do início do app: ordem e visibilidade dos blocos e dos cards. */
  @Get('home')
  @RequirePermission('branding.read')
  @Header('Cache-Control', 'no-store')
  getHome(@CurrentTenant() tenant: ResolvedTenant): Promise<HomeLayout> {
    return this.homeLayout.get(tenant);
  }

  @Put('home')
  @RequirePermission('branding.manage')
  @Header('Cache-Control', 'no-store')
  saveHome(
    @CurrentTenant() tenant: ResolvedTenant,
    @CurrentOperator() operator: AuthenticatedOperator,
    @Body(new ZodValidationPipe(homeLayoutSchema)) body: HomeLayoutInput,
  ): Promise<HomeLayout> {
    return this.homeLayout.save(tenant, operator, body);
  }

  @Get('logo')
  async logo(
    @CurrentTenant() tenant: ResolvedTenant,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const logo = await this.branding.logo(tenant);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(logo.data, { type: logo.type, length: logo.data.byteLength });
  }
}
