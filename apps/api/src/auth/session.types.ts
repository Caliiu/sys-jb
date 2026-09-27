import type { TenantRequest } from '../tenancy/tenant.types.js';

/** Sessão do cliente já validada na requisição. */
export interface UserSession {
  sessionId: string;
  userId: string;
}

export interface SessionRequest extends TenantRequest {
  userSession?: UserSession;
}
