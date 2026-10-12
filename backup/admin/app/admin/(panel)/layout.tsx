import type { ReactNode } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import { requireAdmin } from '@/lib/admin/admin-context';
import { ROLE_LABELS } from '@/lib/admin/format';
import { brandStyle } from '@/lib/brand-style';

/** Estrutura do painel (menu, barra superior e conteúdo). Cada página confere a sessão de novo: layouts não rodam a cada navegação. */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { tenant, operator } = gate.session;

  return (
    <TenantProvider tenant={tenant}>
      <div style={brandStyle(tenant)}>
        <AdminShell
          tenantName={tenant.name}
          tenantLogoUrl={tenant.logoUrl}
          operatorName={operator.name}
          roleLabel={ROLE_LABELS[operator.role]}
          permissions={operator.permissions}
          serverNow={new Date().toISOString()}
        >
          {children}
        </AdminShell>
      </div>
    </TenantProvider>
  );
}
