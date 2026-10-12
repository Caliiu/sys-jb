import {
  type AdminUnitQuoteTable,
  type AdminUnitSettings,
  type AdminUserDetail,
  type AdminUserListItem,
  type BrazilianUf,
  defaultQuotes,
} from '@sysjb/contracts';
import type { User, Wallet } from '@sysjb/database';
import type { QuoteTableRef } from '../quotes/quotes.service.js';
import { toPublicWallet } from '../users/user.mapper.js';

/** Campos da unidade lidos de users (lista e detail). */
export const UNIT_SELECT = {
  region: true,
  unitCommissionBps: true,
  quoteTableId: true,
  giftMilharEnabled: true,
  retainPrizes: true,
  dailyLimitEnabled: true,
  dailyLimitCents: true,
} as const;

export type UnitSource = Pick<
  User,
  | 'region'
  | 'unitCommissionBps'
  | 'quoteTableId'
  | 'giftMilharEnabled'
  | 'retainPrizes'
  | 'dailyLimitEnabled'
  | 'dailyLimitCents'
>;

/** Tabela que vale para a unidade: a própria, senão a padrão da banca, senão a padrão do código (banca sem tabela). */
export function effectiveQuoteTable(
  quoteTableId: string | null,
  tables: Map<string, QuoteTableRef>,
): AdminUnitQuoteTable {
  const own = quoteTableId ? tables.get(quoteTableId) : undefined;
  if (own) return { ...own, own: true };
  const fallback = [...tables.values()].find((t) => t.isDefault);
  if (fallback) return { ...fallback, own: false };
  const label = defaultQuotes().tableLabel;
  return { id: null, name: label, label, isDefault: true, own: false };
}

export function toUnitSettings(user: UnitSource, tables: Map<string, QuoteTableRef>): AdminUnitSettings {
  return {
    // O CHECK do banco só aceita as UFs da lista.
    region: (user.region as BrazilianUf | null) ?? null,
    unitCommissionBps: user.unitCommissionBps,
    quoteTable: effectiveQuoteTable(user.quoteTableId, tables),
    giftMilharEnabled: user.giftMilharEnabled,
    retainPrizes: user.retainPrizes,
    dailyLimitEnabled: user.dailyLimitEnabled,
    dailyLimitCents: user.dailyLimitCents,
  };
}

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
  ...UNIT_SELECT,
  referredBy: { select: { id: true, displayId: true, name: true, promoterCommissionBps: true } },
} as const;

type ListSource = Pick<User, 'id' | 'displayId' | 'name' | 'document' | 'phone' | 'status' | 'createdAt'> &
  UnitSource & {
    referredBy: Pick<User, 'id' | 'displayId' | 'name' | 'promoterCommissionBps'> | null;
  };

/** Lista: CPF e telefone completos (só dígitos), para o operador identificar o usuário. */
export function toAdminListItem(user: ListSource, tables: Map<string, QuoteTableRef>): AdminUserListItem {
  return {
    ...toUnitSettings(user, tables),
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
export function toAdminDetail(
  user: DetailSource,
  wallet: Wallet,
  lastLoginAt: Date | null,
  unit: { tables: Map<string, QuoteTableRef>; todaySpentCents: number },
): AdminUserDetail {
  return {
    ...toUnitSettings(user, unit.tables),
    todaySpentCents: unit.todaySpentCents,
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
    wallet: toPublicWallet(wallet, user.retainPrizes),
    promoterCommissionBps: user.promoterCommissionBps,
    casinoCommissionBps: user.casinoCommissionBps,
    referredBy: user.referredBy,
  };
}
