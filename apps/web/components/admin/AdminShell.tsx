'use client';

import type { Permission } from '@sysjb/contracts';
import { ChevronRight, ChevronsUpDown, Clock, LogOut, MapPin, PanelLeft, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { adminLogoutAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatTime } from '@/lib/datetime';
import { useOverlay } from '@/hooks/useOverlay';
import { serverClock } from '@/hooks/useServerNow';
import { ADMIN_NAV, breadcrumbOf, isNavActive, isNavGroup, type NavLink } from './admin-nav';

/** Texto para a busca do menu: sem acento e sem diferenciar maiúsculas. */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const Divider = () => <hr className="my-2 border-admin-border" />;

interface AdminShellProps {
  tenantName: string;
  operatorName: string;
  roleLabel: string;
  permissions: readonly Permission[];
  /** Horário do servidor ao montar a página (ISO): o relógio do topo não depende do relógio do aparelho. */
  serverNow?: string;
  children?: ReactNode;
}

/** Relógio do topo (HH:MM, Brasília). Começa no horário do servidor: igual no HTML e na hidratação. */
function TopClock({ serverNow }: { serverNow: string }) {
  const [clock] = useState(() => serverClock(serverNow));
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = window.setInterval(() => setNow(clock()), 5000);
    return () => window.clearInterval(id);
  }, [clock]);
  return (
    <span className="flex items-center gap-1.5 text-[13px] tabular-nums text-admin-muted">
      <Clock className="h-4 w-4" aria-hidden />
      <time dateTime={now}>{formatTime(now)}</time>
    </span>
  );
}

interface AccountMenuProps {
  operatorName: string;
  roleLabel: string;
  tenantName: string;
  onLogout: () => void;
  leaving: boolean;
}

/** Conta no topo do menu: inicial, nome e perfil; abre um menu com a banca e Sair (fecha com Esc ou clique fora). */
function AccountMenu({ operatorName, roleLabel, tenantName, onLogout, leaving }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-admin-hover"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-admin-border bg-admin-hover text-[13px] font-semibold lowercase text-admin-text"
          aria-hidden
        >
          {operatorName.trim().charAt(0) || '?'}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13.5px] font-semibold text-admin-text">{operatorName}</span>
          <span className="block truncate text-[12px] text-admin-muted">{roleLabel}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-admin-muted" aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Conta"
          className="absolute left-2 right-2 top-full z-40 mt-1 rounded-lg border border-admin-border bg-admin-surface p-1 shadow-lg"
        >
          <p className="truncate px-2.5 py-2 text-[12px] text-admin-muted">{tenantName}</p>
          <button
            type="button"
            role="menuitem"
            onClick={onLogout}
            disabled={leaving}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13.5px] text-admin-danger hover:bg-admin-hover disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

interface SidebarContentProps {
  permissions: readonly Permission[];
  pathname: string;
  /** Grupos abertos/fechados pelo operador; sem escolha, fica aberto o grupo da página atual. */
  expanded: Record<string, boolean>;
  onToggle: (group: string, open: boolean) => void;
  onNavigate: () => void;
  account: ReactNode;
}

/** Conteúdo do menu (desenhado duas vezes: fixo no desktop e na gaveta do celular; por isso os ids vêm de useId). */
function SidebarContent({ permissions, pathname, expanded, onToggle, onNavigate, account }: SidebarContentProps) {
  const idPrefix = useId();
  const [query, setQuery] = useState('');
  const term = normalize(query.trim());
  const matches = (label: string) => term === '' || normalize(label).includes(term);

  const rowClass = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] text-admin-text ${
      active ? 'bg-admin-hover font-semibold' : 'hover:bg-admin-hover'
    }`;

  const linkRow = ({ href, label, icon: Icon }: NavLink, sub: boolean) => {
    const active = isNavActive(pathname, href);
    return (
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`${rowClass(active)} ${sub ? 'pl-8' : ''}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </Link>
    );
  };

  // Na busca, os traços somem (a lista filtrada fica corrida).
  const entries = ADMIN_NAV.map((entry, index) => {
    const divider = entry.dividerBefore && term === '' ? <Divider /> : null;
    if (!isNavGroup(entry)) {
      if (!permissions.includes(entry.permission) || !matches(entry.label)) return null;
      return (
        <Fragment key={entry.href}>
          {divider}
          {linkRow(entry, false)}
        </Fragment>
      );
    }
    const allowed = entry.items.filter((item) => permissions.includes(item.permission));
    // Na busca, o grupo inteiro vale se o nome dele bate; senão, só os itens que batem.
    const items = matches(entry.group) ? allowed : allowed.filter((item) => matches(item.label));
    if (items.length === 0) return null;
    const groupActive = items.some((item) => isNavActive(pathname, item.href));
    const open = term !== '' || (expanded[entry.group] ?? groupActive);
    const buttonId = `${idPrefix}-group-${index}`;
    const listId = `${buttonId}-items`;
    const Icon = entry.icon;
    return (
      <Fragment key={entry.group}>
        {divider}
        <div role="group" aria-labelledby={buttonId}>
          <button
            type="button"
            id={buttonId}
            onClick={() => onToggle(entry.group, !open)}
            aria-expanded={open}
            aria-controls={listId}
            className={rowClass(false)}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{entry.group}</span>
            <ChevronRight
              className={`h-4 w-4 text-admin-muted transition-transform ${open ? '-rotate-90' : ''}`}
              aria-hidden
            />
          </button>
          <ul id={listId} hidden={!open} className="space-y-0.5 py-0.5">
            {items.map((item) => (
              <li key={item.href}>
                {item.dividerBefore && term === '' && <Divider />}
                {linkRow(item, true)}
              </li>
            ))}
          </ul>
        </div>
      </Fragment>
    );
  });

  return (
    <div className="flex h-full flex-col bg-admin-surface">
      <div className="border-b border-admin-border p-2">{account}</div>

      <div className="px-3 pt-3">
        <label className="flex items-center gap-2 border-b border-admin-border pb-2 text-admin-muted">
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="sr-only">Pesquisar no menu</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar"
            className="w-full bg-transparent text-[13.5px] text-admin-text outline-none placeholder:text-admin-muted"
          />
        </label>
      </div>

      <nav aria-label="Menu do painel" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {entries}
        {term !== '' && entries.every((entry) => entry === null) && (
          <p className="px-2.5 py-2 text-[12.5px] text-admin-muted">Nada encontrado.</p>
        )}
      </nav>
    </div>
  );
}

