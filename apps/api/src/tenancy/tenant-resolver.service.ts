import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { TENANT_SELECT, toResolvedTenant } from './tenant-mapper.js';
import type { ResolvedTenant } from './tenant.types.js';

@Injectable()
export class TenantResolverService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Allowlist exata: só um domínio cadastrado e ativo resolve. Sem fallback para outra banca. */
  async resolveByHost(normalizedHost: string): Promise<ResolvedTenant | null> {
    const tenant = await this.db.client.tenant.findUnique({ where: { domain: normalizedHost }, select: TENANT_SELECT });
    if (!tenant || !tenant.active) return null;
    return toResolvedTenant(tenant);
  }
}
