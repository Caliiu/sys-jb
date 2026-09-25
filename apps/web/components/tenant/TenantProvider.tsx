'use client';

import type { PublicTenant } from '@sysjb/contracts';
import { createContext, type ReactNode, useContext } from 'react';

const TenantContext = createContext<PublicTenant | null>(null);

/** Disponibiliza para componentes cliente a banca resolvida no servidor pelo hostname. */
export function TenantProvider({ tenant, children }: { tenant: PublicTenant; children: ReactNode }) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}

export function useTenant(): PublicTenant {
  const tenant = useContext(TenantContext);
  if (!tenant) throw new Error('useTenant fora de <TenantProvider>');
  return tenant;
}
