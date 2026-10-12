'use client';

import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { useSession } from '@/admin/context/session-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/admin/components/ui/avatar';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/admin/components/ui/sidebar';

/**
 * Topo do menu: a banca do operador (logo; sem logo ou se falhar, a inicial) e o nome do painel. No template é um
 * seletor de times; aqui o operador pertence a uma banca só, então leva ao Início.
 */
export function TeamSwitcher() {
  const { setOpenMobile } = useSidebar();
  const { tenant } = useSession();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild tooltip={tenant.name}>
          <Link href={ADMIN_ROUTES.home} onClick={() => setOpenMobile(false)}>
            <Avatar className="size-8 rounded-lg">
              {tenant.logoUrl && (
                <AvatarImage src={tenant.logoUrl} alt="" className="bg-background object-contain p-1" />
              )}
              <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {tenant.name.trim().charAt(0).toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-semibold">{tenant.name}</span>
              <span className="truncate text-xs">Painel administrativo</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
