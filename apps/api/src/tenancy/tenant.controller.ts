import { Controller, Get, Header, Inject, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { HomeLayout, PublicTenant } from '@sysjb/contracts';
import type { Response } from 'express';
import { BrandingService } from '../branding/branding.service.js';
import { HomeLayoutService } from '../branding/home-layout.service.js';
import { toPublicTenant } from './tenant-mapper.js';
import { CurrentTenant, TenantGuard } from './tenant.guard.js';
import type { ResolvedTenant } from './tenant.types.js';

/** Identidade visual da banca atual (usada pela interface, inclusive antes do login). */
@Controller('v1/tenant')
@UseGuards(TenantGuard)
export class TenantController {
  constructor(
    @Inject(BrandingService) private readonly branding: BrandingService,
    @Inject(HomeLayoutService) private readonly homeLayout: HomeLayoutService,
  ) {}

  @Get()
  current(@CurrentTenant() tenant: ResolvedTenant): PublicTenant {
    return toPublicTenant(tenant);
  }

  /** Ordem e visibilidade dos blocos e cards do início (definidas pelo Gerente). */
  @Get('home-layout')
  @Header('Cache-Control', 'no-store')
  home(@CurrentTenant() tenant: ResolvedTenant): Promise<HomeLayout> {
    return this.homeLayout.get(tenant);
  }

  /** Logo enviada pelo painel (pública: aparece no login). Sem logo enviada: 404. */
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
