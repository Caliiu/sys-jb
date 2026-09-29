/**
 * Headers de segurança do web. A CSP depende de um nonce por requisição (montada no proxy.ts);
 * os demais são fixos e valem para toda resposta, inclusive arquivos estáticos (next.config.ts).
 */

/** Nonce novo a cada requisição, em base64 (formato aceito por `'nonce-...'`). */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * CSP estrita para scripts: só executa o que o Next marcou com o nonce desta requisição
 * (`'strict-dynamic'` estende a confiança aos chunks que esses scripts carregam).
 * Estilos precisam de `'unsafe-inline'` porque o app usa `style={...}` (cor da banca), que nonce não cobre.
 * Imagens aceitam https: porque o logo da banca (`logoUrl`) pode ser um endereço externo.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // Em dev o React usa eval para reconstruir pilhas de erro do servidor.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Em dev as bancas rodam em http://*.localhost; forçar https quebraria tudo.
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];
  return directives.join('; ');
}

/** Headers fixos, sem nonce. */
export function staticSecurityHeaders(isDev: boolean): { key: string; value: string }[] {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Redundante com frame-ancestors, para navegadores antigos.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Sem includeSubDomains: cada banca tem o próprio domínio e nem todo subdomínio é garantidamente https.
    ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000' }]),
  ];
  return headers;
}
