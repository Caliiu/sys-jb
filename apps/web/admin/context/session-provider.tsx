'use client';

import { createContext, useContext } from 'react';
import { type Permission } from '@sysjb/contracts';

/** Operador logado e a banca dele, vindos do servidor (o template usava dados fixos em sidebar-data). */
export type AdminUser = {
  name: string;
  email: string;
  /** Perfil por extenso (Gerente, Financeiro, Suporte). */
  role: string;
  permissions: readonly Permission[];
  tenant: {
    name: string;
    /** Logo da banca; null = a inicial do nome. */
    logoUrl: string | null;
  };
};

const SessionContext = createContext<AdminUser | null>(null);

export function SessionProvider({ user, children }: { user: AdminUser; children: React.ReactNode }) {
  return <SessionContext value={user}>{children}</SessionContext>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
