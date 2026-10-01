import type { Permission } from '@sysjb/contracts';
import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

/** Abas na ordem da tela, cada uma com a permissão que a abre. */
export const PERSONALIZATION_TABS = [
  { key: 'branding', href: ADMIN_ROUTES.branding, label: 'Identidade visual', permission: 'branding.read' },
  { key: 'home', href: ADMIN_ROUTES.homeLayout, label: 'Cards do início', permission: 'branding.read' },
  { key: 'values', href: ADMIN_ROUTES.values, label: 'Valores', permission: 'commissions.read' },
] as const satisfies ReadonlyArray<{ key: string; href: string; label: string; permission: Permission }>;

export type PersonalizationTab = (typeof PERSONALIZATION_TABS)[number]['key'];

/** Primeira aba que o perfil pode abrir (Personalização sem aba = a primeira dela); null = nenhuma. */
export const firstPersonalizationTab = (permissions: readonly Permission[]) =>
  PERSONALIZATION_TABS.find((tab) => permissions.includes(tab.permission)) ?? null;

/**
 * Abas de Configurações > Personalização (cada aba é uma rota: link compartilhável, voltar funciona). Só aparecem as
 * abas que o perfil pode abrir (o Financeiro, por exemplo, só vê Valores).
 */
export default function PersonalizationTabs({
  active,
  permissions,
}: {
  active: PersonalizationTab;
  permissions: readonly Permission[];
}) {
  const tabs = PERSONALIZATION_TABS.filter((tab) => permissions.includes(tab.permission));
  return (
    <nav aria-label="Personalização" className="mb-6 inline-flex rounded-lg bg-admin-hover p-1">
      {tabs.map((tab) => {
        const current = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={`rounded-md px-3.5 py-1.5 text-[14px] font-medium ${
              current ? 'bg-admin-surface text-admin-text shadow-sm' : 'text-admin-muted hover:text-admin-text'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
