import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminGiftMilharSettings,
  type AdminQuoteTable,
  type AdminQuoteTableSummary,
  type AuditChange,
  type CreateQuoteTableRequest,
  GIFT_MILHAR_DEFAULTS,
  type GiftMilharSettings,
  FAZENDINHA_MODE_CODES,
  type FazendinhaModeId,
  type PublicQuotes,
  type RenameQuoteTableRequest,
  type SetFazendinhaQuotesRequest,
  type SetTraditionalQuotesRequest,
  defaultQuotes,
  quoteTableLabel,
} from '@sysjb/contracts';
import type { FazendinhaMode } from '@sysjb/database';
import { recordAudit } from '../admin/audit.js';
import type { AuthenticatedOperator } from '../admin/operator.types.js';
import { AppError } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';

const TO_DB_MODE: Record<FazendinhaModeId, FazendinhaMode> = { grupo: 'GRUPO', dezena: 'DEZENA', centena: 'CENTENA' };
const FROM_DB_MODE: Record<FazendinhaMode, FazendinhaModeId> = { GRUPO: 'grupo', DEZENA: 'dezena', CENTENA: 'centena' };

const fazendinhaKey = (mode: FazendinhaModeId, stakeCents: number) => `${mode}|${stakeCents}`;

/** Classe da trava de cotação (advisory lock por banca: 2º argumento = hash do id da banca). */
const QUOTES_LOCK = 7201;

/** Tabela de cotação resumida (painel de unidades). */
export interface QuoteTableRef {
  id: string;
  name: string;
  /** Rótulo dos valores (centena/1/milhar), o que sai no pule. */
  label: string;
  isDefault: boolean;
}

/**
 * Tabelas da banca para o painel de unidades: id, nome, rótulo dos valores e se é a padrão. Banca sem tabela gravada:
 * mapa vazio (vale a padrão do código).
 */
export async function quoteTableRefs(tx: TenantTx, tenantId: string): Promise<Map<string, QuoteTableRef>> {
  const [tables, values] = await Promise.all([
    tx.quoteTable.findMany({ where: { tenantId }, select: { id: true, name: true, isDefault: true } }),
    tx.traditionalQuote.findMany({
      where: { tenantId, modality: { in: ['centena', 'milhar'] } },
      select: { quoteTableId: true, modality: true, prizeCents: true },
    }),
  ]);
  const base = defaultQuotes().traditional;
  return new Map(
    tables.map((t) => {
      const saved = new Map(values.filter((v) => v.quoteTableId === t.id).map((v) => [v.modality, v.prizeCents]));
      const label = quoteTableLabel(base.map((q) => ({ ...q, prizeCents: saved.get(q.modality) ?? q.prizeCents })));
      return [t.id, { id: t.id, name: t.name, label, isDefault: t.isDefault }];
    }),
  );
}

const TABLE_SELECT = { id: true, name: true, isDefault: true, updatedAt: true } as const;

interface QuoteTableRow {
  id: string;
  name: string;
  isDefault: boolean;
  updatedAt: Date;
}

/**
 * Tabelas de cotação da banca. Cada tabela = o padrão do código com o que o Gerente alterou por cima. Exatamente uma é
 * a padrão: vale para a unidade (jogador) sem tabela própria. Banca sem nenhuma tabela gravada (recém-criada) usa a
 * padrão do código até o painel abrir as tabelas (aí a padrão é gravada). A compra (Loterias e Fazendinha) lê a tabela
 * do COMPRADOR, na mesma transação.
 */
