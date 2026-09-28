import { Inject, Injectable } from '@nestjs/common';
import type { AdminUserDetail, AdminUserListItem, Page, UserStatus } from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError, Errors } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { mapUniqueViolation } from '../users/user-conflicts.js';
import type { AdminUpdateUserInput } from '../users/user.schemas.js';
import { UsersRepository } from '../users/users.repository.js';
import { AdminUsersRepository } from './admin-users.repository.js';
import { toAdminDetail, toAdminListItem } from './admin-user.mapper.js';
import type { ListUsersQuery, WalletCreditInput } from './admin.schemas.js';
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
    const { rows, total } = await this.db.withTenant(tenant.id, (tx) => this.repo.list(tx, tenant.id, query));
    return {
      items: rows.map(toAdminListItem),
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

  private async detail(tx: TenantTx, tenantId: string, id: string): Promise<AdminUserDetail> {
    const found = await this.repo.findDetail(tx, tenantId, id);
    if (!found) throw Errors.userNotFound();
    if (!found.wallet) throw Errors.internal(); // invariante: todo usuário tem carteira
    return toAdminDetail(found, found.wallet, found.sessions[0]?.createdAt ?? null);
  }
}
