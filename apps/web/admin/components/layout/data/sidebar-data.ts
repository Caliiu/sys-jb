import { type Permission } from '@sysjb/contracts';
import { BadgeDollarSign, FileText, House, Store, Trophy } from 'lucide-react';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { type NavGroup, type NavItem, type NavPermission, type NavSubItem, type SidebarData } from '../types';

/**
 * Menu do painel, na ordem da tela. As telas estão sendo refeitas do zero, uma por uma: cada uma entra aqui quando
 * ficar pronta (as antigas estão em backup/admin/). Permissões de referência: consultas da operação pedem
 * `users.read` (todo perfil tem), relatórios financeiros `operation.read`, cadastros da banca perfil de Gerente.
 */
export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Geral',
      items: [
        {
          title: 'Início',
          url: ADMIN_ROUTES.home,
          icon: House,
          permission: 'users.read',
        },
      ],
    },
    {
      title: 'Operação',
      items: [
        {
          title: 'Unidades',
          url: ADMIN_ROUTES.units,
          icon: Store,
          permission: 'users.read',
        },
        {
          title: 'Cotações',
          url: ADMIN_ROUTES.quotes,
          icon: BadgeDollarSign,
          permission: 'quotes.read',
        },
      ],
    },
    {
      title: 'Pules',
      items: [
        {
          title: 'Pules Registradas',
          url: ADMIN_ROUTES.tickets,
          icon: FileText,
          permission: 'tickets.read',
        },
      ],
    },
    {
      title: 'Prêmios',
      items: [
        {
          title: 'Pules Premiadas',
          url: ADMIN_ROUTES.prizes,
          icon: Trophy,
          permission: 'tickets.read',
        },
      ],
    },
  ],
};

/** O perfil com estas permissões pode ver o item (com uma lista, basta uma delas). */
export const canSee = (permissions: readonly Permission[], permission: NavPermission) =>
  typeof permission === 'string' ? permissions.includes(permission) : permission.some((p) => permissions.includes(p));

/** Menu que o perfil vê: só os itens permitidos; subgrupo ou grupo sem item some. */
export function navGroupsFor(permissions: readonly Permission[]): NavGroup[] {
  return sidebarData.navGroups.flatMap((group) => {
    const items = group.items.flatMap((item): NavItem[] => {
      if (!item.items) return canSee(permissions, item.permission) ? [item] : [];
      const subItems = item.items.filter((sub) => canSee(permissions, sub.permission));
      return subItems.length > 0 ? [{ ...item, items: subItems }] : [];
    });
    return items.length > 0 ? [{ ...group, items }] : [];
  });
}

/** Todos os links do menu (inclusive dos subgrupos), na ordem da tela. */
export const allNavLinks = (): NavSubItem[] =>
  sidebarData.navGroups.flatMap((group) => group.items.flatMap((item) => (item.items ? item.items : [item])));

/** Item do menu da rota exata; undefined se a rota não está no menu. */
export const findNavLink = (url: string): NavSubItem | undefined => allNavLinks().find((link) => link.url === url);

/** A página do item (ou uma subpágina dela, ex.: /usuarios/:id) está aberta; Início só na raiz. */
export const isNavActive = (pathname: string, url: string) =>
  pathname === url || (url !== ADMIN_ROUTES.home && pathname.startsWith(`${url}/`));
