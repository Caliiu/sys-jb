import { Injectable } from '@nestjs/common';
import { digitsOnly } from '@sysjb/contracts';
import type { Prisma, User, UserStatus, Wallet } from '@sysjb/database';
import type { TenantTx } from '../database/database.service.js';
import type { ListUsersQuery } from './admin.schemas.js';

type ListRow = Pick<User, 'id' | 'displayId' | 'name' | 'document' | 'phone' | 'status' | 'createdAt'>;
type DetailRow = Omit<User, 'passwordHash'> & { wallet: Wallet | null; sessions: Array<{ createdAt: Date }> };

/** Texto de busca só com dígitos e pontuação de CPF/telefone (ex.: "529.982", "(11) 91234"). */
const NUMERIC_SEARCH = /^[\d\s().\-/]+$/;

/** O Prisma NÃO escapa curingas em `contains`: "\", "%" e "_" viram literais (escape padrão do LIKE no PostgreSQL). */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Busca por nome, CPF, telefone, e-mail (se tiver "@") ou ID exibido do usuário.
 * O texto do operador nunca vira curinga de LIKE.
 */
function searchFilter(search: string): Prisma.UserWhereInput {
  const digits = digitsOnly(search);
  const any: Prisma.UserWhereInput[] = [{ name: { contains: escapeLike(search), mode: 'insensitive' } }];
  if (NUMERIC_SEARCH.test(search) && digits.length >= 3) {
    any.push({ document: { contains: digits } }, { phone: { contains: digits } });
  }
  if (/^\d{1,9}$/.test(search)) any.push({ displayId: Number(search) });
  if (search.includes('@')) any.push({ email: { contains: escapeLike(search.toLowerCase()) } });
  return { OR: any };
}

/** Consultas do painel sobre users. Toda operação filtra por tenantId, além do RLS da transação. */
@Injectable()
export class AdminUsersRepository {
  async list(tx: TenantTx, tenantId: string, query: ListUsersQuery): Promise<{ rows: ListRow[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? searchFilter(query.search) : {}),
    };
    const rows = await tx.user.findMany({
      where,
      select: { id: true, displayId: true, name: true, document: true, phone: true, status: true, createdAt: true },
      // id desempata usuários criados no mesmo instante: a paginação nunca repete nem perde linhas.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const total = await tx.user.count({ where });
    return { rows, total };
  }

  findDetail(tx: TenantTx, tenantId: string, id: string): Promise<DetailRow | null> {
    return tx.user.findFirst({
      where: { id, tenantId },
      omit: { passwordHash: true },
      include: { wallet: true, sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } },
    });
  }

  /** Muda o status. Retorna o status anterior, ou null se o usuário não existe nesta banca. */
  async setStatus(tx: TenantTx, tenantId: string, id: string, status: UserStatus): Promise<UserStatus | null> {
    const current = await tx.user.findFirst({ where: { id, tenantId }, select: { status: true } });
    if (!current) return null;
    if (current.status !== status) await tx.user.updateMany({ where: { id, tenantId }, data: { status } });
    return current.status;
  }

  /** Encerra todas as sessões abertas do usuário (ao bloquear). */
  revokeSessions(tx: TenantTx, tenantId: string, userId: string): Promise<unknown> {
    return tx.session.updateMany({ where: { tenantId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
