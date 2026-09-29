'use client';

import type { Permission } from '@sysjb/contracts';
import {
  ChevronLeft,
  Circle,
  Clock,
  DollarSign,
  Globe,
  Menu,
  Power,
  ScrollText,
  Ticket,
  User,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { adminLogoutAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatClock } from '@/lib/datetime';
import { useOverlay } from '@/hooks/useOverlay';
import { serverClock } from '@/hooks/useServerNow';

interface NavLinkItem {
  href: string;
  label: string;
  permission: Permission;
}

interface NavItem extends NavLinkItem {
  icon: typeof Users;
}

/** Grupo do menu (abre e fecha): título, ícone e subitens. Sem nenhum subitem permitido, o grupo não aparece. */
interface NavGroup {
  group: string;
  icon: typeof Users;
  items: NavLinkItem[];
}

const NAV: Array<NavItem | NavGroup> = [
  {
    group: 'Unidades',
    icon: Users,
    items: [{ href: ADMIN_ROUTES.users, label: 'Unidades', permission: 'users.read' }],
  },
  {
    group: 'Financeiro',
    icon: DollarSign,
    items: [{ href: ADMIN_ROUTES.commissions, label: 'Comissões', permission: 'commissions.read' }],
  },
  {
    group: 'Loterias',
    icon: Ticket,
    items: [
      { href: ADMIN_ROUTES.quotes, label: 'Cotações', permission: 'quotes.read' },
      { href: ADMIN_ROUTES.draws, label: 'Sorteios', permission: 'draws.read' },
    ],
  },
  {
    group: 'Gestão Web',
    icon: Globe,
    items: [
      { href: ADMIN_ROUTES.branding, label: 'Identidade visual', permission: 'branding.read' },
      { href: ADMIN_ROUTES.homeLayout, label: 'Cards do início', permission: 'branding.read' },
      { href: ADMIN_ROUTES.murals, label: 'Mural', permission: 'murals.read' },
    ],
  },
  { href: ADMIN_ROUTES.audit, label: 'Auditoria', icon: ScrollText, permission: 'audit.read' },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

interface AdminShellProps {
  tenantName: string;
  operatorName: string;
  roleLabel: string;
  permissions: readonly Permission[];
  /** Horário do servidor ao montar a página (ISO): o relógio do topo não depende do relógio do aparelho. */
  serverNow?: string;
  children?: ReactNode;
}

/** Relógio do topo (HH:MM:SS, Brasília). Começa no horário do servidor: igual no HTML e na hidratação. */
function TopClock({ serverNow }: { serverNow: string }) {
  const [clock] = useState(() => serverClock(serverNow));
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = window.setInterval(() => setNow(clock()), 1000);
    return () => window.clearInterval(id);
  }, [clock]);
  return (
    <span className="flex items-center gap-1.5 px-3 text-[12.5px] tabular-nums text-admin-text">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      <time dateTime={now}>{formatClock(now)}</time>
    </span>
  );
}

interface SidebarContentProps {
  tenantName: string;
  operatorName: string;
  roleLabel: string;
  permissions: readonly Permission[];
  pathname: string;
  /** Grupos abertos/fechados pelo operador; sem escolha, fica aberto o grupo da página atual. */
  expanded: Record<string, boolean>;
  onToggle: (group: string, open: boolean) => void;
  onNavigate: () => void;
}