/**
 * Estrutura do painel: menu lateral branco (fixo no desktop, recolhível pelo botão da barra; gaveta no celular),
 * barra superior com a trilha da página, a banca e o relógio, e o conteúdo.
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
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useOverlay(open, () => setOpen(false), drawerRef);
  const breadcrumb = breadcrumbOf(pathname);

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

  const sidebar = (onNavigate: () => void) => (
    <SidebarContent
      permissions={permissions}
      pathname={pathname}
      expanded={expanded}
      onToggle={(group, value) => setExpanded((prev) => ({ ...prev, [group]: value }))}
      onNavigate={onNavigate}
      account={
        <AccountMenu
          operatorName={operatorName}
          roleLabel={roleLabel}
          tenantName={tenantName}
          onLogout={handleLogout}
          leaving={leaving}
        />
      }
    />
  );

  const toggleClass = 'h-9 w-9 items-center justify-center rounded-md text-admin-text hover:bg-admin-hover';

  return (
    <div className="flex min-h-screen bg-admin-bg font-body text-admin-text">
      <aside
        className={`hidden shrink-0 border-r border-admin-border print:hidden md:sticky md:top-0 md:h-screen md:w-64 md:flex-col ${
          collapsed ? '' : 'md:flex'
        }`}
      >
        {sidebar(() => {})}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[68px] shrink-0 items-center gap-3 border-b border-admin-border bg-admin-surface px-4 print:hidden md:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
            aria-controls="admin-drawer"
            className={`flex md:hidden ${toggleClass}`}
          >
            <PanelLeft className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Mostrar menu' : 'Recolher menu'}
            aria-pressed={collapsed}
            className={`hidden md:flex ${toggleClass}`}
          >
            <PanelLeft className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <span className="h-5 w-px shrink-0 bg-admin-border" aria-hidden />

          {breadcrumb.length > 0 && (
            <nav aria-label="Trilha" className="min-w-0">
              <ol className="flex items-center gap-2 text-[15px]">
                {breadcrumb.map((label, i) => {
                  const last = i === breadcrumb.length - 1;
                  return (
                    <li key={label} className="flex min-w-0 items-center gap-2">
                      {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-admin-muted" aria-hidden />}
                      <span
                        aria-current={last ? 'page' : undefined}
                        className={`truncate ${last ? 'font-medium text-admin-text' : 'text-admin-muted'}`}
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-5">
            {leaveError && (
              <p role="alert" className="text-[12.5px] font-semibold text-admin-danger">
                {leaveError}
              </p>
            )}
            <span className="hidden items-center gap-1.5 text-[13px] text-admin-accent sm:flex">
              <MapPin className="h-4 w-4" aria-hidden />
              <span className="max-w-56 truncate">{tenantName}</span>
            </span>
            {serverNow && <TopClock serverNow={serverNow} />}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
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
          className={`absolute left-0 top-0 h-full w-72 shadow-lg transition-transform duration-200 ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {open && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="absolute -right-11 top-3 flex h-8 w-8 items-center justify-center rounded-md bg-admin-surface"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
          {sidebar(() => setOpen(false))}
        </div>
      </div>
    </div>
  );
}
