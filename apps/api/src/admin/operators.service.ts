import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AdminOperator, AuditAction, OperatorPasswordResponse } from '@sysjb/contracts';
import { PasswordService } from '../auth/password.service.js';
import { AppError, Errors } from '../common/app-error.js';
import { hasSqlState } from '../common/prisma-errors.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import { recordAudit } from './audit.js';
import type { AuthenticatedOperator } from './operator.types.js';
import type { SaveOperatorInput } from './operators.schemas.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'Operador não encontrado.');
const emailTaken = () =>
  new AppError(409, 'CONFLICT', 'Já existe um operador com este e-mail.', [
    { field: 'email', message: 'E-mail já usado por outro operador (o e-mail é único em todas as bancas).' },
  ]);
const self = () =>
  new AppError(
    409,
    'CONFLICT',
    'Você não pode mudar o próprio perfil, a própria situação ou a própria senha por aqui.',
  );

/** Senha forte gerada para o operador (24 caracteres base64url), mostrada uma vez ao Gerente. */
const newPassword = () => randomBytes(18).toString('base64url');

/** Falhas das funções do banco (operator_*) traduzidas para a API. */
function translate(error: unknown): never {
  if (hasSqlState(error, '23505')) throw emailTaken();
  if (hasSqlState(error, 'SJ009')) throw self();
  if (hasSqlState(error, 'P0002')) throw notFound();
  if (hasSqlState(error, '42501')) throw Errors.permissionDenied();
  throw error;
}

/**
 * Operadores da banca (Administração > Operadores), só para o Gerente. Toda gravação passa pelas funções do banco
 * (operator_create / operator_update / operator_set_active / operator_set_password), que conferem de novo que quem age
 * é um Gerente ativo desta banca e que ele não mexe no próprio perfil, situação ou senha; a auditoria é gravada na
 * mesma transação. Senhas: geradas aqui, mostradas uma vez, guardadas só como hash argon2id.
 */
@Injectable()
export class OperatorsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
  ) {}

  /** Ativos primeiro, por nome. */
  list(tenant: ResolvedTenant, actor: AuthenticatedOperator): Promise<AdminOperator[]> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const rows = await this.rows(tx, tenant.id);
      return rows.map((row) => toAdminOperator(row, actor.id));
    });
  }

  async create(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    input: SaveOperatorInput,
  ): Promise<OperatorPasswordResponse> {
    const password = newPassword();
    const passwordHash = await this.passwords.hash(password);
    try {
      const operator = await this.db.withTenant(tenant.id, async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "operator_create"(${actor.id}::uuid, ${input.name}, ${input.email}, ${input.role}, ${passwordHash})::text AS id`;
        await this.audit(tx, tenant, actor, 'operator.create', row!.id, ['name', 'email', 'role']);
        return this.one(tx, tenant.id, row!.id, actor.id);
      });
      return { operator, password };
    } catch (error) {
      translate(error);
    }
  }

  async update(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    id: string,
    input: SaveOperatorInput,
  ): Promise<AdminOperator> {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        const before = await tx.operator.findFirst({
          where: { tenantId: tenant.id, id },
          select: { name: true, email: true, role: true },
        });
        if (!before) throw notFound();
        const fields = (['name', 'email', 'role'] as const).filter((field) => before[field] !== input[field]);
        if (fields.length > 0) {
          await tx.$executeRaw`
            SELECT "operator_update"(${actor.id}::uuid, ${id}::uuid, ${input.name}, ${input.email}, ${input.role})`;
          await this.audit(tx, tenant, actor, 'operator.update', id, [...fields]);
        }
        return this.one(tx, tenant.id, id, actor.id);
      });
    } catch (error) {
      translate(error);
    }
  }

  /** Repetir a situação atual é aceito sem efeito (e sem auditoria). */
  async setActive(tenant: ResolvedTenant, actor: AuthenticatedOperator, id: string, active: boolean) {
    try {
      return await this.db.withTenant(tenant.id, async (tx) => {
        const current = await tx.operator.findFirst({ where: { tenantId: tenant.id, id }, select: { active: true } });
        if (!current) throw notFound();
        if (id === actor.id) throw self();
        if (current.active !== active) {
          await tx.$executeRaw`SELECT "operator_set_active"(${actor.id}::uuid, ${id}::uuid, ${active})`;
          await this.audit(tx, tenant, actor, active ? 'operator.activate' : 'operator.deactivate', id, []);
        }
        return this.one(tx, tenant.id, id, actor.id);
      });
    } catch (error) {
      translate(error);
    }
  }

  async resetPassword(
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    id: string,
  ): Promise<OperatorPasswordResponse> {
    if (id === actor.id) throw self();
    const password = newPassword();
    const passwordHash = await this.passwords.hash(password);
    try {
      const operator = await this.db.withTenant(tenant.id, async (tx) => {
        await tx.$executeRaw`SELECT "operator_set_password"(${actor.id}::uuid, ${id}::uuid, ${passwordHash})`;
        await this.audit(tx, tenant, actor, 'operator.password', id, []);
        return this.one(tx, tenant.id, id, actor.id);
      });
      return { operator, password };
    } catch (error) {
      translate(error);
    }
  }

  private audit(
    tx: TenantTx,
    tenant: ResolvedTenant,
    actor: AuthenticatedOperator,
    action: AuditAction,
    targetId: string,
    fields: string[],
  ) {
    return recordAudit(tx, {
      tenantId: tenant.id,
      operatorId: actor.id,
      action,
      targetType: 'operator',
      targetId,
      details: { fields },
    });
  }

  private rows(tx: TenantTx, tenantId: string, id?: string) {
    return tx.operator.findMany({
      where: { tenantId, ...(id ? { id } : {}) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        // Último login = sessão mais recente.
        sessions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  private async one(tx: TenantTx, tenantId: string, id: string, actorId: string): Promise<AdminOperator> {
    const [row] = await this.rows(tx, tenantId, id);
    if (!row) throw notFound();
    return toAdminOperator(row, actorId);
  }
}

type OperatorRow = Awaited<ReturnType<OperatorsService['rows']>>[number];

function toAdminOperator(row: OperatorRow, actorId: string): AdminOperator {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.sessions[0]?.createdAt.toISOString() ?? null,
    self: row.id === actorId,
  };
}
