import { Inject, Injectable } from '@nestjs/common';
import type { AdminAuditEntry, AuditAction, Page } from '@sysjb/contracts';
import type { Prisma } from '@sysjb/database';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { ListAuditQuery } from './admin.schemas.js';
import { auditPeriodStart } from './audit-period.js';

type AuditDetails = AdminAuditEntry['details'];

/** Leitura da trilha de auditoria da banca (somente leitura: os registros são só inclusão). */
@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenant: ResolvedTenant, query: ListAuditQuery): Promise<Page<AdminAuditEntry>> {
    const where: Prisma.AuditLogWhereInput = {
      ...filterWhere(tenant.id, query),
      ...(query.period ? { createdAt: { gte: auditPeriodStart(query.period) } } : {}),
    };

    const { rows, total, targets, operators } = await this.db.withTenant(tenant.id, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where,
        include: { operator: { select: { id: true, name: true, email: true } } },
        // id desempata registros do mesmo instante: a paginação nunca repete nem perde linhas.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const total = await tx.auditLog.count({ where });
      // Alvos: usuários e operadores (sem FK: a trilha não depende do alvo existir). Uma consulta para cada.
      const idsOf = (type: string) => [...new Set(rows.filter((r) => r.targetType === type).map((r) => r.targetId))];
      const [targets, operators] = await Promise.all([
        tx.user.findMany({
          where: { tenantId: tenant.id, id: { in: idsOf('user') } },
          select: { id: true, displayId: true, name: true },
        }),
        tx.operator.findMany({
          where: { tenantId: tenant.id, id: { in: idsOf('operator') } },
          select: { id: true, name: true, email: true },
        }),
      ]);
      return {
        rows,
        total,
        targets: new Map(targets.map((t) => [t.id, t])),
        operators: new Map(operators.map((o) => [o.id, o])),
      };
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action as AuditAction,
        operator: row.operator,
        targetType: row.targetType === 'tenant' || row.targetType === 'operator' ? row.targetType : ('user' as const),
        target: row.targetType === 'user' ? (targets.get(row.targetId) ?? null) : null,
        operatorTarget: row.targetType === 'operator' ? (operators.get(row.targetId) ?? null) : null,
        details: toDetails(row.details),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
}

/** Filtros de ação e usuário afetado (sempre da banca do operador). */
function filterWhere(tenantId: string, query: Pick<ListAuditQuery, 'action' | 'userId'>): Prisma.AuditLogWhereInput {
  return {
    tenantId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.userId ? { targetType: 'user', targetId: query.userId } : {}),
  };
}

/** Só o formato conhecido (nomes de campos e comissão antes/depois); qualquer outra coisa é descartada. */
function toDetails(raw: Prisma.JsonValue): AuditDetails {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fields = Array.isArray(raw.fields) ? raw.fields.filter((f): f is string => typeof f === 'string') : [];
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    fields,
    ...('from' in raw ? { from: num(raw.from) } : {}),
    ...('to' in raw ? { to: num(raw.to) } : {}),
    ...(typeof raw.amount === 'number' ? { amount: raw.amount } : {}),
    ...(typeof raw.month === 'string' ? { month: raw.month } : {}),
    ...(typeof raw.draw === 'string' ? { draw: raw.draw } : {}),
    ...(typeof raw.date === 'string' ? { date: raw.date } : {}),
    ...(typeof raw.mural === 'string' ? { mural: raw.mural } : {}),
  };
}
