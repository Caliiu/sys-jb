import { Inject, Injectable } from '@nestjs/common';
import type {
  CrmInactiveList,
  CrmInactiveRow,
  CrmInactiveSort,
  CrmNeverDepositedList,
  CrmNeverDepositedRow,
  CrmNeverDepositedSort,
} from '@sysjb/contracts';
import { Prisma } from '@sysjb/database';
import { AppError } from '../common/app-error.js';
import { DatabaseService, type TenantTx } from '../database/database.service.js';
import type { ResolvedTenant } from '../tenancy/tenant.types.js';
import type { CrmInactiveQuery, CrmNeverDepositedQuery } from './crm.schemas.js';

/** Colunas SQL de cada ordenação (listas fixas: o valor da requisição nunca vai para o SQL). */
const COMMON_SORTS = {
  name: Prisma.raw('b."name"'),
  type: Prisma.raw('b."is_promoter"'),
  promoter: Prisma.raw('b."promoter_name"'),
  code: Prisma.raw('b."display_id"'),
  phone: Prisma.raw('b."phone"'),
  relationshipDays: Prisma.raw('b."relationship_days"'),
} as const;

const INACTIVE_SORTS: Record<CrmInactiveSort, Prisma.Sql> = {
  ...COMMON_SORTS,
  totalDeposited: Prisma.raw('b."total_deposited"'),
  daysWithoutDeposit: Prisma.raw('b."days_without_deposit"'),
  deposits: Prisma.raw('b."deposits"'),
};

const NEVER_DEPOSITED_SORTS: Record<CrmNeverDepositedSort, Prisma.Sql> = COMMON_SORTS;

interface BaseRow {
  id: string;
  display_id: number;
  name: string;
  phone: string;
  is_promoter: boolean;
  promoter_id: string | null;
  promoter_display_id: number | null;
  promoter_name: string | null;
  relationship_days: number;
  created_at: Date;
  total: bigint;
}

interface InactiveRow extends BaseRow {
  total_deposited: bigint;
  deposits: bigint;
  days_without_deposit: number;
  last_deposit_at: Date;
}

const toPlayer = (row: BaseRow) => ({
  player: { id: row.id, displayId: row.display_id, name: row.name },
  type: row.is_promoter ? ('promoter' as const) : ('player' as const),
  promoter:
    row.promoter_id && row.promoter_display_id !== null && row.promoter_name !== null
      ? { id: row.promoter_id, displayId: row.promoter_display_id, name: row.promoter_name }
      : null,
  phone: row.phone,
  relationshipDays: Number(row.relationship_days),
  createdAt: row.created_at.toISOString(),
});

/** "Hoje" no calendário de Brasília (o servidor do banco pode estar em outro fuso). */
const TODAY = Prisma.raw(`(now() AT TIME ZONE 'America/Sao_Paulo')::date`);
const localDate = (column: Prisma.Sql) => Prisma.sql`(${column} AT TIME ZONE 'America/Sao_Paulo')::date`;

/**
 * CRM do painel: listas de contas ATIVAS da banca do operador para reativar (inativos: já depositaram e estão há X–Y
 * dias sem depositar) ou converter (nunca depositantes: cadastrados há X–Y dias sem nenhum depósito). Depósito =
 * Recarga Pix paga. Só leitura, numa consulta por página (linhas + total pela janela); toda parte filtra pela banca, além
 * do RLS da transação, e o SQL é sempre parametrizado. O telefone vai para quem pode ver os apostadores (`users.read`),
 * como na lista de apostadores.
 */
