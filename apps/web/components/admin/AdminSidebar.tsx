'use client';

import type { Permission } from '@sysjb/contracts';
import { LogOut, Menu, Users, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { adminLogoutAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { useOverlay } from '@/hooks/useOverlay';
import TenantLogo from '../tenant/TenantLogo';

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  permission: Permission;
}

const NAV_ITEMS: NavItem[] = [{ href: ADMIN_ROUTES.users, label: 'Usuários', icon: Users, permission: 'users.read' }];

interface AdminSidebarProps {
  tenantName: string;
  operatorName: string;
  roleLabel: string;
  permissions: readonly Permission[];
}

/** Menu do painel: fixo à esquerda no desktop; no celular, barra superior com gaveta. */
export default function AdminSidebar({ tenantName, operatorName, roleLabel, permissions }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useOverlay(open, () => setOpen(false), drawerRef);

  async function handleLogout() {
    if (leaving) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      await adminLogoutAction();
      router.replace(ADMIN_ROUTES.login);
      router.refresh();
    } catch {
      // Sem confirmação do servidor a sessão pode continuar válida: fica na tela e avisa.
      setLeaveError('Não foi possível sair. Tente novamente.');
      setLeaving(false);
    }
  }

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-admin-border px-5 py-5">
        <TenantLogo size={32} className="h-8 w-8 shrink-0" decorative />
        <div className="min-w-0">
          <p className="truncate font-display text-[13px] leading-none text-admin-text">{tenantName.toUpperCase()}</p>
          <p className="mt-1 text-[11px] text-admin-muted">Painel administrativo</p>
        </div>
      </div>

      <nav aria-label="Menu do painel" className="flex-1 py-3">
        {NAV_ITEMS.filter((item) => permissions.includes(item.permission)).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 px-5 py-2.5 text-[13.5px] font-medium ${
                active
                  ? 'border-r-2 border-admin-accent bg-admin-accent/10 text-admin-accent'
                  : 'text-admin-text hover:bg-admin-bg'
              }`}
            >
              <Icon size={18} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-admin-border px-5 py-4">
        <p className="truncate text-[13px] font-semibold text-admin-text">{operatorName}</p>
        <p className="text-[11px] text-admin-muted">{roleLabel}</p>
        <button
          type="button"
          onClick={handleLogout}
          disabled={leaving}
          className="mt-3 flex items-center gap-2 text-[12.5px] font-semibold text-admin-danger disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sair
        </button>
        {leaveError && (
          <p role="alert" className="mt-2 text-[12px] font-semibold text-admin-danger">
            {leaveError}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <header className="flex items-center justify-between border-b border-admin-border bg-admin-surface px-4 py-3 md:hidden">
        <p className="truncate font-display text-[13px] text-admin-text">{tenantName.toUpperCase()}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          aria-controls="admin-drawer"
        >
          <Menu className="h-5 w-5 text-admin-text" aria-hidden />
        </button>
      </header>

      <aside className="hidden shrink-0 border-r border-admin-border bg-admin-surface md:flex md:w-64 md:flex-col">
        {content}
      </aside>

      <div inert={!open} className={`fixed inset-0 z-50 md:hidden ${open ? '' : 'pointer-events-none'}`}>
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          id="admin-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu do painel"
          className={`absolute left-0 top-0 h-full w-72 bg-admin-surface shadow-admin transition-transform duration-200 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex justify-end p-3">
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu">
              <X className="h-5 w-5 text-admin-text" aria-hidden />
            </button>
          </div>
          {content}
        </div>
      </div>
    </>
  );
}
