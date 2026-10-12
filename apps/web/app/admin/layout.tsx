import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { InlineScript } from '@/admin/components/inline-script';
import { Toaster } from '@/admin/components/ui/sonner';
import { ThemeProvider } from '@/admin/context/theme-provider';
import { THEME_COOKIE_NAME, THEME_SCRIPT, parseTheme } from '@/admin/lib/theme';
import { hostnameOnly, isAdminHost } from '@/lib/server-env';

/** O painel não é de uma banca: ícone da plataforma (o layout raiz usaria o da banca). */
export const metadata: Metadata = {
  title: { default: 'Painel administrativo', template: '%s · Painel administrativo' },
  icons: { icon: '/brands/admin-favicon.png', apple: '/brands/admin-apple-icon.png' },
};

/**
 * Porta do painel: as páginas em /admin só existem no host do painel (admin.<domínio>), onde o
 * next.config as serve em caminhos curtos. Em qualquer outro host, ou digitando /admin/... direto, é 404.
 * Também aplica o tema do shadcn-admin (claro/escuro) antes da primeira pintura.
 */
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  if (!isAdminHost(hostnameOnly(requestHeaders.get('host')))) notFound();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE_NAME)?.value);

  return (
    <>
      <InlineScript html={THEME_SCRIPT} nonce={requestHeaders.get('x-nonce') ?? undefined} />
      <ThemeProvider initialTheme={theme}>
        {children}
        <Toaster duration={5000} />
      </ThemeProvider>
    </>
  );
}
