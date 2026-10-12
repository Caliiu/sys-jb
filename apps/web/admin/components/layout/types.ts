import { type Permission } from '@sysjb/contracts';

type BaseNavItem = {
  title: string;
  badge?: string;
  icon?: React.ElementType;
};

/**
 * Quem pode ver o item e abrir a página (a API confere de novo nas páginas com dados). Uma lista = qualquer uma delas.
 */
type NavPermission = Permission | readonly Permission[];

type NavLink = BaseNavItem & {
  url: string;
  permission: NavPermission;
  items?: never;
};

type NavSubItem = BaseNavItem & {
  url: string;
  permission: NavPermission;
};

type NavCollapsible = BaseNavItem & {
  items: NavSubItem[];
  url?: never;
};

type NavItem = NavCollapsible | NavLink;

type NavGroup = {
  title: string;
  items: NavItem[];
};

type SidebarData = {
  navGroups: NavGroup[];
};

export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink, NavSubItem, NavPermission };
