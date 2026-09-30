import type { Permission } from '@sysjb/contracts';
import {
  ArrowDownToLine,
  BadgePercent,
  Blocks,
  CalendarClock,
  CreditCard,
  FileChartColumn,
  FileText,
  HandCoins,
  House,
  Layers,
  type LucideIcon,
  Megaphone,
  Package,
  Paintbrush,
  ReceiptText,
  Route,
  ScrollText,
  Settings,
  SquareUser,
  Table2,
  Trophy,
  UserMinus,
  Users,
  UserX,
  Wallet,
  Wrench,
} from 'lucide-react';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Quem pode ver o item e abrir a página (a API confere de novo nas páginas com dados). */
  permission: Permission;
  /** Página ainda não construída: abre o aviso "Em breve". */
  soon?: boolean;
  /** Traço antes do item (separa blocos dentro do grupo). */
  dividerBefore?: boolean;
}

/** Grupo do menu (abre e fecha). Sem nenhum item permitido, o grupo não aparece. */
export interface NavGroup {
  group: string;
  icon: LucideIcon;
  items: NavLink[];
  dividerBefore?: boolean;
}

export type NavEntry = NavLink | NavGroup;

export const isNavGroup = (entry: NavEntry): entry is NavGroup => 'group' in entry;

/**
 * Menu do painel, na ordem da tela. Itens `soon` ainda não têm tela; até ganharem permissão própria, usam a mais
 * próxima: consultas da operação pedem `users.read` (todo perfil tem), cadastros da banca pedem perfil de Gerente.
 */
export const ADMIN_NAV: NavEntry[] = [
  { href: ADMIN_ROUTES.home, label: 'Início', icon: House, permission: 'users.read', soon: true },
  {
    group: 'Operação',
    icon: Wrench,
    dividerBefore: true,
    items: [
      { href: ADMIN_ROUTES.users, label: 'Apostadores', icon: Users, permission: 'users.read' },
      { href: ADMIN_ROUTES.tickets, label: 'Bilhetes', icon: FileText, permission: 'tickets.read' },
      { href: ADMIN_ROUTES.prizes, label: 'Prêmios', icon: Trophy, permission: 'users.read', soon: true },
      {
        href: ADMIN_ROUTES.operationSummary,
        label: 'Resumo da Operação',
        icon: HandCoins,
        permission: 'users.read',
        soon: true,
      },
    ],
  },
  {
    group: 'Relatórios',
    icon: Package,
    items: [
      {
        href: ADMIN_ROUTES.generalReport,
        label: 'Relatório geral',
        icon: FileChartColumn,
        permission: 'users.read',
        soon: true,
      },
      { href: ADMIN_ROUTES.commissions, label: 'Comissões', icon: BadgePercent, permission: 'commissions.read' },
      { href: ADMIN_ROUTES.audit, label: 'Auditoria', icon: ScrollText, permission: 'audit.read' },
    ],
  },
  {
    group: 'Carteira',
    icon: Wallet,
    dividerBefore: true,
    items: [
      { href: ADMIN_ROUTES.deposits, label: 'Depósitos', icon: CreditCard, permission: 'users.read', soon: true },
      {
        href: ADMIN_ROUTES.statement,
        label: 'Extrato apostador',
        icon: ReceiptText,
        permission: 'users.read',
        soon: true,
      },
      { href: ADMIN_ROUTES.withdrawals, label: 'Saques', icon: ArrowDownToLine, permission: 'users.read', soon: true },
    ],
  },
  {
    group: 'CRM',
    icon: SquareUser,
    items: [
      {
        href: ADMIN_ROUTES.inactivePlayers,
        label: 'Apostadores inativos',
        icon: UserMinus,
        permission: 'users.read',
        soon: true,
      },
      {
        href: ADMIN_ROUTES.neverDeposited,
        label: 'Nunca depositantes',
        icon: UserX,
        permission: 'users.read',
        soon: true,
      },
    ],
  },
  {
    group: 'Configurações',
    icon: Settings,
    items: [
      {
        href: ADMIN_ROUTES.billingGroups,
        label: 'Grupos de cobrança',
        icon: Layers,
        permission: 'draws.manage',
        soon: true,
      },
      { href: ADMIN_ROUTES.routes, label: 'Rotas', icon: Route, permission: 'draws.manage', soon: true },
      { href: ADMIN_ROUTES.sections, label: 'Seções', icon: Blocks, permission: 'draws.manage', soon: true },
      { href: ADMIN_ROUTES.quotes, label: 'Cotações', icon: Table2, permission: 'quotes.read' },
      { href: ADMIN_ROUTES.draws, label: 'Sorteios', icon: CalendarClock, permission: 'draws.read' },
      { href: ADMIN_ROUTES.murals, label: 'Mural', icon: Megaphone, permission: 'murals.read', dividerBefore: true },
      { href: ADMIN_ROUTES.branding, label: 'Personalização', icon: Paintbrush, permission: 'branding.read' },
    ],
  },
];

/** A página do item (ou uma subpágina dela, ex.: /usuarios/:id, /personalizacao/cards-inicio) está aberta. */
export const isNavActive = (pathname: string, href: string) =>
  pathname === href || (href !== ADMIN_ROUTES.home && pathname.startsWith(`${href}/`));

/** Item do menu da rota (e o grupo dele); null se a rota não está no menu. */
export function findNavItem(href: string): { item: NavLink; group: NavGroup | null } | null {
  for (const entry of ADMIN_NAV) {
    if (!isNavGroup(entry)) {
      if (entry.href === href) return { item: entry, group: null };
      continue;
    }
    const item = entry.items.find((i) => i.href === href);
    if (item) return { item, group: entry };
  }
  return null;
}

/** Trilha da barra superior ("Relatórios › Auditoria"): grupo e item da página atual. */
export function breadcrumbOf(pathname: string): string[] {
  for (const entry of ADMIN_NAV) {
    if (!isNavGroup(entry)) {
      if (isNavActive(pathname, entry.href)) return [entry.label];
      continue;
    }
    const item = entry.items.find((i) => isNavActive(pathname, i.href));
    if (item) return [entry.group, item.label];
  }
  return [];
}
