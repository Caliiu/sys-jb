import type { PublicTenant } from '@sysjb/contracts';
import type { CSSProperties } from 'react';

/**
 * Variáveis CSS de marca da banca. As variações escura/clara são derivadas aqui, no mesmo
 * elemento, porque uma variável derivada no :root não acompanharia a cor sobrescrita.
 */
export function brandStyle(tenant: Pick<PublicTenant, 'primaryColor' | 'secondaryColor'>): CSSProperties {
  return {
    '--brand-primary': tenant.primaryColor,
    '--brand-primary-dark': `color-mix(in srgb, ${tenant.primaryColor} 60%, black)`,
    '--brand-primary-light': `color-mix(in srgb, ${tenant.primaryColor} 94%, white)`,
    '--brand-secondary': tenant.secondaryColor,
  } as CSSProperties;
}
