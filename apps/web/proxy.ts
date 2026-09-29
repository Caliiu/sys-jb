import { type NextRequest, NextResponse } from 'next/server';
import { buildContentSecurityPolicy, createNonce } from './lib/security-headers';

/**
 * CSP com nonce por requisição. O Next lê o nonce do header Content-Security-Policy da requisição
 * e o aplica sozinho nos scripts que gera. Funciona porque todas as páginas já são dinâmicas
 * (o layout raiz lê o host para descobrir a banca).
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Fora: arquivos do Next e qualquer caminho com extensão (public/: logos, ícones, favicon).
      source: '/((?!_next/static|_next/image|.*\\.[A-Za-z0-9]+$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
