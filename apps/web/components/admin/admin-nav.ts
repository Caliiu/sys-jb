import type { Permission } from '@sysjb/contracts';
import {
  ArrowDownToLine,
  Blocks,
  CalendarClock,
  CreditCard,
  Dices,
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
  ShieldCheck,
  SquareUser,
  Table2,
  Ticket,
  Trophy,
  UserCog,
  UserMinus,
  Users,
  UserX,
  Wallet,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Quem pode ver o item e abrir a página (a API confere de novo nas páginas com dados). Uma lista = qualquer uma delas
   * (ex.: Personalização, cujas abas pedem permissões diferentes).
   */
  permission: Permission | readonly Permission[];
  /** Página ainda não construída: abre o aviso "Em breve". */
  soon?: boolean;
  /** Traço antes do item (separa blocos dentro do grupo). */
  dividerBefore?: boolean;
}

/** Subgrupo dentro de um grupo (ex.: Relatórios › Cassino), com os itens numa linha vertical. Sem itens, não aparece. */
export interface NavSection {
  section: string;
  icon: LucideIcon;
  items: NavLink[];
}

export type NavGroupItem = NavLink | NavSection;

/** Grupo do menu. Sem nenhum item permitido, o grupo não aparece. */
export interface NavGroup {
  group: string;
  icon: LucideIcon;
  items: NavGroupItem[];
  dividerBefore?: boolean;
  /**
   * 'accordion' (padrão): abre e fecha dentro do menu. 'panel': abre um painel ao lado do menu (no desktop; na gaveta do
   * celular e na busca, abre como os outros).
   */
  display?: 'accordion' | 'panel';
}

export type NavEntry = NavLink | NavGroup;

export const isNavGroup = (entry: NavEntry): entry is NavGroup => 'group' in entry;

/** O perfil com estas permissões pode ver o item (com uma lista, basta uma delas). */
export const canSeeNavLink = (permissions: readonly Permission[], link: Pick<NavLink, 'permission'>) =>
  typeof link.permission === 'string'
    ? permissions.includes(link.permission)
    : link.permission.some((permission) => permissions.includes(permission));
export const isNavSection = (item: NavGroupItem): item is NavSection => 'section' in item;

/**
 * Menu do painel, na ordem da tela. Itens `soon` ainda não têm tela; até ganharem permissão própria, usam a mais
 * próxima: consultas da operação pedem `users.read` (todo perfil tem), relatórios financeiros pedem `operation.read`
 * (Gerente e Financeiro), cadastros da banca pedem perfil de Gerente.
 */
export const ADMIN_NAV: NavEntry[] = [
  { href: ADMIN_ROUTES.home, label: 'Início', icon: House, permission: 'users.read', soon: true },
  {
    group: 'Operação',
    icon: Wrench,
    dividerBefore: true,
    items: [
      { href: ADMIN_ROUTES.users, label: 'Apostadores', icon: Users, permission: 'users.read' },
      { href: ADMIN_ROUTES.tickets, label: 'Pules', icon: FileText, permission: 'tickets.read' },
      { href: ADMIN_ROUTES.prizes, label: 'Pules Premiadas', icon: Trophy, permission: 'tickets.read' },
      {
        href: ADMIN_ROUTES.operationSummary,
        label: 'Resumo da Operação',
        icon: HandCoins,
        permission: 'operation.read',
      },
    ],
  },
  {
    group: 'Relatórios',
    icon: Package,
    display: 'panel',
    items: [
      {
        href: ADMIN_ROUTES.generalReport,
        label: 'Relatório geral',
        icon: FileChartColumn,
        permission: 'operation.read',
      },
      {
        section: 'Cassino',
        icon: Dices,
        items: [
          {
            href: ADMIN_ROUTES.casinoGeneralReport,
            label: 'Geral cassino',
            icon: WalletCards,
            permission: 'operation.read',
          },
          {
            href: ADMIN_ROUTES.casinoClosingReport,
            label: 'Fechamento cassino',
            icon: WalletCards,
            permission: 'operation.read',
            soon: true,
          },
        ],
      },
      {
        section: 'Loterias',
        icon: Ticket,
        items: [
          {
            href: ADMIN_ROUTES.salesByDrawReport,
            label: 'Vendas por extração',
            icon: WalletCards,
            permission: 'operation.read',
          },
        ],
      },
    ],
  },
  {
    group: 'Carteira',
    icon: Wallet,
    dividerBefore: true,
    items: [
      { href: ADMIN_ROUTES.deposits, label: 'Depósitos', icon: CreditCard, permission: 'users.read' },
      {
        href: ADMIN_ROUTES.statement,
        label: 'Extrato apostador',
        icon: ReceiptText,
        permission: 'users.read',
      },
      { href: ADMIN_ROUTES.withdrawals, label: 'Saques', icon: ArrowDownToLine, permission: 'users.read' },
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
      {
        href: ADMIN_ROUTES.branding,
        label: 'Personalização',
        icon: Paintbrush,
        // Abas Identidade visual e Cards do início (branding.read) e Valores (commissions.read).
        permission: ['branding.read', 'commissions.read'],
      },
    ],
  },
];

/** Bloco fixo no rodapé do menu (administração do painel). */
export const ADMIN_NAV_FOOTER: NavGroup[] = [
  {
    group: 'Administração',
    icon: ShieldCheck,
    items: [
      { href: ADMIN_ROUTES.operators, label: 'Operadores', icon: UserCog, permission: 'operators.manage' },
      { href: ADMIN_ROUTES.audit, label: 'Log de auditoria', icon: ScrollText, permission: 'audit.read' },
    ],
  },
];

/** Item do menu com o grupo e o subgrupo dele (null fora de grupo / de subgrupo). */
export interface NavLocation {
  item: NavLink;
  group: NavGroup | null;
  section: NavSection | null;
}

/** Todos os itens do menu (topo e rodapé), na ordem da tela. */
export function allNavLinks(): NavLocation[] {
  const links: NavLocation[] = [];
  for (const entry of [...ADMIN_NAV, ...ADMIN_NAV_FOOTER]) {
    if (!isNavGroup(entry)) {
      links.push({ item: entry, group: null, section: null });
      continue;
    }
    for (const item of entry.items) {
      if (isNavSection(item)) item.items.forEach((link) => links.push({ item: link, group: entry, section: item }));
      else links.push({ item, group: entry, section: null });
    }
  }
  return links;
}

/** Links do grupo (inclusive os dos subgrupos), na ordem da tela. */
export const groupLinks = (group: NavGroup): NavLink[] =>
  group.items.flatMap((item) => (isNavSection(item) ? item.items : [item]));

/** A página do item (ou uma subpágina dela, ex.: /usuarios/:id, /personalizacao/cards-inicio) está aberta. */
export const isNavActive = (pathname: string, href: string) =>
  pathname === href || (href !== ADMIN_ROUTES.home && pathname.startsWith(`${href}/`));

/** Item do menu da rota exata (com grupo e subgrupo); null se a rota não está no menu. */
export const findNavItem = (href: string): NavLocation | null =>
  allNavLinks().find(({ item }) => item.href === href) ?? null;

/** Trilha da barra superior ("Relatórios › Cassino › Geral cassino"): grupo, subgrupo e item da página atual. */
export function breadcrumbOf(pathname: string): string[] {
  const found = allNavLinks().find(({ item }) => isNavActive(pathname, item.href));
  if (!found) return [];
  return [found.group?.group, found.section?.section, found.item.label].filter((label): label is string => !!label);
}