@Injectable()
export class CrmService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  inactive(tenant: ResolvedTenant, query: CrmInactiveQuery): Promise<CrmInactiveList> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.checkPromoter(tx, tenant.id, query.promoterId);
      const tenantId = Prisma.sql`${tenant.id}::uuid`;
      const rows = await tx.$queryRaw<InactiveRow[]>`
        WITH dep AS (
          SELECT d."user_id", sum(d."amount_cents") AS total_deposited, count(*) AS deposits,
                 max(d."paid_at") AS last_deposit_at
          FROM "pix_deposits" d
          WHERE d."tenant_id" = ${tenantId} AND d."status" = 'PAID'
          GROUP BY d."user_id"
        ),
        b AS (
          SELECT ${this.playerColumns()},
                 dep.total_deposited, dep.deposits, dep.last_deposit_at,
                 (${TODAY} - ${localDate(Prisma.sql`dep.last_deposit_at`)}) AS days_without_deposit
          FROM dep
          JOIN "users" u ON u."tenant_id" = ${tenantId} AND u."id" = dep."user_id"
          ${this.promoterJoin(tenantId)}
          WHERE u."status" = 'ACTIVE' ${this.promoterFilter(query.promoterId)}
        )
        SELECT b.*, count(*) OVER () AS total FROM b
        WHERE b.days_without_deposit BETWEEN ${query.minDays} AND ${query.maxDays}
        ORDER BY ${INACTIVE_SORTS[query.sort]} ${this.direction(query.dir)} NULLS LAST, b."display_id"
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      return this.page(query, rows, (row): CrmInactiveRow => ({
        ...toPlayer(row),
        totalDepositedCents: Number(row.total_deposited),
        daysWithoutDeposit: Number(row.days_without_deposit),
        deposits: Number(row.deposits),
        lastDepositAt: row.last_deposit_at.toISOString(),
      }));
    });
  }

  neverDeposited(tenant: ResolvedTenant, query: CrmNeverDepositedQuery): Promise<CrmNeverDepositedList> {
    return this.db.withTenant(tenant.id, async (tx) => {
      await this.checkPromoter(tx, tenant.id, query.promoterId);
      const tenantId = Prisma.sql`${tenant.id}::uuid`;
      const rows = await tx.$queryRaw<BaseRow[]>`
        WITH b AS (
          SELECT ${this.playerColumns()}
          FROM "users" u
          ${this.promoterJoin(tenantId)}
          WHERE u."tenant_id" = ${tenantId} AND u."status" = 'ACTIVE' ${this.promoterFilter(query.promoterId)}
            AND NOT EXISTS (
              SELECT 1 FROM "pix_deposits" d
              WHERE d."tenant_id" = ${tenantId} AND d."user_id" = u."id" AND d."status" = 'PAID')
        )
        SELECT b.*, count(*) OVER () AS total FROM b
        WHERE b.relationship_days BETWEEN ${query.minDays} AND ${query.maxDays}
        ORDER BY ${NEVER_DEPOSITED_SORTS[query.sort]} ${this.direction(query.dir)} NULLS LAST, b."display_id"
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      return this.page(query, rows, (row): CrmNeverDepositedRow => toPlayer(row));
    });
  }

  /** Promotor do filtro precisa ser promotor desta banca (senão 404, como nos relatórios). */
  private async checkPromoter(tx: TenantTx, tenantId: string, promoterId: string | undefined): Promise<void> {
    if (!promoterId) return;
    const promoter = await tx.user.findFirst({
      where: { tenantId, id: promoterId, promoterCommissionBps: { not: null } },
      select: { id: true },
    });
    if (!promoter) throw new AppError(404, 'NOT_FOUND', 'Promotor não encontrado.');
  }

  /** Colunas do jogador e do promotor que o indicou (com o alias r), e os dias de relacionamento. */
  private playerColumns(): Prisma.Sql {
    return Prisma.sql`u."id", u."display_id", u."name", u."phone", u."created_at",
                      u."promoter_commission_bps" IS NOT NULL AS is_promoter,
                      r."id" AS promoter_id, r."display_id" AS promoter_display_id, r."name" AS promoter_name,
                      (${TODAY} - ${localDate(Prisma.sql`u."created_at"`)}) AS relationship_days`;
  }

  /** Quem indicou, só se for promotor ("Promotor associado"). */
  private promoterJoin(tenantId: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`LEFT JOIN "users" r ON r."tenant_id" = ${tenantId} AND r."id" = u."referred_by_user_id"
                        AND r."promoter_commission_bps" IS NOT NULL`;
  }

  private promoterFilter(promoterId: string | undefined): Prisma.Sql {
    return promoterId ? Prisma.sql`AND u."referred_by_user_id" = ${promoterId}::uuid` : Prisma.empty;
  }

  private direction(dir: 'asc' | 'desc'): Prisma.Sql {
    return dir === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
  }

  private page<Row extends BaseRow, Item>(
    query: { minDays: number; maxDays: number; page: number; pageSize: number },
    rows: Row[],
    map: (row: Row) => Item,
  ) {
    const total = Number(rows[0]?.total ?? 0n);
    return {
      items: rows.map(map),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      minDays: query.minDays,
      maxDays: query.maxDays,
    };
  }
}
