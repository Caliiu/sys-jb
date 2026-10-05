import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, createNonce, staticSecurityHeaders } from './security-headers';

describe('security headers', () => {
  it('gera um nonce diferente por chamada', () => {
    expect(createNonce()).not.toBe(createNonce());
  });

  it('a CSP de produção só libera scripts com o nonce e não usa eval', () => {
    const csp = buildContentSecurityPolicy('abc', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic';");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('frames só na tela do jogo do cassino, e só https', () => {
    expect(buildContentSecurityPolicy('abc', false)).not.toContain('frame-src');
    expect(buildContentSecurityPolicy('abc', false, { gameFrame: true })).toContain('frame-src https:');
  });

  it('em dev libera eval e não força https', () => {
    const csp = buildContentSecurityPolicy('abc', true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('HSTS só em produção', () => {
    const keys = (isDev: boolean) => staticSecurityHeaders(isDev).map((h) => h.key);
    expect(keys(false)).toContain('Strict-Transport-Security');
    expect(keys(true)).not.toContain('Strict-Transport-Security');
    expect(keys(true)).toEqual(
      expect.arrayContaining(['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']),
    );
  });
});
