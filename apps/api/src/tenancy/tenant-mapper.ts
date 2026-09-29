import type { PublicTenant } from '@sysjb/contracts';
import type { ResolvedTenant } from './tenant.types.js';

/** Colunas da banca lidas a cada requisição (nunca a imagem da logo, que fica em tenant_logos). */
export const TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  domain: true,
  logoUrl: true,
  logoUpdatedAt: true,
  primaryColor: true,
  secondaryColor: true,
  inviteBarText: true,
  inviteBarEnabled: true,
  supportPhone: true,
  active: true,
} as const;

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  domain: string;
  logoUrl: string | null;
  logoUpdatedAt: Date | null;
  primaryColor: string;
  secondaryColor: string;
  inviteBarText: string;
  inviteBarEnabled: boolean;
  supportPhone: string | null;
}

/**
 * Endereço da logo enviada pelo painel, servida pelo web em cada host (app da banca e painel). A versão muda a
 * cada troca, então o navegador não mostra a antiga do cache.
 */
export const uploadedLogoUrl = (updatedAt: Date) => `/marca/logo?v=${updatedAt.getTime().toString(36)}`;

/** Banca da requisição: com logo enviada, ela vale no lugar da logo padrão (logo_url). */
export function toResolvedTenant(row: TenantRow): ResolvedTenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    domain: row.domain,
    logoUrl: row.logoUpdatedAt ? uploadedLogoUrl(row.logoUpdatedAt) : row.logoUrl,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    inviteBarText: row.inviteBarText,
    inviteBarEnabled: row.inviteBarEnabled,
    supportPhone: row.supportPhone,
  };
}

/** Só o que a interface precisa (sem id e domínio). */
export function toPublicTenant(tenant: ResolvedTenant): PublicTenant {
  return {
    name: tenant.name,
    slug: tenant.slug,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    secondaryColor: tenant.secondaryColor,
    inviteBarText: tenant.inviteBarText,
    inviteBarEnabled: tenant.inviteBarEnabled,
    supportPhone: tenant.supportPhone,
  };
}
