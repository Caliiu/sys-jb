import type { AdminUserDetail, AdminUserListItem } from '@sysjb/contracts';
import type { User, Wallet } from '@sysjb/database';
import { toPublicWallet } from '../users/user.mapper.js';

const toRef = (user: Pick<User, 'id' | 'displayId' | 'name'>) => ({
  id: user.id,
  displayId: user.displayId,
  name: user.name,
});

/** Campos das listas de usuários (página de usuários, indicados do promotor, busca). */
export const ADMIN_LIST_SELECT = {
  id: true,
  displayId: true,
  name: true,
  document: true,
  phone: true,
  status: true,
  createdAt: true,
  referredBy: { select: { id: true, displayId: true, name: true, promoterCommissionBps: true } },
} as const;

type ListSource = Pick<User, 'id' | 'displayId' | 'name' | 'document' | 'phone' | 'status' | 'createdAt'> & {
  referredBy: Pick<User, 'id' | 'displayId' | 'name' | 'promoterCommissionBps'> | null;
};

/** Lista: CPF e telefone completos (só dígitos), para o operador identificar o usuário. */
export function toAdminListItem(user: ListSource): AdminUserListItem {
  return {
    id: user.id,
    displayId: user.displayId,
    name: user.name,
    document: user.document,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    referredBy: user.referredBy ? toRef(user.referredBy) : null,
    // O mesmo "indicado por", só quando é promotor (os percentuais se somam no fechamento).
    promoter:
      user.referredBy?.promoterCommissionBps != null
        ? { ...toRef(user.referredBy), commissionBps: user.referredBy.promoterCommissionBps }
        : null,
  };
}

type DetailSource = Omit<User, 'passwordHash'> & {
  referredBy: Pick<User, 'id' | 'displayId' | 'name' | 'promoterCommissionBps'> | null;
};

/** Detalhe: dados completos para o operador conferir e corrigir. Nunca inclui o hash da senha. */
export function toAdminDetail(user: DetailSource, wallet: Wallet, lastLoginAt: Date | null): AdminUserDetail {
  return {
    id: user.id,
    displayId: user.displayId,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone,
    document: user.document,
    birthDate: user.birthDate.toISOString().slice(0, 10),
    inviteCode: user.inviteCode,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: lastLoginAt ? lastLoginAt.toISOString() : null,
    wallet: toPublicWallet(wallet),
    promoterCommissionBps: user.promoterCommissionBps,
    casinoCommissionBps: user.casinoCommissionBps,
    referredBy: user.referredBy,
  };
}
