import type { AuditAction, AuditDetails } from '@sysjb/contracts';
import type { TenantTx } from '../database/database.service.js';

interface AuditEntry {
  tenantId: string;
  operatorId: string;
  action: AuditAction;
  /** 'tenant' = ação sobre a banca (targetId = id da banca); 'operator' = sobre um operador (targetId = id dele). */
  targetType: 'user' | 'tenant' | 'operator';
  targetId: string;
  /**
   * Somente metadados (nomes de campos alterados; para a comissão, o valor antes/depois em
   * centésimos de %; para o crédito de carteira, o valor em centavos), nunca valores pessoais.
   */
  details?: AuditDetails;
}

/** Registra a ação na trilha de auditoria, na MESMA transação da alteração (ambas ou nenhuma). */
export function recordAudit(tx: TenantTx, entry: AuditEntry): Promise<unknown> {
  return tx.auditLog.create({ data: entry });
}
