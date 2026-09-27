import type { TenantTx } from '../database/database.service.js';

export type AuditAction =
  'user.update' | 'user.block' | 'user.unblock' | 'promoter.enable' | 'promoter.update' | 'promoter.disable';

interface AuditEntry {
  tenantId: string;
  operatorId: string;
  action: AuditAction;
  targetType: 'user';
  targetId: string;
  /**
   * Somente metadados (nomes de campos alterados e, para a comissão, o valor antes/depois em
   * centésimos de %), nunca valores pessoais.
   */
  details?: { fields: string[]; from?: number | null; to?: number | null };
}

/** Registra a ação na trilha de auditoria, na MESMA transação da alteração (ambas ou nenhuma). */
export function recordAudit(tx: TenantTx, entry: AuditEntry): Promise<unknown> {
  return tx.auditLog.create({ data: entry });
}