/** Conteúdo do menu (desenhado duas vezes: fixo no desktop e na gaveta do celular; por isso os ids vêm de useId). */
function SidebarContent({
  tenantName,
  operatorName,
  roleLabel,
  permissions,
  pathname,
  expanded,
  onToggle,
  onNavigate,
}: SidebarContentProps) {
  const idPrefix = useId();

  const topLink = ({ href, label, icon: Icon }: NavItem) => {
    const active = isActive(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-2.5 border-l-[3px] px-4 py-3 text-[13px] ${
          active
            ? 'border-admin-accent bg-admin-sidebar-dark text-white'
            : 'border-transparent text-admin-sidebar-text hover:bg-admin-sidebar-dark hover:text-white'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col bg-admin-sidebar">
      <div className="flex items-center gap-3 px-3 py-3 pr-10">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90">
          <User className="h-6 w-6 text-admin-sidebar" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[12.5px] font-bold uppercase text-white">{operatorName}</p>
          <p className="truncate text-[10.5px] uppercase text-admin-sidebar-text">{tenantName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-admin-sidebar-text">
            <span className="h-2 w-2 rounded-full bg-admin-sidebar-bullet" aria-hidden />
            {roleLabel}
          </p>
        </div>
      </div>

      <p className="bg-admin-sidebar-dark px-4 py-2 text-[10.5px] uppercase tracking-wide text-[#8aa4af]" aria-hidden>
        Módulos
      </p>

      <nav aria-label="Menu do painel" className="flex-1 overflow-y-auto pb-4">
        {NAV.map((entry, index) => {
          if (!('group' in entry)) return permissions.includes(entry.permission) ? topLink(entry) : null;
          const items = entry.items.filter((item) => permissions.includes(item.permission));
          if (items.length === 0) return null;
          const groupActive = items.some((item) => isActive(pathname, item.href));
          const open = expanded[entry.group] ?? groupActive;
          const buttonId = `${idPrefix}-group-${index}`;
          const listId = `${buttonId}-items`;
          const Icon = entry.icon;
          return (
            <div key={entry.group} role="group" aria-labelledby={buttonId}>
              <button
                type="button"
                id={buttonId}
                onClick={() => onToggle(entry.group, !open)}
                aria-expanded={open}
                aria-controls={listId}
                className={`flex w-full items-center gap-2.5 border-l-[3px] px-4 py-3 text-left text-[13px] ${
                  groupActive
                    ? 'border-admin-accent bg-admin-sidebar-dark text-white'
                    : 'border-transparent text-admin-sidebar-text hover:bg-admin-sidebar-dark hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{entry.group}</span>
                <ChevronLeft className={`h-3.5 w-3.5 transition-transform ${open ? '-rotate-90' : ''}`} aria-hidden />
              </button>
              <ul id={listId} hidden={!open} className="bg-admin-sidebar-sub py-1">
                {items.map(({ href, label }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2.5 py-2 pl-6 pr-4 text-[12.5px] ${
                          active ? 'text-white' : 'text-admin-sidebar-text hover:text-white'
                        }`}
                      >
                        <Circle
                          className="h-2.5 w-2.5 shrink-0 text-admin-sidebar-bullet"
                          strokeWidth={3}
                          aria-hidden
                        />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Estrutura do painel: menu lateral escuro (fixo no desktop; gaveta no celular), relógio e Sair no canto
 * superior direito do conteúdo (sem barra) e a página.
 */
export default function AdminShell({
  tenantName,
  operatorName,
  roleLabel,
  permissions,
  serverNow,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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

  const sidebarProps = {
    tenantName,
    operatorName,
    roleLabel,
    permissions,
    pathname,
    expanded,
    onToggle: (group: string, value: boolean) => setExpanded((prev) => ({ ...prev, [group]: value })),
  };

  return (
    <div className="flex min-h-screen bg-admin-bg font-body text-admin-text">
      <aside className="hidden shrink-0 print:hidden md:sticky md:top-0 md:flex md:h-screen md:w-[230px] md:flex-col">
        <SidebarContent {...sidebarProps} onNavigate={() => {}} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 px-3 pt-3 md:px-4 print:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
            aria-controls="admin-drawer"
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-admin-border md:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <div className="ml-auto flex items-center gap-1">
            {leaveError && (
              <p role="alert" className="px-2 text-[12px] font-semibold text-admin-danger">
                {leaveError}
              </p>
            )}
            {serverNow && <TopClock serverNow={serverNow} />}
            <button
              type="button"
              onClick={handleLogout}
              disabled={leaving}
              className="flex h-8 items-center gap-1.5 rounded px-3 text-[12.5px] hover:bg-admin-border disabled:opacity-60"
            >
              <Power className="h-3.5 w-3.5" aria-hidden />
              Sair
            </button>
          </div>
        </div>

        <main className="min-w-0 flex-1 p-3 pt-1 md:p-4 md:pt-1">{children}</main>
      </div>

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
          className={`absolute left-0 top-0 h-full w-[260px] shadow-admin transition-transform duration-200 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded text-admin-sidebar-text hover:bg-admin-sidebar-dark hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <SidebarContent {...sidebarProps} onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}
