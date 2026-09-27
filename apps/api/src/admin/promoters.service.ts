import { Inject, Injectable } from '@nestjs/common';
import type { AdminPromoterListItem, AdminUserListItem, Page } from '@sysjb/contracts';
import { Errors } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toAdminListItem } from './admin-user.mapper.js';
import type { ListPromotersQuery, ReferralsQuery } from './admin.schemas.js';
import { recordAudit } from './audit.js';
import type { AuthenticatedOperator } from './operator.types.js';
import { type PromoterRow, PromotersRepository } from './promoters.repository.js';

const toPromoterItem = (row: PromoterRow): AdminPromoterListItem => ({
  id: row.id,
  displayId: row.displayId,
  name: row.name,
  phone: row.phone,
  status: row.status,
  commissionBps: row.promoterCommissionBps,
  referralsCount: row._count.referrals,
  createdAt: row.createdAt.toISOString(),
});

const pageOf = <T>(items: T[], page: number, pageSize: number, total: number): Page<T> => ({
  items,
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

@Injectable()
export class PromotersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PromotersRepository) private readonly repo: PromotersRepository,
  ) {}

  async list(tenant: ResolvedTenant, query: ListPromotersQuery): Promise<Page<AdminPromoterListItem>> {
    const { rows, total } = await this.db.withTenant(tenant.id, (tx) => this.repo.list(tx, tenant.id, query));
    return pageOf(rows.map(toPromoterItem), query.page, query.pageSize, total);
  }

  async get(tenant: ResolvedTenant, id: string): Promise<AdminPromoterListItem> {
    const row = await this.db.withTenant(tenant.id, (tx) => this.repo.findPromoter(tx, tenant.id, id));
    if (!row) throw Errors.promoterNotFound();
    return toPromoterItem(row);
  }

  /** Jogadores cadastrados pelo link deste promotor. */
  async referrals(tenant: ResolvedTenant, id: string, query: ReferralsQuery): Promise<Page<AdminUserListItem>> {
    const { rows, total } = await this.db.withTenant(tenant.id, async (tx) => {
      if (!(await this.repo.findPromoter(tx, tenant.id, id))) throw Errors.promoterNotFound();
      return this.repo.listReferrals(tx, tenant.id, id, query);
    });
    return pageOf(rows.map(toAdminListItem), query.page, query.pageSize, total);
  }

  /**
   * Promove o usuário a promotor ou altera a comissão. Repetir o mesmo valor é aceito sem efeito (e sem
   * novo registro de auditoria). A alteração e a auditoria acontecem na mesma transação.
   */
  set(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    commissionBps: number,
  ): Promise<AdminPromoterListItem> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const previous = await this.repo.currentCommission(tx, tenant.id, id);
      if (previous === undefined) throw Errors.userNotFound();
      if (previous !== commissionBps) {
        await this.repo.setCommission(tx, tenant.id, id, commissionBps);
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: previous === null ? 'promoter.enable' : 'promoter.update',
          targetType: 'user',
          targetId: id,
          details: { fields: ['promoterCommissionBps'], from: previous, to: commissionBps },
        });
      }
      const row = await this.repo.findPromoter(tx, tenant.id, id);
      if (!row) throw Errors.internal();
      return toPromoterItem(row);
    });
  }

  /**
   * Deixa de ser promotor. Os jogadores já vinculados continuam vinculados (histórico), mas ninguém novo
   * entra pelo link. Idempotente: quem já não é promotor também resulta em sucesso, sem auditoria.
   */
  remove(tenant: ResolvedTenant, operator: AuthenticatedOperator, id: string): Promise<void> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const previous = await this.repo.currentCommission(tx, tenant.id, id);
      if (previous === undefined) throw Errors.userNotFound();
      if (previous === null) return;
      await this.repo.setCommission(tx, tenant.id, id, null);
      await recordAudit(tx, {
        tenantId: tenant.id,
        operatorId: operator.id,
        action: 'promoter.disable',
        targetType: 'user',
        targetId: id,
        details: { fields: ['promoterCommissionBps'], from: previous, to: null },
      });
    });
  }
}
