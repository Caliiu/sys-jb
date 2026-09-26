import type { ReactNode } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { TenantUnavailable } from '@/components/ui/Notice';
import { requireAdmin } from '@/lib/admin/admin-context';
import { ROLE_LABELS } from '@/lib/admin/format';
import { brandStyle } from '@/lib/brand-style';

/** Estrutura do painel (menu + conteúdo). Cada página confere a sessão de novo: layouts não rodam a cada navegação. */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const gate = await requireAdmin();
  if (!gate.ok) return <TenantUnavailable hostname={gate.hostname} message={gate.message} />;
  const { tenant, operator } = gate.session;

  return (
    <TenantProvider tenant={tenant}>
      <div
        style={brandStyle(tenant)}
        className="flex min-h-screen flex-col bg-admin-bg font-body text-admin-text md:flex-row"
      >
        <AdminSidebar
          tenantName={tenant.name}
          operatorName={operator.name}
          roleLabel={ROLE_LABELS[operator.role]}
          permissions={operator.permissions}
        />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </TenantProvider>
  );
}
