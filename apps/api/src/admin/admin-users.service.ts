import { Inject, Injectable } from '@nestjs/common';
import type { AdminUserDetail, AdminUserListItem, AuditChange, Page, UserStatus } from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError, Errors } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import { quoteTableRefs } from '../quotes/quotes.service.js';
import { todaySpentCents } from '../units/unit-limits.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { mapUniqueViolation } from '../users/user-conflicts.js';
import type { AdminUpdateUserInput } from '../users/user.schemas.js';
import { UsersRepository } from '../users/users.repository.js';
import { AdminUsersRepository } from './admin-users.repository.js';
import { toAdminDetail, toAdminListItem, UNIT_SELECT } from './admin-user.mapper.js';
import type { ListUsersQuery, UpdateUnitSettingsInput, WalletCreditInput } from './admin.schemas.js';
import { recordAudit } from './audit.js';
import type { AuthenticatedOperator } from './operator.types.js';

/** Nome do campo da carteira creditado, para a auditoria. */
const CREDIT_FIELD: Record<WalletCreditInput['bucket'], string> = {
  balance: 'balanceJb',
  bonus: 'bonusJb',
  games: 'balanceGames',
};

/** O SQLSTATE vem nos metadados do erro do driver; a mensagem do banco não é usada. */
const hasSqlState = (error: unknown, sqlState: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && JSON.stringify(error.meta ?? {}).includes(sqlState);

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AdminUsersRepository) private readonly repo: AdminUsersRepository,
    @Inject(UsersRepository) private readonly users: UsersRepository,
  ) {}

  async list(tenant: ResolvedTenant, query: ListUsersQuery): Promise<Page<AdminUserListItem>> {
    const { rows, total, tables } = await this.db.withTenant(tenant.id, async (tx) => ({
      ...(await this.repo.list(tx, tenant.id, query)),
      tables: await quoteTableRefs(tx, tenant.id),
    }));
    return {
      items: rows.map((row) => toAdminListItem(row, tables)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  get(tenant: ResolvedTenant, id: string): Promise<AdminUserDetail> {
    return this.db.withTenant(tenant.id, (tx) => this.detail(tx, tenant.id, id));
  }

  /** Corrige dados de cadastro. A alteração e o registro de auditoria acontecem na mesma transação. */
  async update(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    patch: AdminUpdateUserInput,
  ): Promise<AdminUserDetail> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        if (!(await this.users.update(tx, tenant.id, id, patch))) throw Errors.userNotFound();
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'user.update',
          targetType: 'user',
          targetId: id,
          // Só os nomes dos campos: valores pessoais não vão para a trilha.
          details: { fields: Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined) },
        });
        return this.detail(tx, tenant.id, id);
      });
    } catch (error) {
      mapUniqueViolation(error);
    }
  }

  /**
   * Credita a carteira (saldo, bônus ou disponível em games) pela função do banco, que confere perfil,
   * limite e a chave anti-repetição, e grava a movimentação com o operador e o motivo. A auditoria vai na
   * mesma transação e só quando o crédito aconteceu agora (repetição da mesma chave não duplica nada).
   */
  async creditWallet(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    input: WalletCreditInput,
  ): Promise<AdminUserDetail> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        const user = await tx.user.findFirst({ where: { id, tenantId: tenant.id }, select: { id: true } });
        if (!user) throw Errors.userNotFound();
        const [result] = await tx.$queryRaw<Array<{ created: boolean }>>`
          SELECT wallet_operator_credit(${id}::uuid, ${operator.id}::uuid, ${input.bucket}, ${input.amountCents}::bigint,
                                        ${input.note}, ${input.idempotencyKey}::uuid) AS created`;
        if (result?.created) {
          await recordAudit(tx, {
            tenantId: tenant.id,
            operatorId: operator.id,
            action: 'wallet.credit',
            targetType: 'user',
            targetId: id,
            details: { fields: [CREDIT_FIELD[input.bucket]], amount: input.amountCents },
          });
        }
        return this.detail(tx, tenant.id, id);
      });
    } catch (error) {
      // Mesma chave em cliques simultâneos: o outro já creditou; devolve o estado atual.
      if (hasSqlState(error, '23505')) return this.get(tenant, id);
      if (hasSqlState(error, 'SJ003')) {
        throw new AppError(409, 'CONFLICT', 'Chave de crédito já usada em outro lançamento.');
      }
      if (hasSqlState(error, '42501')) throw Errors.permissionDenied();
      throw error;
    }
  }

  /**
   * Bloqueia ou reativa. Bloquear encerra as sessões abertas do usuário. Repetir o mesmo status
   * é aceito sem efeito (e sem novo registro de auditoria).
   */
  setStatus(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    status: UserStatus,
  ): Promise<AdminUserDetail> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const previous = await this.repo.setStatus(tx, tenant.id, id, status);
      if (previous === null) throw Errors.userNotFound();
      if (previous !== status) {
        if (status === 'BLOCKED') await this.repo.revokeSessions(tx, tenant.id, id);
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: status === 'BLOCKED' ? 'user.block' : 'user.unblock',
          targetType: 'user',
          targetId: id,
        });
      }
      return this.detail(tx, tenant.id, id);
    });
  }

  /**
   * Configurações da unidade (região, comissão, tabela de cotação, milhar brinde, reter prêmios e limite diário). Só os
   * campos enviados; a linha do usuário fica travada até o fim (duas alterações simultâneas não se perdem e a auditoria
   * registra o antes/depois de cada campo que mudou de fato). Nada mudou: sem gravação e sem auditoria.
   */
  updateSettings(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    input: UpdateUnitSettingsInput,
  ): Promise<AdminUserDetail> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "users" WHERE "tenant_id" = ${tenant.id}::uuid AND "id" = ${id}::uuid FOR UPDATE`;
      if (!locked) throw Errors.userNotFound();
      const current = await tx.user.findFirst({ where: { tenantId: tenant.id, id }, select: UNIT_SELECT });
      if (!current) throw Errors.userNotFound();

      const tables = await quoteTableRefs(tx, tenant.id);
      if (input.quoteTableId && !tables.has(input.quoteTableId)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [
          { field: 'quoteTableId', message: 'Tabela de cotação não encontrada.' },
        ]);
      }
      const next = {
        region: input.region === undefined ? current.region : input.region,
        unitCommissionBps: input.unitCommissionBps ?? current.unitCommissionBps,
        quoteTableId: input.quoteTableId === undefined ? current.quoteTableId : input.quoteTableId,
        giftMilharEnabled: input.giftMilharEnabled ?? current.giftMilharEnabled,
        retainPrizes: input.retainPrizes ?? current.retainPrizes,
        dailyLimitEnabled: input.dailyLimitEnabled ?? current.dailyLimitEnabled,
        dailyLimitCents: input.dailyLimitCents === undefined ? current.dailyLimitCents : input.dailyLimitCents,
      };
      if (next.dailyLimitEnabled && next.dailyLimitCents === null) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [
          { field: 'dailyLimitCents', message: 'Informe o limite diário para ligá-lo.' },
        ]);
      }

      // Tabela na auditoria pelo nome (null = padrão da banca).
      const tableName = (tableId: string | null) => (tableId ? (tables.get(tableId)?.name ?? null) : null);
      const changes: AuditChange[] = (Object.keys(next) as Array<keyof typeof next>)
        .filter((field) => next[field] !== current[field])
        .map((field) =>
          field === 'quoteTableId'
            ? { field, from: tableName(current.quoteTableId), to: tableName(next.quoteTableId) }
            : { field, from: current[field], to: next[field] },
        );
      if (changes.length > 0) {
        await tx.user.update({ where: { id }, data: next });
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'user.unit',
          targetType: 'user',
          targetId: id,
          details: { fields: changes.map((change) => change.field), changes },
        });
      }
      return this.detail(tx, tenant.id, id);
    });
  }

  private async detail(tx: TenantTx, tenantId: string, id: string): Promise<AdminUserDetail> {
    const found = await this.repo.findDetail(tx, tenantId, id);
    if (!found) throw Errors.userNotFound();
    if (!found.wallet) throw Errors.internal(); // invariante: todo usuário tem carteira
    const [tables, spent] = await Promise.all([quoteTableRefs(tx, tenantId), todaySpentCents(tx, id)]);
    return toAdminDetail(found, found.wallet, found.sessions[0]?.createdAt ?? null, {
      tables,
      todaySpentCents: spent,
    });
  }
}
