'use client';

import dynamic from 'next/dynamic';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

// O modal (e a geração do QR) só é baixado quando o usuário abre o convite pela primeira vez.
const InviteModal = dynamic(() => import('./InviteModal'), { ssr: false });

const InviteContext = createContext<{ openInvite: () => void } | null>(null);

/** Estado do convite compartilhado entre o banner do topo e o card de saldo. */
export function InviteProvider({ inviteCode, children }: { inviteCode: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  const openInvite = useCallback(() => {
    setRequested(true);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openInvite }), [openInvite]);

  return (
    <InviteContext.Provider value={value}>
      {children}
      {requested && <InviteModal open={open} onClose={close} inviteCode={inviteCode} />}
    </InviteContext.Provider>
  );
}

export function useInvite() {
  const ctx = useContext(InviteContext);
  if (!ctx) throw new Error('useInvite fora de <InviteProvider>');
  return ctx;
}
