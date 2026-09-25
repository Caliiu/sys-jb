import type { Metadata, Viewport } from 'next';
import { Archivo_Black, Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { tenantIcon } from '@/lib/favicon';
import { resolveRequest } from '@/lib/request-context';
import './globals.css';

// Mesmas fontes do app original (Archivo Black + Inter 400–700), servidas pelo próprio Next.
const archivoBlack = Archivo_Black({ weight: '400', subsets: ['latin'], variable: '--font-archivo-black' });
const inter = Inter({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-inter' });

/** Título e ícone por banca (o original usava platformName e o logo). */
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await resolveRequest();
  return {
    title: ctx.ok ? ctx.tenant.name : 'Painel do Jogador',
    icons: ctx.ok ? { icon: tenantIcon(ctx.tenant) } : undefined,
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${archivoBlack.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-[#EDEDED] text-slate-900">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
