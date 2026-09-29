import { Inject, Injectable } from '@nestjs/common';
import type { AdminAuditEntry, AuditAction, Page } from '@sysjb/contracts';
import type { Prisma } from '@sysjb/database';
import { DatabaseService } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { ListAuditQuery } from './admin.schemas.js';

type AuditDetails = AdminAuditEntry['details'];

/** Leitura da trilha de auditoria da banca (somente leitura: os registros são só inclusão). */
@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(tenant: ResolvedTenant, query: ListAuditQuery): Promise<Page<AdminAuditEntry>> {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: tenant.id,
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { targetType: 'user', targetId: query.userId } : {}),
    };

    const { rows, total, targets } = await this.db.withTenant(tenant.id, async (tx) => {
      const rows = await tx.auditLog.findMany({
        where,
        include: { operator: { select: { id: true, name: true, email: true } } },
        // id desempata registros do mesmo instante: a paginação nunca repete nem perde linhas.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const total = await tx.auditLog.count({ where });
      // Hoje todo alvo é um usuário (sem FK: a trilha não depende do alvo existir). Uma consulta só.
      const ids = [...new Set(rows.filter((r) => r.targetType === 'user').map((r) => r.targetId))];
      const targets = await tx.user.findMany({
        where: { tenantId: tenant.id, id: { in: ids } },
        select: { id: true, displayId: true, name: true },
      });
      return { rows, total, targets: new Map(targets.map((t) => [t.id, t])) };
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action as AuditAction,
        operator: row.operator,
        targetType: row.targetType === 'tenant' ? ('tenant' as const) : ('user' as const),
        target: row.targetType === 'user' ? (targets.get(row.targetId) ?? null) : null,
        details: toDetails(row.details),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
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
