import { Inject, Injectable } from '@nestjs/common';
import type { AdminPromoterListItem, AdminPromoterOption, AdminUserListItem, Page } from '@sysjb/contracts';
import { Errors } from '../common/app-error.js';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { toAdminListItem } from './admin-user.mapper.js';
import type { ListPromotersQuery, ReferralsQuery, SetPromoterInput } from './admin.schemas.js';
import { recordAudit } from './audit.js';
import type { AuthenticatedOperator } from './operator.types.js';
import { type PromoterRow, PromotersRepository } from './promoters.repository.js';

const toPromoterItem = (row: PromoterRow): AdminPromoterListItem => ({
  id: row.id,
  displayId: row.displayId,
  name: row.name,
  phone: row.phone,
  inviteCode: row.inviteCode,
  status: row.status,
  commissionBps: row.promoterCommissionBps,
  casinoCommissionBps: row.casinoCommissionBps,
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

  /** Nome e ID de todos os promotores (filtro da lista de usuários). */
  options(tenant: ResolvedTenant): Promise<AdminPromoterOption[]> {
    return this.db.withTenant(tenant.id, (tx) => this.repo.listOptions(tx, tenant.id));
  }

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
   * Promove o usuário a promotor ou altera as comissões (de Loterias e, se informada, a de cassino). Repetir os mesmos
   * valores é aceito sem efeito (e sem novo registro de auditoria). A alteração e a auditoria acontecem na mesma
   * transação.
   */
  set(tenant: ResolvedTenant, operator: AuthenticatedOperator, id: string, input: SetPromoterInput) {
    return this.db.withTenant(tenant.id, async (tx): Promise<AdminPromoterListItem> => {
      const previous = await this.repo.currentCommissions(tx, tenant.id, id);
      if (!previous) throw Errors.userNotFound();
      const next = {
        promoterCommissionBps: input.commissionBps,
        casinoCommissionBps: input.casinoCommissionBps ?? previous.casinoCommissionBps,
      };
      const fields = [
        ...(previous.promoterCommissionBps !== next.promoterCommissionBps ? ['promoterCommissionBps'] : []),
        ...(previous.casinoCommissionBps !== next.casinoCommissionBps ? ['casinoCommissionBps'] : []),
      ];
      if (fields.length > 0) {
        await this.repo.setCommissions(tx, tenant.id, id, next);
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: previous.promoterCommissionBps === null ? 'promoter.enable' : 'promoter.update',
          targetType: 'user',
          targetId: id,
          details: {
            fields,
            ...(fields.includes('promoterCommissionBps')
              ? { from: previous.promoterCommissionBps, to: next.promoterCommissionBps }
              : {}),
            ...(fields.includes('casinoCommissionBps')
              ? { casinoFrom: previous.casinoCommissionBps, casinoTo: next.casinoCommissionBps }
              : {}),
          },
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
      const previous = await this.repo.currentCommissions(tx, tenant.id, id);
      if (!previous) throw Errors.userNotFound();
      if (previous.promoterCommissionBps === null) return;
      // A de cassino também zera: só promotor tem comissão de cassino.
      await this.repo.setCommissions(tx, tenant.id, id, { promoterCommissionBps: null, casinoCommissionBps: 0 });
      await recordAudit(tx, {
        tenantId: tenant.id,
        operatorId: operator.id,
        action: 'promoter.disable',
        targetType: 'user',
        targetId: id,
        details: { fields: ['promoterCommissionBps'], from: previous.promoterCommissionBps, to: null },
      });
    });
  }
}
