import type { OperatorRole } from '@sysjb/contracts';
import type { TenantRequest } from '../tenancy/tenant.types.js';

/** Operador autenticado na requisição (nunca inclui o hash da senha). */
export interface AuthenticatedOperator {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
}

export interface OperatorRequest extends TenantRequest {
  operator?: AuthenticatedOperator;
}
