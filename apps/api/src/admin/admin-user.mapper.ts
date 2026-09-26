import { type AdminUserDetail, type AdminUserListItem, maskDocument, maskPhone } from '@sysjb/contracts';
import type { User, Wallet } from '@sysjb/database';
import { toPublicWallet } from '../users/user.mapper.js';

type ListSource = Pick<User, 'id' | 'displayId' | 'name' | 'document' | 'phone' | 'status' | 'createdAt'>;

/** Lista: CPF e telefone sempre mascarados. */
export function toAdminListItem(user: ListSource): AdminUserListItem {
  return {
    id: user.id,
    displayId: user.displayId,
    name: user.name,
    documentMasked: maskDocument(user.document),
    phoneMasked: maskPhone(user.phone),
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

type DetailSource = Omit<User, 'passwordHash'>;

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
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: lastLoginAt ? lastLoginAt.toISOString() : null,
    wallet: toPublicWallet(wallet),
  };
}
