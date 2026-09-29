import { Inject, Injectable } from '@nestjs/common';
import {
  HOME_BLOCK_IDS,
  HOME_BLOCKS,
  type HomeLayout,
  homeBlockLabel,
  homeCardLabel,
  normalizeHomeLayout,
} from '@sysjb/contracts';
import { z } from 'zod';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';

const cardSchema = z.strictObject({ id: z.string().max(40), visible: z.boolean() });

/**
 * Layout completo: cada bloco do catálogo uma vez, e dentro de cada um exatamente os cards dele (em qualquer
 * ordem). Nada a mais, nada a menos.
 */
export const homeLayoutSchema = z
  .strictObject({
    blocks: z
      .array(z.strictObject({ id: z.enum(HOME_BLOCK_IDS), visible: z.boolean(), cards: z.array(cardSchema).max(10) }))
      .length(HOME_BLOCK_IDS.length, 'Informe todos os blocos.'),
  })
  .superRefine((layout, ctx) => {
    const ids = layout.blocks.map((block) => block.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'Blocos repetidos.' });
    layout.blocks.forEach((block, i) => {
      const expected = HOME_BLOCKS.find((b) => b.id === block.id)!.cards.map((card) => card.id);
      const got = block.cards.map((card) => card.id);
      const same =
        got.length === expected.length && new Set(got).size === got.length && got.every((id) => expected.includes(id));
      if (!same) ctx.addIssue({ code: 'custom', path: ['blocks', i, 'cards'], message: 'Cards do bloco inválidos.' });
    });
  });
export type HomeLayoutInput = z.infer<typeof homeLayoutSchema>;

@Injectable()
export class HomeLayoutService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  get(tenant: ResolvedTenant): Promise<HomeLayout> {
    return this.db.withTenant(tenant.id, (tx) => this.load(tx, tenant.id));
  }

  save(tenant: ResolvedTenant, operator: AuthenticatedOperator, input: HomeLayoutInput): Promise<HomeLayout> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const current = await this.load(tx, tenant.id);
      const changed = describeChanges(current, input);
      if (changed.length === 0) return current;

      const homeLayout = { blocks: input.blocks };
      await tx.tenantSettings.upsert({
        where: { tenantId: tenant.id },
        create: { tenantId: tenant.id, homeLayout },
        update: { homeLayout },
      });
      await recordAudit(tx, {
        tenantId: tenant.id,
        operatorId: operator.id,
        action: 'home.layout.update',
        targetType: 'tenant',
        targetId: tenant.id,
        details: { fields: changed },
      });
      return this.load(tx, tenant.id);
    });
  }

  private async load(tx: TenantTx, tenantId: string): Promise<HomeLayout> {
    const row = await tx.tenantSettings.findUnique({ where: { tenantId }, select: { homeLayout: true } });
    return normalizeHomeLayout(row?.homeLayout ?? null);
  }
}

/** O que mudou, para a auditoria (nomes, nunca valores pessoais): "Ordem dos blocos", "Cassino oculto"… */
function describeChanges(before: HomeLayout, after: HomeLayoutInput): string[] {
  const changed: string[] = [];
  if (before.blocks.map((b) => b.id).join() !== after.blocks.map((b) => b.id).join()) changed.push('Ordem dos blocos');
  for (const block of after.blocks) {
    const old = before.blocks.find((b) => b.id === block.id);
    if (!old) continue;
    const label = homeBlockLabel(block.id);
    if (old.visible !== block.visible) changed.push(`${label} ${block.visible ? 'visível' : 'oculto'}`);
    if (old.cards.map((c) => c.id).join() !== block.cards.map((c) => c.id).join()) changed.push(`Ordem em ${label}`);
    for (const card of block.cards) {
      const oldCard = old.cards.find((c) => c.id === card.id);
      if (oldCard && oldCard.visible !== card.visible) {
        changed.push(`${homeCardLabel(block.id, card.id)} ${card.visible ? 'visível' : 'oculto'}`);
      }
    }
  }
  return changed;
}
