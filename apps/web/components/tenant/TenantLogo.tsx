'use client';

import { tenantInitial } from '@/lib/favicon';
import { useTenant } from './TenantProvider';

interface TenantLogoProps {
  /** Tamanho em px (define width/height do <img> e evita deslocamento de layout). */
  size: number;
  className?: string;
  /** Decorativo: sem texto alternativo (quando o nome já aparece ao lado). */
  decorative?: boolean;
}

/** Logo da banca; sem logoUrl, a inicial do nome num selo do mesmo tamanho. */
export default function TenantLogo({ size, className = '', decorative = false }: TenantLogoProps) {
  const tenant = useTenant();

  if (tenant.logoUrl) {
    return (
      // Logo configurável por banca (pode ser URL externa): <img> simples, com dimensões fixas.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={tenant.logoUrl}
        alt={decorative ? '' : tenant.name}
        width={size}
        height={size}
        decoding="async"
        className={`object-contain ${className}`}
      />
    );
  }

  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : tenant.name}
      aria-hidden={decorative || undefined}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      className={`inline-flex items-center justify-center rounded-md bg-white font-display text-brand-primary ${className}`}
    >
      {tenantInitial(tenant.name)}
    </span>
  );
}
