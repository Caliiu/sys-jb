import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './lib/security-headers';

// O .env fica na raiz do monorepo (o Next só lê o de apps/web).
const rootEnv = new URL('../../.env', import.meta.url);
if (!process.env.WEB_ADMIN_HOSTNAME && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** Hostname do painel administrativo único (mesmo valor de lib/server-env.ts). */
const adminHostname = (process.env.WEB_ADMIN_HOSTNAME ?? '').trim().toLowerCase() || 'admin.localhost';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hostnames locais das bancas fictícias e do painel administrativo (HMR e server actions em dev).
  allowedDevOrigins: ['trevo.localhost', 'aurora.localhost', 'boreal.localhost', adminHostname],
  // O indicador do Next (só em dev) cobria o botão "Sair" do menu lateral do painel, no canto inferior esquerdo.
  devIndicators: { position: 'bottom-right' },
  // A CSP (com nonce) é montada por requisição no proxy.ts.
  async headers() {
    return [
      { source: '/:path*', headers: staticSecurityHeaders(process.env.NODE_ENV === 'development') },
      // Service worker: o navegador confere se mudou a cada abertura; sem isso, uma versão velha ficaria no cache.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
  // No host do painel (admin.<domínio>) os caminhos são curtos (/login, /usuarios) e as páginas vivem em
  // app/admin. O prefixo /admin digitado direto não funciona em host nenhum (o layout do painel dá 404).
  async rewrites() {
    return {
      beforeFiles: [
        {
          // Fora: arquivos do Next (/_next/...), qualquer arquivo com extensão (public/: logos, ícones, favicon),
          // que continuam nos caminhos de sempre, e as integrações externas (/integracoes/..., ex.: webhook de
          // resultados), que valem em qualquer host. As páginas do painel não têm ponto no caminho.
          source: '/:path((?!_next/)(?!integracoes/)(?!.*\\.[A-Za-z0-9]+$).*)',
          has: [{ type: 'host', value: adminHostname }],
          destination: '/admin/:path',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // Imagem do mural (até 3 MB) enviada pelo painel numa server action. Padrão do Next: 1 MB.
  // authInterrupts: unauthorized() e a página unauthorized.tsx (401 de verdade, com a tela própria).
  experimental: { serverActions: { bodySizeLimit: '4mb' }, authInterrupts: true },
  // Importante: não usar `env` aqui. Ele embute valores no bundle do navegador.
};

export default nextConfig;
