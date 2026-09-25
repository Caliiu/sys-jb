import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from './tenant.types.js';

@Injectable()
export class TenantResolverService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /** Allowlist exata: só um domínio cadastrado e ativo resolve. Sem fallback para outra banca. */
  async resolveByHost(normalizedHost: string): Promise<ResolvedTenant | null> {
    const tenant = await this.db.client.tenant.findUnique({
      where: { domain: normalizedHost },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        active: true,
      },
    });
    if (!tenant || !tenant.active) return null;
    const { active: _active, ...resolved } = tenant;
    return resolved;
  }
}
