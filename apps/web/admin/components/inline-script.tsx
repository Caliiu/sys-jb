'use client';

/**
 * Script inline com o nonce da CSP (o painel só executa scripts com o nonce da requisição). No servidor sai como
 * JavaScript; no cliente como text/plain, para o React não reclamar de <script> renderizado nem rodá-lo de novo.
 */
export function InlineScript({ html, nonce }: { html: string; nonce?: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
