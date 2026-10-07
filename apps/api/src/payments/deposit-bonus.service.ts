import { Inject, Injectable } from '@nestjs/common';
import {
  type DepositBonusRule,
  type DepositBonusSettings,
  DEPOSIT_BONUS_RULES,
  type PublicDepositBonusOffers,
} from '@sysjb/contracts';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import type { UserSession } from '../auth/session.types.js';
import { Errors } from '../common/app-error.js';
import { hasSqlState } from '../common/prisma-errors.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';

/** Padrões do banco (tenant_settings sem linha ainda): tudo desligado. */
const DEFAULTS: DepositBonusSettings = {
  minDepositCents: 1000,
  firstDeposit: { enabled: false, bps: 0, maxCents: 30000 },
  daily: { enabled: false, bps: 0, maxCents: 30000 },
  federal: { enabled: false, bps: 0, maxCents: 30000 },
};

/** Ordem de desempate (a mesma do banco: primeira recarga, Federal, diária). */
const ORDER: Record<DepositBonusRule, number> = Object.fromEntries(
  DEPOSIT_BONUS_RULES.map((rule, index) => [rule, index]),
) as Record<DepositBonusRule, number>;

/**
 * Bônus de recarga de Loterias: configuração da banca (Gerente) e a oferta que vale agora para o jogador. A concessão
 * é do banco (deposit_bonus_grant, na mesma transação que credita a recarga); a oferta usa a mesma função que decide
 * a concessão (deposit_bonus_rules), então a tela nunca promete outra coisa.
 */
@Injectable()
export class DepositBonusService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  offers(tenant: ResolvedTenant, session: UserSession): Promise<PublicDepositBonusOffers> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const [rules, settings] = await Promise.all([
        tx.$queryRaw<Array<{ rule: DepositBonusRule; rate_bps: number; max_cents: number }>>`
          SELECT "rule", "rate_bps", "max_cents" FROM "deposit_bonus_rules"(${session.userId}::uuid, NULL::uuid)`,
        this.read(tx, tenant.id),
      ]);
      return {
        offers: rules
          .map((row) => ({ rule: row.rule, bps: row.rate_bps, maxCents: row.max_cents }))
          .sort((a, b) => ORDER[a.rule] - ORDER[b.rule]),
        minDepositCents: settings.minDepositCents,
      };
    });
  }

  settings(tenant: ResolvedTenant): Promise<DepositBonusSettings> {
    return this.db.withTenant(tenant.id, (tx) => this.read(tx, tenant.id));
  }

  async saveSettings(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    input: DepositBonusSettings,
  ): Promise<DepositBonusSettings> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        await tx.$executeRaw`
          SELECT "deposit_bonus_settings_save"(
            ${actor.id}::uuid, ${input.minDepositCents}::int,
            ${input.firstDeposit.enabled}, ${input.firstDeposit.bps}::int, ${input.firstDeposit.maxCents}::int,
            ${input.daily.enabled}, ${input.daily.bps}::int, ${input.daily.maxCents}::int,
            ${input.federal.enabled}, ${input.federal.bps}::int, ${input.federal.maxCents}::int)`;
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: actor.id,
          action: 'deposit.bonus.settings',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: ['minDepositCents', 'firstDeposit', 'daily', 'federal'] },
        });
        return this.read(tx, tenant.id);
      });
    } catch (error) {
      if (hasSqlState(error, '42501')) throw Errors.permissionDenied();
      throw error;
    }
  }

  private async read(tx: TenantTx, tenantId: string): Promise<DepositBonusSettings> {
    const row = await tx.tenantSettings.findFirst({
      where: { tenantId },
      select: {
        depositBonusMinCents: true,
        bonusFirstBps: true,
        bonusFirstMaxCents: true,
        bonusDailyBps: true,
        bonusDailyMaxCents: true,
        bonusFederalBps: true,
        bonusFederalMaxCents: true,
        bonusFirstEnabled: true,
        bonusDailyEnabled: true,
        bonusFederalEnabled: true,
      },
    });
    if (!row) return DEFAULTS;
    return {
      minDepositCents: row.depositBonusMinCents,
      firstDeposit: { enabled: row.bonusFirstEnabled, bps: row.bonusFirstBps, maxCents: row.bonusFirstMaxCents },
      daily: { enabled: row.bonusDailyEnabled, bps: row.bonusDailyBps, maxCents: row.bonusDailyMaxCents },
      federal: { enabled: row.bonusFederalEnabled, bps: row.bonusFederalBps, maxCents: row.bonusFederalMaxCents },
    };
  }
}
