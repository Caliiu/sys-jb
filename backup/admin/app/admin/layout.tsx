import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { hostnameOnly, isAdminHost } from '@/lib/server-env';

/** O painel não é de uma banca: ícone da plataforma (o layout raiz usaria o da banca). */
export const metadata: Metadata = {
  icons: { icon: '/brands/admin-favicon.png', apple: '/brands/admin-apple-icon.png' },
};

/**
 * Porta do painel: as páginas em /admin só existem no host do painel (admin.<domínio>), onde o
 * next.config as serve em caminhos curtos. Em qualquer outro host, ou digitando /admin/... direto, é 404.
 */
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  if (!isAdminHost(hostnameOnly((await headers()).get('host')))) notFound();
  return children;
}
