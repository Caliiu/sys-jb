import type { TenantTx } from '../database/database.service.js';

export type AuditAction = 'user.update' | 'user.block' | 'user.unblock';

interface AuditEntry {
  tenantId: string;
  operatorId: string;
  action: AuditAction;
  targetType: 'user';
  targetId: string;
  /** Somente metadados (ex.: nomes de campos alterados), nunca valores pessoais. */
  details?: { fields: string[] };
}

/** Registra a ação na trilha de auditoria, na MESMA transação da alteração (ambas ou nenhuma). */
export function recordAudit(tx: TenantTx, entry: AuditEntry): Promise<unknown> {
  return tx.auditLog.create({ data: entry });
}
