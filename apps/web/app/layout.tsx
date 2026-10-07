import type { Metadata, Viewport } from 'next';
import { Archivo_Black, Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import InstallCapture from '@/components/pwa/InstallCapture';
import PushSync from '@/components/pwa/PushSync';
import { ToastProvider } from '@/components/ui/Toast';
import { brandStyle } from '@/lib/brand-style';
import { tenantIcon } from '@/lib/favicon';
import { pwaIconUrl } from '@/lib/pwa-icon';
import { resolveRequest } from '@/lib/request-context';
import { webPushPublicKey } from '@/lib/server-env';
import './globals.css';

// Mesmas fontes do app original (Archivo Black + Inter 400–700), servidas pelo próprio Next.
const archivoBlack = Archivo_Black({ weight: '400', subsets: ['latin'], variable: '--font-archivo-black' });
const inter = Inter({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-inter' });

/** Título e ícone por banca (o original usava platformName e o logo). */
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await resolveRequest();
  return {
    title: ctx.ok ? ctx.tenant.name : 'Painel do Jogador',
    // iPhone: ícone da tela inicial em 180×180 (o tamanho que ele usa), com a logo da banca.
    icons: ctx.ok ? { icon: tenantIcon(ctx.tenant), apple: pwaIconUrl('180', ctx.tenant) } : undefined,
    // iPhone: nome do atalho na tela inicial e abertura em tela cheia.
    appleWebApp: ctx.ok ? { capable: true, title: ctx.tenant.name } : undefined,
    robots: { index: false, follow: false },
  };
}

/** Cor da barra do navegador no celular = cor da banca; conteúdo até as bordas (safe areas tratadas no CSS). */
export async function generateViewport(): Promise<Viewport> {
  const ctx = await resolveRequest();
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: ctx.ok ? ctx.tenant.primaryColor : '#DF2120',
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Notificações só no app da banca, com a conta aberta (o painel administrativo não tem banca no hostname).
  const ctx = await resolveRequest();

  return (
    <html lang="pt-BR" className={`${archivoBlack.variable} ${inter.variable}`}>
      {/* Cores da banca já no body: o esqueleto de carregamento (app/loading.tsx) aparece na cor certa. */}
      <body className="min-h-screen bg-[#EDEDED] text-slate-900" style={ctx.ok ? brandStyle(ctx.tenant) : undefined}>
        <InstallCapture />
        {ctx.ok && ctx.me && <PushSync publicKey={webPushPublicKey()} />}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
