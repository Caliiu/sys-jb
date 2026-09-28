import { Controller, Get, Header, Inject, Query, UseGuards } from '@nestjs/common';
import type { AdminAuditEntry, Page } from '@sysjb/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentTenant } from '../tenancy/tenant.guard.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { type ListAuditQuery, listAuditQuerySchema } from './admin.schemas.js';
import { AuditService } from './audit.service.js';
import { ConsoleGuard } from './console.guard.js';
import { OperatorGuard, RequirePermission } from './operator.guard.js';

/** Trilha de auditoria da banca do operador. Só leitura, com `audit.read`. */
@Controller('v1/admin/audit')
@UseGuards(ConsoleGuard, OperatorGuard)
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit.read')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentTenant() tenant: ResolvedTenant,
    @Query(new ZodValidationPipe(listAuditQuerySchema)) query: ListAuditQuery,
  ): Promise<Page<AdminAuditEntry>> {
    return this.audit.list(tenant, query);
  }
}
