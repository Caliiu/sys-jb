import { Controller, Get, UseGuards } from '@nestjs/common';
import type { PublicTenant } from '@sysjb/contracts';
import { CurrentTenant, TenantGuard } from './tenant.guard.js';
import type { ResolvedTenant } from './tenant.types.js';

/** Identidade visual da banca atual (usada pela interface de demonstração). */
@Controller('v1/tenant')
@UseGuards(TenantGuard)
export class TenantController {
  @Get()
  current(@CurrentTenant() tenant: ResolvedTenant): PublicTenant {
    return {
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor,
      secondaryColor: tenant.secondaryColor,
    };
  }
}
