import type { PublicTenant } from '@sysjb/contracts';

/** Letra usada quando a banca não tem logo ("Banca Aurora" -> "A"). */
export function tenantInitial(name: string): string {
  return (name.replace(/^Banca\s+/i, '').charAt(0) || '?').toUpperCase();
}

/**
 * Ícone da aba: o logo da banca; sem logo, um SVG com a inicial na cor da banca
 * (evita o pedido a /favicon.ico, que não existe).
 */
export function tenantIcon(tenant: Pick<PublicTenant, 'name' | 'logoUrl' | 'primaryColor'>): string {
  if (tenant.logoUrl) return tenant.logoUrl;
  const letter = tenantInitial(tenant.name).replace(/[<>&"']/g, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${tenant.primaryColor}"/>` +
    `<text x="32" y="44" font-family="Arial Black,Arial,sans-serif" font-size="34" text-anchor="middle" fill="#fff">${letter}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
