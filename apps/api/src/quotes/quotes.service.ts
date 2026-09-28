import { Inject, Injectable } from '@nestjs/common';
import {
  FAZENDINHA_MODE_CODES,
  type FazendinhaModeId,
  type PublicQuotes,
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

/**
 * Cotações da banca: o padrão do código com o que o Gerente alterou por cima. A compra (Fazendinha e,
 * depois, Loterias) sempre lê daqui, na mesma transação.
 */
@Injectable()
export class QuotesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  /**
   * Para vender: trava COMPARTILHADA da cotação da banca até o fim da transação e lê a tabela. Várias compras
   * andam juntas; quem salva a cotação (trava exclusiva) espera as compras em andamento terminarem, e as compras
   * seguintes esperam o salvamento e já leem a tabela nova. Assim nenhum pule é gravado com uma cotação que o
   * gerente já trocou.
   */
  async loadForSale(tx: TenantTx, tenantId: string): Promise<PublicQuotes> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${QUOTES_LOCK}::int, hashtext(${tenantId}))`;
    return this.load(tx, tenantId);
  }

  /** Trava EXCLUSIVA da cotação da banca (salvamento), até o fim da transação. */
  private async lockForUpdate(tx: TenantTx, tenantId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTES_LOCK}::int, hashtext(${tenantId}))`;
  }

  get(tenant: ResolvedTenant): Promise<PublicQuotes> {
    return this.db.withTenant(tenant.id, (tx) => this.load(tx, tenant.id));
  }

  /** Tabela da banca (usa a transação de quem chama, para ler com o mesmo contexto). */
  async load(tx: TenantTx, tenantId: string): Promise<PublicQuotes> {
    const [traditionalRows, fazendinhaRows] = await Promise.all([
      tx.traditionalQuote.findMany({ where: { tenantId }, select: { modality: true, prizeCents: true } }),
      tx.fazendinhaQuote.findMany({ where: { tenantId }, select: { mode: true, stakeCents: true, prizeCents: true } }),
    ]);
    const base = defaultQuotes();
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
    return { tableLabel: quoteTableLabel(traditional), traditional, fazendinha };
  }

  /** Aplica os itens alterados do Tradicional. Só grava e audita o que mudou de fato. */
  setTraditional(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    input: SetTraditionalQuotesRequest,
  ): Promise<PublicQuotes> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      const current = await this.load(tx, tenant.id);
      const incoming = new Map(input.quotes.map((q) => [q.modality, q.prizeCents]));
      if (incoming.size !== input.quotes.length) throw duplicated();
      // Só os itens enviados; o resto da tabela fica como está (inclusive o que outro gerente mudou).
      const changed = current.traditional.filter(
        (q) => incoming.has(q.modality) && incoming.get(q.modality) !== q.prizeCents,
      );
      for (const q of changed) {
        const prizeCents = incoming.get(q.modality)!;
        await tx.traditionalQuote.upsert({
          where: { tenantId_modality: { tenantId: tenant.id, modality: q.modality } },
          create: { tenantId: tenant.id, modality: q.modality, prizeCents },
          update: { prizeCents },
        });
      }
      if (changed.length > 0) {
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'quote.update',
          targetType: 'tenant',
          targetId: tenant.id,
          details: { fields: changed.map((q) => `Tradicional ${q.label}`) },
        });
      }
      return this.load(tx, tenant.id);
    });
  }

  /** Aplica os itens alterados da Fazendinha. Só grava e audita o que mudou de fato. */
  setFazendinha(
    tenant: ResolvedTenant,
    operator: AuthenticatedOperator,
    input: SetFazendinhaQuotesRequest,
  ): Promise<PublicQuotes> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.lockForUpdate(tx, tenant.id);
      const current = await this.load(tx, tenant.id);
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
          where: { tenantId_mode_stakeCents: { tenantId: tenant.id, mode, stakeCents: q.stakeCents } },
          create: { tenantId: tenant.id, mode, stakeCents: q.stakeCents, prizeCents },
          update: { prizeCents },
        });
      }
      if (changed.length > 0) {
        await recordAudit(tx, {
          tenantId: tenant.id,
          operatorId: operator.id,
          action: 'quote.update',
          targetType: 'tenant',
          targetId: tenant.id,
          details: {
            fields: changed.map((q) => `Fazendinha ${FAZENDINHA_MODE_CODES[q.mode]}-${q.stakeCents / 100}`),
          },
        });
      }
      return this.load(tx, tenant.id);
    });
  }
}

const duplicated = () =>
  new AppError(400, 'VALIDATION_ERROR', 'Payload inválido.', [
    { field: 'quotes', message: 'Cada item só pode aparecer uma vez.' },
  ]);
