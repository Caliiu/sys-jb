import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

const TABS = [
  { key: 'branding', href: ADMIN_ROUTES.branding, label: 'Identidade visual' },
  { key: 'home', href: ADMIN_ROUTES.homeLayout, label: 'Cards do início' },
] as const;

/** Abas de Configurações > Personalização (cada aba é uma rota: link compartilhável, voltar funciona). */
export default function PersonalizationTabs({ active }: { active: (typeof TABS)[number]['key'] }) {
  return (
    <nav aria-label="Personalização" className="mb-6 inline-flex rounded-lg bg-admin-hover p-1">
      {TABS.map((tab) => {
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
