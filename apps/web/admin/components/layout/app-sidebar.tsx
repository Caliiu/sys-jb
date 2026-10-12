'use client';

import { useLayout } from '@/admin/context/layout-provider';
import { useSession } from '@/admin/context/session-provider';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from '@/admin/components/ui/sidebar';
import { navGroupsFor } from './data/sidebar-data';
import { NavGroup } from './nav-group';
import { NavUser } from './nav-user';
import { TeamSwitcher } from './team-switcher';

export function AppSidebar() {
  const { collapsible, variant } = useLayout();
  const { permissions } = useSession();
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent role="navigation" aria-label="Menu do painel">
        {navGroupsFor(permissions).map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
