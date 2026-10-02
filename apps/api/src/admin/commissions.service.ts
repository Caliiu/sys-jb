import { Inject, Injectable } from '@nestjs/common';
import type { AdminCommissionSettings } from '@sysjb/contracts';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { recordAudit } from './audit.js';
import type { AuthenticatedOperator } from './operator.types.js';

/**
 * % do "Indique e ganhe" da banca (definida pelo Gerente). A comissão em si é paga pelo banco na hora de cada aposta de
 * Loterias e Fazendinha (bet_commission_credit): quem indicou ganha, sobre o valor apostado, a % de indicação e, se for
 * promotor, também a dele. Mudar a % vale para as próximas apostas; as já feitas guardam a % do momento.
 */
@Injectable()
export class CommissionsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  getSettings(tenant: ResolvedTenant): Promise<AdminCommissionSettings> {
    return this.db.withTenant(tenant.id, (tx) => this.settings(tx, tenant.id));
  }

  /** Altera a % de indicação. Repetir o mesmo valor é aceito sem efeito (e sem auditoria). */
  setSettings(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    referralCommissionBps: number,
  ): Promise<AdminCommissionSettings> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const previous = (await this.settings(tx, tenant.id)).referralCommissionBps;
      if (previous !== referralCommissionBps) {
        await tx.tenantSettings.upsert({
          where: { tenantId: tenant.id },
          create: { tenantId: tenant.id, referralCommissionBps },
          update: { referralCommissionBps },
        });
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'commission.rate',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: ['referralCommissionBps'], from: previous, to: referralCommissionBps },
        });
      }
      return { referralCommissionBps };
    });
  }

  private async settings(tx: TenantTx, tenantId: string): Promise<AdminCommissionSettings> {
    const row = await tx.tenantSettings.findUnique({ where: { tenantId }, select: { referralCommissionBps: true } });
    return { referralCommissionBps: row?.referralCommissionBps ?? 0 };
  }
}
