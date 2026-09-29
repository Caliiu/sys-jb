import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@sysjb/database';
import type { TenantTx } from '../database/database.service.js';
import { searchFilter } from './admin-users.repository.js';
import type { ListPromotersQuery, ReferralsQuery } from './admin.schemas.js';
import { ADMIN_LIST_SELECT } from './admin-user.mapper.js';

export type PromoterRow = Pick<User, 'id' | 'displayId' | 'name' | 'phone' | 'inviteCode' | 'status' | 'createdAt'> & {
  promoterCommissionBps: number;
  _count: { referrals: number };
};

export type ReferralRow = Pick<User, 'id' | 'displayId' | 'name' | 'document' | 'phone' | 'status' | 'createdAt'> & {
  referredBy: Pick<User, 'id' | 'displayId' | 'name' | 'promoterCommissionBps'> | null;
};

/** Teto de opções do filtro por promotor (proteção; a banca não deve chegar perto disso). */
export const PROMOTER_OPTIONS_MAX = 1000;

const PROMOTER_SELECT = {
  id: true,
  displayId: true,
  name: true,
  inviteCode: true,
  phone: true,
  status: true,
  createdAt: true,
  promoterCommissionBps: true,
  _count: { select: { referrals: true } },
} as const;

/** Consultas de promotores. Toda operação filtra por tenantId, além do RLS da transação. */
@Injectable()
export class PromotersRepository {
  async list(
    tx: TenantTx,
    tenantId: string,
    query: ListPromotersQuery,
  ): Promise<{ rows: PromoterRow[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      tenantId,
      promoterCommissionBps: { not: null },
      ...(query.search ? searchFilter(query.search) : {}),
    };
    const rows = await tx.user.findMany({
      where,
      select: PROMOTER_SELECT,
      // id desempata nomes iguais: a paginação nunca repete nem perde linhas.
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await tx.user.count({ where });
    return { rows: rows as PromoterRow[], total };
  }

  /** Todos os promotores da banca, por nome (opções do filtro da lista de usuários). */
  listOptions(tx: TenantTx, tenantId: string): Promise<Array<Pick<User, 'id' | 'displayId' | 'name'>>> {
    return tx.user.findMany({
      where: { tenantId, promoterCommissionBps: { not: null } },
      select: { id: true, displayId: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: PROMOTER_OPTIONS_MAX,
    });
  }

  /** Promotor da banca (comissão definida); null se o usuário não existe ou não é promotor. */
  async findPromoter(tx: TenantTx, tenantId: string, id: string): Promise<PromoterRow | null> {
    const row = await tx.user.findFirst({
      where: { id, tenantId, promoterCommissionBps: { not: null } },
      select: PROMOTER_SELECT,
    });
    return row as PromoterRow | null;
  }

  /** Comissão atual do usuário: `undefined` = usuário não existe nesta banca; `null` = existe e não é promotor. */
  async currentCommission(tx: TenantTx, tenantId: string, id: string): Promise<number | null | undefined> {
    const user = await tx.user.findFirst({ where: { id, tenantId }, select: { promoterCommissionBps: true } });
    return user ? user.promoterCommissionBps : undefined;
  }

  setCommission(tx: TenantTx, tenantId: string, id: string, bps: number | null): Promise<unknown> {
    return tx.user.updateMany({ where: { id, tenantId }, data: { promoterCommissionBps: bps } });
  }

  async listReferrals(
    tx: TenantTx,
    tenantId: string,
    promoterId: string,
    query: ReferralsQuery,
  ): Promise<{ rows: ReferralRow[]; total: number }> {
    const where: Prisma.UserWhereInput = { tenantId, referredByUserId: promoterId };
    const rows = await tx.user.findMany({
      where,
      select: ADMIN_LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await tx.user.count({ where });
    return { rows, total };
  }
}
