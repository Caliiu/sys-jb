'use client';

import { cn } from '@/admin/lib/utils';
import { type Collapsible, type Variant } from '@/admin/lib/layout';
import { LayoutProvider } from '@/admin/context/layout-provider';
import { SearchProvider } from '@/admin/context/search-provider';
import { SidebarInset, SidebarProvider } from '@/admin/components/ui/sidebar';
import { AppSidebar } from '@/admin/components/layout/app-sidebar';
import { SkipToMain } from '@/admin/components/skip-to-main';

type AuthenticatedLayoutProps = {
  children?: React.ReactNode;
  /** Preferências guardadas em cookie, lidas no servidor (o template lia no navegador). */
  defaultOpen?: boolean;
  initialCollapsible?: Collapsible;
  initialVariant?: Variant;
};

export function AuthenticatedLayout({
  children,
  defaultOpen = true,
  initialCollapsible,
  initialVariant,
}: AuthenticatedLayoutProps) {
  return (
    <SearchProvider>
      <LayoutProvider initialCollapsible={initialCollapsible} initialVariant={initialVariant}>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              '@container/content',

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              'has-data-[layout=fixed]:h-svh',

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]',
            )}
          >
            {children}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  );
}
