import { Inject, Injectable } from '@nestjs/common';
import { type AdminBranding, BRANDING_LIMITS, detectMuralImageType, type MuralImageType } from '@sysjb/contracts';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import { AppError } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import { TENANT_SELECT, toResolvedTenant } from '../tenancy/tenant-mapper.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { SaveBrandingInput } from './branding.schemas.js';

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [{ field, message }]);
const noLogo = () => new AppError(404, 'NOT_FOUND', 'Logo não encontrada.');

/** Nomes dos campos na auditoria (nunca os valores). */
const FIELD_LABELS = {
  name: 'Nome',
  primaryColor: 'Cor principal',
  secondaryColor: 'Cor secundária',
  inviteBarText: 'Texto da barra de convite',
  inviteBarEnabled: 'Barra de convite ligada',
  supportPhone: 'WhatsApp do suporte',
  logo: 'Logo',
} as const;

export interface LogoImage {
  type: MuralImageType;
  data: Uint8Array;
}

@Injectable()
export class BrandingService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  get(tenant: ResolvedTenant): Promise<AdminBranding> {
    return this.db.withTenant(tenant.id, (tx) => this.load(tx, tenant.id));
  }

  /**
   * Altera a identidade visual da banca da sessão. O RLS de `tenants` só deixa alterar a banca do contexto, e a
   * role de runtime só pode mexer nas colunas de identidade (nunca slug, domínio ou situação).
   */
  save(tenant: ResolvedTenant, operator: AuthenticatedOperator, input: SaveBrandingInput): Promise<AdminBranding> {
    // undefined = mantém; null = remove a logo enviada; texto = logo nova.
    const logo = typeof input.logo === 'string' ? validLogo(input.logo) : input.logo;
    return this.db.withTenant(tenant.id, async (tx) => {
      const current = await tx.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: TENANT_SELECT });
      const changed: string[] = [];
      if (current.name !== input.name) changed.push(FIELD_LABELS.name);
      if (current.primaryColor.toUpperCase() !== input.primaryColor) changed.push(FIELD_LABELS.primaryColor);
      if (current.secondaryColor.toUpperCase() !== input.secondaryColor) changed.push(FIELD_LABELS.secondaryColor);
      if (current.inviteBarText !== input.inviteBarText) changed.push(FIELD_LABELS.inviteBarText);
      if (current.inviteBarEnabled !== input.inviteBarEnabled) changed.push(FIELD_LABELS.inviteBarEnabled);
      if (current.supportPhone !== input.supportPhone) changed.push(FIELD_LABELS.supportPhone);
      // null só conta como mudança se havia logo enviada.
      if (logo || (logo === null && current.logoUpdatedAt)) changed.push(FIELD_LABELS.logo);
      if (changed.length === 0) return this.load(tx, tenant.id);

      if (logo) {
        await tx.tenantLogo.upsert({
          where: { tenantId: tenant.id },
          create: { tenantId: tenant.id, image: logo.data, imageType: logo.type },
          update: { image: logo.data, imageType: logo.type },
        });
      } else if (logo === null) {
        await tx.tenantLogo.deleteMany({ where: { tenantId: tenant.id } });
      }

      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          name: input.name,
          primaryColor: input.primaryColor,
          secondaryColor: input.secondaryColor,
          inviteBarText: input.inviteBarText,
          inviteBarEnabled: input.inviteBarEnabled,
          supportPhone: input.supportPhone,
          ...(logo ? { logoUpdatedAt: new Date() } : logo === null ? { logoUpdatedAt: null } : {}),
        },
      });
      await recordAudit(tx, {
        tenantId: tenant.id,
        operatorId: operator.id,
        action: 'branding.update',
        targetType: 'tenant',
        targetId: tenant.id,
        details: { fields: changed },
      });
      return this.load(tx, tenant.id);
    });
  }

  /** Logo enviada pelo painel (404 se a banca não tem). */
  logo(tenant: ResolvedTenant): Promise<LogoImage> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const row = await tx.tenantLogo.findUnique({
        where: { tenantId: tenant.id },
        select: { image: true, imageType: true },
      });
      if (!row) throw noLogo();
      return { type: row.imageType as MuralImageType, data: row.image };
    });
  }

  private async load(tx: TenantTx, tenantId: string): Promise<AdminBranding> {
    const row = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: TENANT_SELECT });
    const resolved = toResolvedTenant(row);
    return {
      name: resolved.name,
      primaryColor: resolved.primaryColor.toUpperCase(),
      secondaryColor: resolved.secondaryColor.toUpperCase(),
      inviteBarText: resolved.inviteBarText,
      inviteBarEnabled: resolved.inviteBarEnabled,
      supportPhone: resolved.supportPhone,
      logoUrl: resolved.logoUrl,
      hasCustomLogo: row.logoUpdatedAt !== null,
    };
  }
}

/** Mesmos formatos do mural (PNG, JPEG ou WebP), até 1 MB. */
function validLogo(base64: string): { data: Uint8Array<ArrayBuffer>; type: MuralImageType } {
  const data = new Uint8Array(Buffer.from(base64, 'base64'));
  if (data.byteLength === 0) throw invalid('logo', 'Logo vazia.');
  if (data.byteLength > BRANDING_LIMITS.logoMaxBytes) throw invalid('logo', 'Logo acima de 1 MB.');
  const type = detectMuralImageType(data);
  if (!type) throw invalid('logo', 'Use uma imagem PNG, JPG ou WebP.');
  return { data, type };
}
