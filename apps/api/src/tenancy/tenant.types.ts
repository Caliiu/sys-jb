import type { PublicTenant } from '@sysjb/contracts';
import type { Request } from 'express';

/** Banca resolvida pelo hostname da requisição. Uso interno: o id nunca vai para respostas públicas. */
export interface ResolvedTenant extends PublicTenant {
  id: string;
  domain: string;
}

export interface TenantRequest extends Request {
  tenant?: ResolvedTenant;
}