@Injectable()
export class QuotesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Para vender: trava COMPARTILHADA da cotação da banca até o fim da transação e lê a tabela do comprador. Várias
   * compras andam juntas; quem salva uma tabela (trava exclusiva) espera as compras em andamento terminarem, e as
   * compras seguintes esperam o salvamento e já leem a tabela nova. Assim nenhum pule é gravado com uma cotação que o
   * gerente já trocou.
   */
  async loadForSale(tx: TenantTx, tenantId: string, userId: string): Promise<PublicQuotes> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${QUOTES_LOCK}::int, hashtext(${tenantId}))`;
    return this.loadForUser(tx, tenantId, userId);
  }

  /** Trava EXCLUSIVA da cotação da banca (alterações do painel), até o fim da transação. */
  private async lockForUpdate(tx: TenantTx, tenantId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTES_LOCK}::int, hashtext(${tenantId}))`;
  }

  /** GET /v1/quotes: a tabela do jogador (a dele ou a padrão; sem jogador, a padrão). */
  getForUser(tenant: ResolvedTenant, userId: string | null): Promise<PublicQuotes> {
    return this.db.withTenant(tenant.id, (tx) => this.loadForUser(tx, tenant.id, userId));
  }

  /** Tabela que vale para o jogador (usa a transação de quem chama, para ler com o mesmo contexto). */
  async loadForUser(tx: TenantTx, tenantId: string, userId: string | null): Promise<PublicQuotes> {
    return this.values(tx, tenantId, await this.effectiveTable(tx, tenantId, userId));
  }

  /** Rótulo (centena/1/milhar) da tabela que vale para o jogador: o que sai no pule. */
  async labelForUser(tx: TenantTx, tenantId: string, userId: string | null): Promise<string> {
    return (await this.loadForUser(tx, tenantId, userId)).tableLabel;
  }

  /** A tabela própria do jogador; senão a padrão da banca; null = banca sem tabela gravada (vale o código). */
  private async effectiveTable(tx: TenantTx, tenantId: string, userId: string | null): Promise<QuoteTableRow | null> {
    const own = userId
      ? ((await tx.user.findFirst({ where: { tenantId, id: userId }, select: { quoteTableId: true } }))?.quoteTableId ??
        null)
      : null;
    const rows = await tx.quoteTable.findMany({
      where: { tenantId, OR: own ? [{ isDefault: true }, { id: own }] : [{ isDefault: true }] },
      select: TABLE_SELECT,
    });
    return rows.find((r) => r.id === own) ?? rows.find((r) => r.isDefault) ?? null;
  }

  /** Prêmios da tabela: padrão do código com o que foi gravado por cima. */
  private async values(tx: TenantTx, tenantId: string, table: QuoteTableRow | null): Promise<PublicQuotes> {
    const base = defaultQuotes();
    if (!table) return base;
    const [traditionalRows, fazendinhaRows] = await Promise.all([
      tx.traditionalQuote.findMany({
        where: { tenantId, quoteTableId: table.id },
        select: { modality: true, prizeCents: true },
      }),
      tx.fazendinhaQuote.findMany({
        where: { tenantId, quoteTableId: table.id },
        select: { mode: true, stakeCents: true, prizeCents: true },
      }),
    ]);
    const traditionalSaved = new Map(traditionalRows.map((r) => [r.modality, r.prizeCents]));
    const fazendinhaSaved = new Map(
      fazendinhaRows.map((r) => [fazendinhaKey(FROM_DB_MODE[r.mode], r.stakeCents), r.prizeCents]),
    );
    const traditional = base.traditional.map((q) => ({
      ...q,
      prizeCents: traditionalSaved.get(q.modality) ?? q.prizeCents,
    }));
    const fazendinha = base.fazendinha.map((q) => ({
      ...q,
      prizeCents: fazendinhaSaved.get(fazendinhaKey(q.mode, q.stakeCents)) ?? q.prizeCents,
    }));
    // O rótulo é sempre o dos valores (centena/1/milhar): é o que sai no pule e no recibo do jogador. O nome da
    // tabela é só do painel.
    return { tableLabel: quoteTableLabel(traditional), traditional, fazendinha };
  }

  /**
   * Banca sem tabela gravada (recém-criada): grava a padrão, com o nome do rótulo dos valores padrão (800/1/8000).
   * Só o painel chama, com a trava exclusiva.
   */
  private async ensureDefault(tx: TenantTx, tenantId: string): Promise<void> {
    if ((await tx.quoteTable.count({ where: { tenantId } })) > 0) return;
    await tx.quoteTable.create({ data: { tenantId, name: defaultQuotes().tableLabel, isDefault: true } });
  }

  /**
   * Milhar Brinde na venda: a configuração da banca, se a regra vale para o comprador (banca e unidade ligadas); null =
   * sem brinde. Chamar depois de loadForSale, na mesma transação: a trava da cotação garante que o painel não muda a
   * configuração no meio da compra.
   */
  async giftForSale(tx: TenantTx, tenantId: string, userId: string): Promise<GiftMilharSettings | null> {
    const settings = await this.readGift(tx, tenantId);
    if (!settings.enabled) return null;
    const user = await tx.user.findFirst({ where: { tenantId, id: userId }, select: { giftMilharEnabled: true } });
    return user?.giftMilharEnabled ? settings : null;
  }

  /** GET /v1/admin/quote-tables/gift-milhar */
  getGiftMilhar(tenant: ResolvedTenant): Promise<AdminGiftMilharSettings> {
    return this.db.withTenant(tenant.id, (tx) => this.readGift(tx, tenant.id));
  }

  /**
   * PUT /v1/admin/quote-tables/gift-milhar: grava a configuração inteira, com a trava exclusiva da cotação (as compras
   * em andamento terminam com a anterior). Auditado com cada campo alterado (antes e depois); sem alteração, nada é
   * gravado nem auditado.
   */
  setGiftMilhar(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    input: AdminGiftMilharSettings,
  ): Promise<AdminGiftMilharSettings> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      const previous = await this.readGift(tx, tenant.id);
      const changes: AuditChange[] = (Object.keys(input) as Array<keyof GiftMilharSettings>)
        .filter((field) => input[field] !== previous[field])
        .map((field) => ({ field, from: previous[field], to: input[field] }));
      if (changes.length === 0) return previous;
      const data = {
        giftMilharEnabled: input.enabled,
        giftMilharMinPuleCents: input.minPuleCents,
        giftMilharStakeCents: input.stakeCents,
        giftMilharPlacement: input.placement,
      };
      await tx.tenantSettings.upsert({
        where: { tenantId: tenant.id },
        create: { tenantId: tenant.id, ...data },
        update: data,
      });
      await recordAudit(tx, {
        tenantId: tenant.id,
        operatorId: operator.id,
        action: 'gift.milhar.settings',
        targetType: 'tenant',
        targetId: tenant.id,
        details: { fields: changes.map((change) => change.field), changes },
      });
      return { ...input };
    });
  }

  private async readGift(tx: TenantTx, tenantId: string): Promise<GiftMilharSettings> {
    const row = await tx.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        giftMilharEnabled: true,
        giftMilharMinPuleCents: true,
        giftMilharStakeCents: true,
        giftMilharPlacement: true,
      },
    });
    if (!row) return { ...GIFT_MILHAR_DEFAULTS };
    return {
      enabled: row.giftMilharEnabled,
      minPuleCents: row.giftMilharMinPuleCents,
      stakeCents: row.giftMilharStakeCents,
      placement: row.giftMilharPlacement,
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Painel
  // ---------------------------------------------------------------------------------------------------------------

  /** Tabelas da banca: a padrão primeiro, depois por nome. */
  list(tenant: ResolvedTenant): Promise<AdminQuoteTableSummary[]> {
    return this.db.withTenant(tenant.id, async (tx) => {
      if ((await tx.quoteTable.count({ where: { tenantId: tenant.id } })) === 0) {
        await this.lockForUpdate(tx, tenant.id);
        await this.ensureDefault(tx, tenant.id);
      }
      const rows = await tx.quoteTable.findMany({
        where: { tenantId: tenant.id },
        select: { ...TABLE_SELECT, _count: { select: { users: true } } },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });
      return rows.map((r) => toSummary(r, r._count.users));
    });
  }

  get(tenant: ResolvedTenant, id: string): Promise<AdminQuoteTable> {
    return this.db.withTenant(tenant.id, (tx) => this.detail(tx, tenant.id, id));
  }

  /** Nova tabela: prêmios padrão ou copiados de outra tabela da banca. Nome único na banca. */
  create(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    input: CreateQuoteTableRequest,
  ): Promise<AdminQuoteTable> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      await this.ensureDefault(tx, tenant.id);
      await this.assertNameFree(tx, tenant.id, input.name);
      const source = input.copyFromId ? await this.findTable(tx, tenant.id, input.copyFromId) : null;
      const created = await tx.quoteTable.create({ data: { tenantId: tenant.id, name: input.name } });
      if (source) {
        const [traditional, fazendinha] = await Promise.all([
          tx.traditionalQuote.findMany({
            where: { tenantId: tenant.id, quoteTableId: source.id },
            select: { modality: true, prizeCents: true },
          }),
          tx.fazendinhaQuote.findMany({
            where: { tenantId: tenant.id, quoteTableId: source.id },
            select: { mode: true, stakeCents: true, prizeCents: true },
          }),
        ]);
        if (traditional.length > 0) {
          await tx.traditionalQuote.createMany({
            data: traditional.map((q) => ({ ...q, tenantId: tenant.id, quoteTableId: created.id })),
          });
        }
        if (fazendinha.length > 0) {
          await tx.fazendinhaQuote.createMany({
            data: fazendinha.map((q) => ({ ...q, tenantId: tenant.id, quoteTableId: created.id })),
          });
        }
      }
      await this.audit(tx, tenant, operator, 'quote.create', created.name, source ? [`Cópia de ${source.name}`] : []);
      return this.detail(tx, tenant.id, created.id);
    });
  }

  rename(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    input: RenameQuoteTableRequest,
  ): Promise<AdminQuoteTable> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      const table = await this.findTable(tx, tenant.id, id);
      if (table.name !== input.name) {
        await this.assertNameFree(tx, tenant.id, input.name, id);
        await tx.quoteTable.update({ where: { id }, data: { name: input.name } });
        await this.audit(tx, tenant, operator, 'quote.update', input.name, [`Nome (antes: ${table.name})`]);
      }
      return this.detail(tx, tenant.id, id);
    });
  }

  /** Troca a tabela padrão da banca (vale para todas as unidades sem tabela própria). */
  setDefault(tenant: ResolvedTenant, operator: AuthenticatedOperator, id: string): Promise<AdminQuoteTable> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      const table = await this.findTable(tx, tenant.id, id);
      if (!table.isDefault) {
        // Desmarca antes de marcar: o índice único admite uma padrão por banca; o trigger adiado confere no commit
        // que sobrou exatamente uma.
        await tx.quoteTable.updateMany({ where: { tenantId: tenant.id, isDefault: true }, data: { isDefault: false } });
        await tx.quoteTable.update({ where: { id }, data: { isDefault: true } });
        await this.audit(tx, tenant, operator, 'quote.default', table.name, []);
      }
      return this.detail(tx, tenant.id, id);
    });
  }

  /** Exclui a tabela. Nunca a padrão; nem tabela com unidade apontando (troque a tabela delas antes). */
  remove(tenant: ResolvedTenant, operator: AuthenticatedOperator, id: string): Promise<void> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      const table = await this.findTable(tx, tenant.id, id);
      if (table.isDefault) {
        throw new AppError(409, 'CONFLICT', 'A tabela padrão não pode ser excluída. Escolha outra padrão antes.');
      }
      const users = await tx.user.count({ where: { tenantId: tenant.id, quoteTableId: id } });
      if (users > 0) {
        throw new AppError(
          409,
          'QUOTE_TABLE_IN_USE',
          'Há unidades usando esta tabela. Troque a tabela delas antes de excluir.',
          [{ field: 'usersCount', message: String(users) }],
        );
      }
      // Os itens da tabela vão junto (ON DELETE CASCADE).
      await tx.quoteTable.delete({ where: { id } });
      await this.audit(tx, tenant, operator, 'quote.delete', table.name, []);
    });
  }

  /** Aplica os itens alterados do Tradicional. Só grava e audita o que mudou de fato. */
  setTraditional(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    input: SetTraditionalQuotesRequest,
  ): Promise<AdminQuoteTable> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      const table = await this.findTable(tx, tenant.id, id);
      const current = await this.values(tx, tenant.id, table);
      const incoming = new Map(input.quotes.map((q) => [q.modality, q.prizeCents]));
      if (incoming.size !== input.quotes.length) throw duplicated();
      // Só os itens enviados; o resto da tabela fica como está (inclusive o que outro gerente mudou).
      const changed = current.traditional.filter(
        (q) => incoming.has(q.modality) && incoming.get(q.modality) !== q.prizeCents,
      );
      for (const q of changed) {
        const prizeCents = incoming.get(q.modality)!;
        await tx.traditionalQuote.upsert({
          where: {
            tenantId_quoteTableId_modality: { tenantId: tenant.id, quoteTableId: id, modality: q.modality },
          },
          create: { tenantId: tenant.id, quoteTableId: id, modality: q.modality, prizeCents },
          update: { prizeCents },
        });
      }
      if (changed.length > 0) {
        await tx.quoteTable.update({ where: { id }, data: { updatedAt: new Date() } });
        await this.audit(
          tx,
          tenant,
          operator,
          'quote.update',
          table.name,
          changed.map((q) => `Tradicional ${q.label}`),
        );
      }
      return this.detail(tx, tenant.id, id);
    });
  }

  /** Aplica os itens alterados da Fazendinha. Só grava e audita o que mudou de fato. */
  setFazendinha(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    id: string,
    input: SetFazendinhaQuotesRequest,
  ): Promise<AdminQuoteTable> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      const table = await this.findTable(tx, tenant.id, id);
      const current = await this.values(tx, tenant.id, table);
      const incoming = new Map(input.quotes.map((q) => [fazendinhaKey(q.mode, q.stakeCents), q.prizeCents]));
      if (incoming.size !== input.quotes.length) throw duplicated();
      const changed = current.fazendinha.filter((q) => {
        const key = fazendinhaKey(q.mode, q.stakeCents);
        return incoming.has(key) && incoming.get(key) !== q.prizeCents;
      });
      for (const q of changed) {
        const prizeCents = incoming.get(fazendinhaKey(q.mode, q.stakeCents))!;
        const mode = TO_DB_MODE[q.mode];
        await tx.fazendinhaQuote.upsert({
          where: {
            tenantId_quoteTableId_mode_stakeCents: {
              tenantId: tenant.id,
              quoteTableId: id,
              mode,
              stakeCents: q.stakeCents,
            },
          },
          create: { tenantId: tenant.id, quoteTableId: id, mode, stakeCents: q.stakeCents, prizeCents },
          update: { prizeCents },
        });
      }
      if (changed.length > 0) {
        await tx.quoteTable.update({ where: { id }, data: { updatedAt: new Date() } });
        await this.audit(
          tx,
          tenant,
          operator,
          'quote.update',
          table.name,
          changed.map((q) => `Fazendinha ${FAZENDINHA_MODE_CODES[q.mode]}-${q.stakeCents / 100}`),
        );
      }
      return this.detail(tx, tenant.id, id);
    });
  }

  private async findTable(tx: TenantTx, tenantId: string, id: string): Promise<QuoteTableRow> {
    const table = await tx.quoteTable.findFirst({ where: { tenantId, id }, select: TABLE_SELECT });
    if (!table) throw new AppError(404, 'NOT_FOUND', 'Tabela de cotação não encontrada.');
    return table;
  }

  private async detail(tx: TenantTx, tenantId: string, id: string): Promise<AdminQuoteTable> {
    const table = await this.findTable(tx, tenantId, id);
    const [quotes, usersCount] = await Promise.all([
      this.values(tx, tenantId, table),
      tx.user.count({ where: { tenantId, quoteTableId: id } }),
    ]);
    return { ...toSummary(table, usersCount), ...quotes };
  }

  /** Nome único na banca, sem diferenciar maiúsculas (o banco confere de novo: quote_tables_tenant_name_key). */
  private async assertNameFree(tx: TenantTx, tenantId: string, name: string, exceptId?: string): Promise<void> {
    const taken = await tx.quoteTable.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (taken) {
      throw new AppError(409, 'CONFLICT', 'Já existe uma tabela com esse nome.', [
        { field: 'name', message: 'Nome já usado.' },
      ]);
    }
  }

  private audit(
    tx: TenantTx,
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    action: 'quote.create' | 'quote.update' | 'quote.default' | 'quote.delete',
    quoteTable: string,
    fields: string[],
  ) {
    return recordAudit(tx, {
      tenantId: tenant.id,
      operatorId: operator.id,
      action,
      targetType: 'tenant',
      targetId: tenant.id,
      details: { fields, quoteTable },
    });
  }
}

function toSummary(table: QuoteTableRow, usersCount: number): AdminQuoteTableSummary {
  return {
    id: table.id,
    name: table.name,
    isDefault: table.isDefault,
    usersCount,
    updatedAt: table.updatedAt.toISOString(),
  };
}

const duplicated = () =>
  new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [
    { field: 'quotes', message: 'Cada item só pode aparecer uma vez.' },
  ]);
