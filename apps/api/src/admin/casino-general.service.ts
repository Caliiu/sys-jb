import { Inject, Injectable } from '@nestjs/common';
import type { AdminCasinoGeneralReport } from '@sysjb/contracts';
import { AppError } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { CasinoGeneralQuery } from './admin.schemas.js';

/**
 * Geral cassino da banca do operador. O sistema ainda não tem cassino (nenhuma aposta ou prêmio para somar), então o
 * relatório vem vazio e marcado como indisponível, como o cassino do resumo da operação. Os filtros já são conferidos
 * como nos outros relatórios (promotor da banca, senão 404), para a tela não mudar quando o cassino chegar.
 */
@Injectable()
export class CasinoGeneralService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  report(tenant: ResolvedTenant, query: CasinoGeneralQuery): Promise<AdminCasinoGeneralReport> {
    return this.db.withTenant(tenant.id, async (tx) => {
      if (query.promoterId) {
        const promoter = await tx.user.findFirst({
          where: { tenantId: tenant.id, id: query.promoterId, promoterCommissionBps: { not: null } },
          select: { id: true },
        });
        if (!promoter) throw new AppError(404, 'NOT_FOUND', 'Promotor não encontrado.');
      }
      return {
        from: query.from,
        to: query.to,
        rows: [],
        totals: { turnoverCents: 0, payoutCents: 0, netCents: 0 },
        available: false,
      };
    });
  }
}
