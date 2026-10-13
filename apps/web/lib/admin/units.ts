import {
  type AdminUnitSettings,
  BRAZILIAN_UFS,
  type BrazilianUf,
  MAX_DAILY_LIMIT_CENTS,
  type UpdateUnitSettingsRequest,
} from '@sysjb/contracts';
import { formatBrl } from '../currency';
import { ADMIN_ROUTES } from './admin-routes';
import { commissionInputValue, parseReferralRate } from './commission';
import { DEFAULT_PAGE_SIZE, parsePageSize } from './page-size';
import type { UsersQuery } from './users-query';

const SEARCH_MAX = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lista de Unidades: a mesma lista de usuários da API, só com busca e paginação. */
export interface UnitsQuery {
  page: number;
  pageSize: number;
  search: string;
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Lê a query da URL com tolerância: valor inválido vira o padrão, nunca erro (a URL é digitável). */
export function parseUnitsQuery(raw: Record<string, string | string[] | undefined>): UnitsQuery {
  const page = Number(first(raw.page));
  return {
    page: Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1,
    pageSize: parsePageSize(raw.pageSize),
    search: (first(raw.search) ?? '').trim().slice(0, SEARCH_MAX),
  };
}

/** Unidade aberta na gaveta (?unidade=<id>); null se ausente ou inválida. */
export function parseUnitKey(raw: string | string[] | undefined): string | null {
  const value = first(raw) ?? '';
  return UUID.test(value) ? value.toLowerCase() : null;
}

/** A consulta da API de usuários para a lista de Unidades (sem filtro de situação nem de promotor). */
export const unitsApiQuery = (query: UnitsQuery): UsersQuery => ({ ...query, status: '', promoterId: '' });

/** Endereço da lista (omite o que é padrão) e, com `unitId`, a gaveta da unidade aberta. */
export function unitsHref(query: Partial<UnitsQuery>, unitId?: string | null): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.pageSize && query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  if (query.page && query.page > 1) params.set('page', String(query.page));
  if (unitId) params.set('unidade', unitId);
  const qs = params.toString();
  return qs ? `${ADMIN_ROUTES.units}?${qs}` : ADMIN_ROUTES.units;
}

export const isBrazilianUf = (value: string): value is BrazilianUf =>
  (BRAZILIAN_UFS as readonly string[]).includes(value);

/** Tabela própria da unidade; null = segue a padrão da banca. */
export const unitQuoteTableId = (settings: AdminUnitSettings): string | null =>
  settings.quoteTable.own ? settings.quoteTable.id : null;

/** "R$ 500,00" ou "Sem limite" (desligado; o valor pode continuar gravado para quando religar). */
export const dailyLimitText = (settings: Pick<AdminUnitSettings, 'dailyLimitEnabled' | 'dailyLimitCents'>) =>
  settings.dailyLimitEnabled && settings.dailyLimitCents !== null ? formatBrl(settings.dailyLimitCents) : 'Sem limite';

export const UNIT_COMMISSION_HELP = 'Entre 0% e 100%, com até 2 casas decimais (0% = sem comissão).';

/** Campos do formulário da unidade, como a tela edita (comissão em texto, limite em centavos). */
export interface UnitSettingsForm {
  region: BrazilianUf | null;
  commission: string;
  quoteTableId: string | null;
  giftMilharEnabled: boolean;
  retainPrizes: boolean;
  dailyLimitEnabled: boolean;
  dailyLimitCents: number | null;
}

export function unitSettingsForm(settings: AdminUnitSettings): UnitSettingsForm {
  return {
    region: settings.region,
    commission: commissionInputValue(settings.unitCommissionBps),
    quoteTableId: unitQuoteTableId(settings),
    giftMilharEnabled: settings.giftMilharEnabled,
    retainPrizes: settings.retainPrizes,
    dailyLimitEnabled: settings.dailyLimitEnabled,
    dailyLimitCents: settings.dailyLimitCents,
  };
}

export type UnitSettingsPatch =
  { ok: true; patch: UpdateUnitSettingsRequest } | { ok: false; fieldErrors: Record<string, string> };

/**
 * Só o que mudou (a API exige pelo menos um campo). O valor do limite só vai com o limite ligado: desligado, o gravado
 * fica para quando religar.
 */
export function unitSettingsPatch(settings: AdminUnitSettings, form: UnitSettingsForm): UnitSettingsPatch {
  const fieldErrors: Record<string, string> = {};
  const patch: UpdateUnitSettingsRequest = {};

  if (form.region !== settings.region) patch.region = form.region;

  const bps = parseReferralRate(form.commission);
  if (bps === null) fieldErrors.unitCommissionBps = UNIT_COMMISSION_HELP;
  else if (bps !== settings.unitCommissionBps) patch.unitCommissionBps = bps;

  if (form.quoteTableId !== unitQuoteTableId(settings)) patch.quoteTableId = form.quoteTableId;
  if (form.giftMilharEnabled !== settings.giftMilharEnabled) patch.giftMilharEnabled = form.giftMilharEnabled;
  if (form.retainPrizes !== settings.retainPrizes) patch.retainPrizes = form.retainPrizes;
  if (form.dailyLimitEnabled !== settings.dailyLimitEnabled) patch.dailyLimitEnabled = form.dailyLimitEnabled;

  if (form.dailyLimitEnabled) {
    const cents = form.dailyLimitCents;
    if (!cents) fieldErrors.dailyLimitCents = 'Informe o limite diário para ligá-lo.';
    else if (cents > MAX_DAILY_LIMIT_CENTS) {
      fieldErrors.dailyLimitCents = `O limite vai até ${formatBrl(MAX_DAILY_LIMIT_CENTS)}.`;
    } else if (cents !== settings.dailyLimitCents) patch.dailyLimitCents = cents;
  }

  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, patch };
}
