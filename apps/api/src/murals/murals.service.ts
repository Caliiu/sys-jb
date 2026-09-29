import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminMural,
  detectMuralImageType,
  drawDateOf,
  dayOffsetOf,
  MURAL_LIMITS,
  type MuralDisplayMode,
  type MuralImageType,
  type PublicMural,
} from '@sysjb/contracts';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import { AppError } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { SaveMuralInput } from './murals.schemas.js';

const invalid = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [{ field, message }]);
const notFound = () => new AppError(404, 'NOT_FOUND', 'Mural não encontrado.');

const toDate = (date: string) => new Date(`${date}T00:00:00Z`);
const fromDate = (date: Date) => date.toISOString().slice(0, 10);
const today = () => drawDateOf(new Date().toISOString(), 0);

/** Muda a cada alteração: vai na URL da imagem para o navegador não mostrar a versão antiga do cache. */
const versionOf = (updatedAt: Date) => updatedAt.getTime().toString(36);

/** Nomes dos campos na auditoria (nunca os valores). */
const FIELD_LABELS = {
  name: 'Nome',
  startsOn: 'Data inicial',
  endsOn: 'Data final',
  displayMode: 'Exibição',
  image: 'Imagem',
} as const;

/** Mais de um mural no ar ao mesmo tempo: o jogador vê um depois do outro, até este limite. */
const MAX_PLAYER_MURALS = 10;

const ADMIN_SELECT = {
  id: true,
  name: true,
  startsOn: true,
  endsOn: true,
  displayMode: true,
  imageType: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { views: true } },
} as const;

export interface MuralImage {
  type: MuralImageType;
  data: Uint8Array;
}

interface ValidMural {
  name: string;
  startsOn: Date;
  endsOn: Date;
  displayMode: MuralDisplayMode;
  image?: { data: Uint8Array<ArrayBuffer>; type: MuralImageType };
}

