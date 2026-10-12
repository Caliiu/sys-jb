import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppHeader } from '@/admin/components/layout/app-header';
import { AuthenticatedLayout } from '@/admin/components/layout/authenticated-layout';
import { SessionProvider } from '@/admin/context/session-provider';
import { Unavailable } from '@/admin/features/errors/unavailable';
import {
  LAYOUT_COLLAPSIBLE_COOKIE_NAME,
  LAYOUT_VARIANT_COOKIE_NAME,
  SIDEBAR_COOKIE_NAME,
  parseCollapsible,
  parseVariant,
} from '@/admin/lib/layout';
import { requireAdmin } from '@/lib/admin/admin-context';
import { ROLE_LABELS } from '@/lib/admin/format';

/**
 * Estrutura do painel (shadcn-admin): menu lateral, cabeçalho e conteúdo. Cada página confere a sessão de novo:
 * layouts não rodam a cada navegação, e a API é quem autoriza de fato.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const gate = await requireAdmin();
  if (!gate.ok) return <Unavailable message={gate.message} />;
  const { tenant, operator } = gate.session;
  // Preferências do menu guardadas em cookie: lidas aqui para o servidor já desenhar como o operador deixou.
  const store = await cookies();

  return (
    <SessionProvider
      user={{
        name: operator.name,
        email: operator.email,
        role: ROLE_LABELS[operator.role],
        permissions: operator.permissions,
        tenant: { name: tenant.name, logoUrl: tenant.logoUrl },
      }}
    >
      <AuthenticatedLayout
        defaultOpen={store.get(SIDEBAR_COOKIE_NAME)?.value !== 'false'}
        initialCollapsible={parseCollapsible(store.get(LAYOUT_COLLAPSIBLE_COOKIE_NAME)?.value)}
        initialVariant={parseVariant(store.get(LAYOUT_VARIANT_COOKIE_NAME)?.value)}
      >
        <AppHeader />
        {children}
      </AuthenticatedLayout>
    </SessionProvider>
  );
}