@Injectable()
export class MuralsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // -------------------------------------------------------------------------
  // Painel
  // -------------------------------------------------------------------------

  list(tenant: ResolvedTenant): Promise<AdminMural[]> {
    return this.db.withTenant(tenant.id, (tx) => this.load(tx, tenant.id));
  }

  create(tenant: ResolvedTenant, operator: AuthenticatedOperator, input: SaveMuralInput): Promise<AdminMural[]> {
    if (!input.image) throw invalid('image', 'Envie a imagem do mural.');
    const mural = validate(input, { checkEnd: true });
    return this.db.withTenant(tenant.id, async (tx) => {
      await tx.mural.create({
        data: {
          tenantId: tenant.id,
          name: mural.name,
          startsOn: mural.startsOn,
          endsOn: mural.endsOn,
          displayMode: mural.displayMode,
          image: mural.image!.data,
          imageType: mural.image!.type,
        },
      });
      await recordAudit(tx, {
        tenantId: tenant.id,
        operatorId: operator.id,
        action: 'mural.create',
        targetType: 'tenant',
        targetId: tenant.id,
        details: { fields: [], mural: mural.name },
      });
      return this.load(tx, tenant.id);
    });
  }

  update(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    input: SaveMuralInput,
  ): Promise<AdminMural[]> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const current = await tx.mural.findFirst({ where: { tenantId: tenant.id, id }, select: ADMIN_SELECT });
      if (!current) throw notFound();
      // Data final no passado só é recusada quando muda (dá para renomear um mural encerrado).
      const mural = validate(input, { checkEnd: fromDate(current.endsOn) !== input.endsOn });

      const changed: string[] = [];
      if (current.name !== mural.name) changed.push(FIELD_LABELS.name);
      if (fromDate(current.startsOn) !== input.startsOn) changed.push(FIELD_LABELS.startsOn);
      if (fromDate(current.endsOn) !== input.endsOn) changed.push(FIELD_LABELS.endsOn);
      if (current.displayMode !== mural.displayMode) changed.push(FIELD_LABELS.displayMode);
      if (mural.image) changed.push(FIELD_LABELS.image);
      if (changed.length === 0) return this.load(tx, tenant.id);

      await tx.mural.update({
        where: { id: current.id },
        data: {
          name: mural.name,
          startsOn: mural.startsOn,
          endsOn: mural.endsOn,
          displayMode: mural.displayMode,
          ...(mural.image ? { image: mural.image.data, imageType: mural.image.type } : {}),
        },
      });
      await recordAudit(tx, {
        tenantId: tenant.id,
        operatorId: operator.id,
        action: 'mural.update',
        targetType: 'tenant',
        targetId: tenant.id,
        details: { fields: changed, mural: mural.name },
      });
      return this.load(tx, tenant.id);
    });
  }

  remove(tenant: ResolvedTenant, operator: AuthenticatedOperator, id: string): Promise<AdminMural[]> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const current = await tx.mural.findFirst({
        where: { tenantId: tenant.id, id },
        select: { id: true, name: true },
      });
      if (!current) throw notFound();
      await tx.muralView.deleteMany({ where: { tenantId: tenant.id, muralId: id } });
      await tx.mural.delete({ where: { id } });
      await recordAudit(tx, {
        tenantId: tenant.id,
        operatorId: operator.id,
        action: 'mural.delete',
        targetType: 'tenant',
        targetId: tenant.id,
        details: { fields: [], mural: current.name },
      });
      return this.load(tx, tenant.id);
    });
  }

  /** Imagem de qualquer mural da banca (pré-visualização do painel). */
  adminImage(tenant: ResolvedTenant, id: string): Promise<MuralImage> {
    return this.image(tenant, { id });
  }

  // -------------------------------------------------------------------------
  // Jogador
  // -------------------------------------------------------------------------

  /** Murais no ar hoje que o jogador deve ver: todos os "Sempre" e os "Apenas uma vez" que ele ainda não viu. */
  forPlayer(tenant: ResolvedTenant, userId: string): Promise<PublicMural[]> {
    const day = toDate(today());
    return this.db.withTenant(tenant.id, async (tx) => {
      const rows = await tx.mural.findMany({
        where: {
          tenantId: tenant.id,
          startsOn: { lte: day },
          endsOn: { gte: day },
          OR: [{ displayMode: 'ALWAYS' }, { views: { none: { userId } } }],
        },
        select: { id: true, name: true, displayMode: true, updatedAt: true },
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
        take: MAX_PLAYER_MURALS,
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        displayMode: row.displayMode as MuralDisplayMode,
        version: versionOf(row.updatedAt),
      }));
    });
  }

  /** Imagem só de mural no ar hoje (o jogador não descobre murais agendados). */
  playerImage(tenant: ResolvedTenant, id: string): Promise<MuralImage> {
    const day = toDate(today());
    return this.image(tenant, { id, startsOn: { lte: day }, endsOn: { gte: day } });
  }

  /** Registra que o jogador viu um mural "Apenas uma vez" no ar. Idempotente; nos "Sempre" não grava nada. */
  markSeen(tenant: ResolvedTenant, userId: string, id: string): Promise<void> {
    const day = toDate(today());
    return this.db.withTenant(tenant.id, async (tx) => {
      const mural = await tx.mural.findFirst({
        where: { tenantId: tenant.id, id, startsOn: { lte: day }, endsOn: { gte: day } },
        select: { displayMode: true },
      });
      if (!mural) throw notFound();
      if (mural.displayMode !== 'ONCE') return;
      await tx.muralView.createMany({ data: [{ tenantId: tenant.id, muralId: id, userId }], skipDuplicates: true });
    });
  }

  // -------------------------------------------------------------------------

  private image(
    tenant: ResolvedTenant,
    where: { id: string; startsOn?: object; endsOn?: object },
  ): Promise<MuralImage> {
    return this.db.withTenant(tenant.id, async (tx) => {
      const row = await tx.mural.findFirst({
        where: { tenantId: tenant.id, ...where },
        select: { image: true, imageType: true },
      });
      if (!row) throw notFound();
      return { type: row.imageType as MuralImageType, data: row.image };
    });
  }

  /** Mais recentes primeiro (pela data inicial), como o jogador vê. */
  private async load(tx: TenantTx, tenantId: string): Promise<AdminMural[]> {
    const rows = await tx.mural.findMany({
      where: { tenantId },
      select: ADMIN_SELECT,
      orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    });
    const sizes = await tx.$queryRaw<Array<{ id: string; bytes: number }>>`
      SELECT "id"::text AS "id", octet_length("image") AS "bytes" FROM "murals" WHERE "tenant_id" = ${tenantId}::uuid`;
    const bytesById = new Map(sizes.map((row) => [row.id, Number(row.bytes)]));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startsOn: fromDate(row.startsOn),
      endsOn: fromDate(row.endsOn),
      displayMode: row.displayMode as MuralDisplayMode,
      imageType: row.imageType as MuralImageType,
      imageBytes: bytesById.get(row.id) ?? 0,
      viewsCount: row._count.views,
      version: versionOf(row.updatedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}

/** Datas reais, fim >= início (e fim de hoje em diante, quando pedido) e imagem PNG/JPEG/WebP de até 3 MB. */
function validate(input: SaveMuralInput, { checkEnd }: { checkEnd: boolean }): ValidMural {
  const now = new Date().toISOString();
  if (dayOffsetOf(now, input.startsOn) === null) throw invalid('startsOn', 'Data inicial inválida.');
  const endOffset = dayOffsetOf(now, input.endsOn);
  if (endOffset === null) throw invalid('endsOn', 'Data final inválida.');
  if (input.endsOn < input.startsOn) throw invalid('endsOn', 'A data final deve ser igual ou depois da inicial.');
  if (checkEnd && endOffset < 0) throw invalid('endsOn', 'A data final já passou.');

  let image: ValidMural['image'];
  if (input.image !== undefined) {
    const data = new Uint8Array(Buffer.from(input.image, 'base64'));
    if (data.byteLength === 0) throw invalid('image', 'Imagem vazia.');
    if (data.byteLength > MURAL_LIMITS.imageMaxBytes) throw invalid('image', 'Imagem acima de 3 MB.');
    const type = detectMuralImageType(data);
    if (!type) throw invalid('image', 'Use uma imagem PNG, JPG ou WebP.');
    image = { data, type };
  }

  return {
    name: input.name,
    startsOn: toDate(input.startsOn),
    endsOn: toDate(input.endsOn),
    displayMode: input.displayMode,
    ...(image ? { image } : {}),
  };
}
