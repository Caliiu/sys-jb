'use server';

import {
  type AdminGiftMilharSettings,
  type AdminQuoteTable,
  type AdminUserDetail,
  type ApiError,
  BRAZILIAN_UFS,
  FAZENDINHA_MODE_IDS,
  FAZENDINHA_QUOTE_STAKES_CENTS,
  GIFT_MILHAR_LIMITS,
  GIFT_MILHAR_PLACEMENTS,
  MAX_COMMISSION_BPS,
  MAX_DAILY_LIMIT_CENTS,
  MAX_QUOTE_PRIZE_CENTS,
  type OperatorLoginResponse,
  QUOTE_TABLE_NAME_MAX,
  TRADITIONAL_QUOTE_MODALITIES,
  type TraditionalQuoteModality,
} from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { adminApi } from '@/lib/admin/admin-api';
import { type AdminActionResult, type AdminFailure, toAdminFailure } from '@/lib/admin/admin-result';
import { fazendinhaKey, remapQuoteFieldErrors, traditionalKey } from '@/lib/admin/quotes';
import { clearOperatorToken, readOperatorToken, writeOperatorToken } from '@/lib/admin/admin-session';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';

/**
 * Ações do painel. Server action é endpoint público: toda ação confere o formato da entrada e,
 * principalmente, a API valida a sessão do operador e a permissão do perfil a cada chamada.
 * As ações das telas antigas estão em backup/admin/app/admin/actions.ts e voltam conforme as telas forem portadas.
 */

const invalidInput: AdminFailure = { ok: false, code: 'VALIDATION_ERROR', message: 'Dados inválidos.' };
const sessionEnded: AdminFailure = {
  ok: false,
  code: 'SESSION_INVALID',
  message: 'Sessão encerrada. Entre novamente.',
};
const unavailable: AdminFailure = {
  ok: false,
  code: 'TENANT_NOT_FOUND',
  message: 'Painel indisponível neste endereço.',
};

/** Só o host do painel (admin.<domínio>) aceita estas ações; a banca do operador vem da sessão dele. */
async function currentHost(): Promise<string | null> {
  const hostname = hostnameOnly((await headers()).get('host'));
  return hostname && isAdminHost(hostname) && serviceKeyFor(hostname) ? hostname : null;
}

/** Host do painel + token do operador (cookie HttpOnly), ou a falha pronta para devolver. */
async function operatorCaller(): Promise<{ hostname: string; token: string } | AdminFailure> {
  const hostname = await currentHost();
  if (!hostname) return unavailable;
  const token = await readOperatorToken();
  return token ? { hostname, token } : sessionEnded;
}

const isFailure = (value: object): value is AdminFailure => 'ok' in value;

const loginSchema = z.strictObject({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

/** O token fica só no cookie HttpOnly; o navegador não o recebe. */
export async function adminLoginAction(input: unknown): Promise<AdminActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return invalidInput;
  const hostname = await currentHost();
  if (!hostname) return unavailable;

  const res = await apiRequest<OperatorLoginResponse>(hostname, 'POST', '/v1/admin/auth/login', parsed.data);
  if (!res.ok) return toAdminFailure(res.status, res.error);
  await writeOperatorToken(res.data.token, res.data.expiresAt);
  return { ok: true, data: null };
}

export async function adminLogoutAction(): Promise<void> {
  const hostname = await currentHost();
  const token = await readOperatorToken();
  if (hostname && token) {
    await apiRequest<null>(hostname, 'POST', '/v1/admin/auth/logout', {}, { operatorToken: token });
  }
  await clearOperatorToken();
}

/** Apostador nas opções dos filtros (ex.: Pules Registradas). */
export interface PlayerOption {
  id: string;
  displayId: number;
  name: string;
}

const PLAYER_SEARCH_RESULTS = 10;
const playerSearchSchema = z.string().trim().min(2).max(100);

/** Busca de apostadores para os filtros (nome, CPF, telefone ou ID): as primeiras correspondências. */
export async function searchPlayersAction(search: unknown): Promise<AdminActionResult<PlayerOption[]>> {
  const term = playerSearchSchema.safeParse(search);
  if (!term.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.listUsers(caller, {
    page: 1,
    pageSize: PLAYER_SEARCH_RESULTS,
    search: term.data,
    status: '',
    promoterId: '',
  });
  return res.ok
    ? { ok: true, data: res.data.items.map(({ id, displayId, name }) => ({ id, displayId, name })) }
    : toAdminFailure(res.status, res.error);
}

// ---------------------------------------------------------------------------
// Unidades: a API confere a permissão (`units.manage`, `quotes.manage`) e as regras; aqui, só o formato.
// ---------------------------------------------------------------------------

const unitIdSchema = z.uuid();
const unitSettingsSchema = z
  .strictObject({
    region: z.enum(BRAZILIAN_UFS).nullable().optional(),
    unitCommissionBps: z.number().int().min(0).max(MAX_COMMISSION_BPS).optional(),
    quoteTableId: z.uuid().nullable().optional(),
    giftMilharEnabled: z.boolean().optional(),
    retainPrizes: z.boolean().optional(),
    dailyLimitEnabled: z.boolean().optional(),
    dailyLimitCents: z.number().int().min(1).max(MAX_DAILY_LIMIT_CENTS).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0);

/** Configurações da unidade: só os campos enviados mudam. Devolve o detalhe atualizado. */
export async function updateUnitSettingsAction(
  id: unknown,
  input: unknown,
): Promise<AdminActionResult<AdminUserDetail>> {
  const unitId = unitIdSchema.safeParse(id);
  const body = unitSettingsSchema.safeParse(input);
  if (!unitId.success || !body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.updateUnitSettings(caller, unitId.data, body.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

const giftMilharSchema = z.strictObject({
  enabled: z.boolean(),
  minPuleCents: z.number().int().min(1).max(GIFT_MILHAR_LIMITS.maxMinPuleCents),
  stakeCents: z.number().int().min(1).max(GIFT_MILHAR_LIMITS.maxStakeCents),
  placement: z.string().refine((placement) => GIFT_MILHAR_PLACEMENTS.includes(placement)),
});

/** Milhar Brinde da banca (vale para as unidades com o brinde ligado). */
export async function saveGiftMilharSettingsAction(
  input: unknown,
): Promise<AdminActionResult<AdminGiftMilharSettings>> {
  const body = giftMilharSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.saveGiftMilharSettings(caller, body.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

// ---------------------------------------------------------------------------
// Cotações: a API confere `quotes.manage`, a unicidade do nome e as regras (padrão, tabela em uso).
// ---------------------------------------------------------------------------

const quoteTableIdSchema = z.uuid();
const quoteTableNameSchema = z.string().trim().min(1).max(QUOTE_TABLE_NAME_MAX);
const createQuoteTableSchema = z.strictObject({
  name: quoteTableNameSchema,
  copyFromId: z.uuid().nullable().optional(),
});
const renameQuoteTableSchema = z.strictObject({ name: quoteTableNameSchema });
const prizeCentsSchema = z.number().int().min(0).max(MAX_QUOTE_PRIZE_CENTS);
const quoteValuesSchema = z
  .strictObject({
    traditional: z
      .array(
        z.strictObject({
          modality: z.enum(
            TRADITIONAL_QUOTE_MODALITIES.map((m) => m.id) as [TraditionalQuoteModality, ...TraditionalQuoteModality[]],
          ),
          prizeCents: prizeCentsSchema,
        }),
      )
      .max(TRADITIONAL_QUOTE_MODALITIES.length),
    fazendinha: z
      .array(
        z.strictObject({
          mode: z.enum(FAZENDINHA_MODE_IDS),
          stakeCents: z
            .number()
            .int()
            .refine((stake) => FAZENDINHA_QUOTE_STAKES_CENTS.includes(stake)),
          prizeCents: prizeCentsSchema,
        }),
      )
      .max(FAZENDINHA_MODE_IDS.length * FAZENDINHA_QUOTE_STAKES_CENTS.length),
  })
  .refine((body) => body.traditional.length + body.fazendinha.length > 0);

/** Falha da API nas cotações: o 404 aqui é da tabela (a mensagem padrão fala de usuário). */
function quoteFailure(status: number, error: ApiError): AdminFailure {
  const failure = toAdminFailure(status, error);
  return failure.code === 'NOT_FOUND' ? { ...failure, message: 'Tabela de cotação não encontrada.' } : failure;
}

/** Nova tabela; com `copyFromId`, começa com os prêmios daquela tabela (senão, os padrões). */
export async function createQuoteTableAction(input: unknown): Promise<AdminActionResult<AdminQuoteTable>> {
  const body = createQuoteTableSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.createQuoteTable(caller, body.data);
  return res.ok ? { ok: true, data: res.data } : quoteFailure(res.status, res.error);
}

export async function renameQuoteTableAction(id: unknown, input: unknown): Promise<AdminActionResult<AdminQuoteTable>> {
  const tableId = quoteTableIdSchema.safeParse(id);
  const body = renameQuoteTableSchema.safeParse(input);
  if (!tableId.success || !body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.renameQuoteTable(caller, tableId.data, body.data);
  return res.ok ? { ok: true, data: res.data } : quoteFailure(res.status, res.error);
}

/** Torna a tabela a padrão da banca (vale para toda unidade sem tabela própria). */
export async function setDefaultQuoteTableAction(id: unknown): Promise<AdminActionResult<AdminQuoteTable>> {
  const tableId = quoteTableIdSchema.safeParse(id);
  if (!tableId.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setDefaultQuoteTable(caller, tableId.data);
  return res.ok ? { ok: true, data: res.data } : quoteFailure(res.status, res.error);
}

/** Exclui a tabela. A API recusa a padrão e a tabela em uso (QUOTE_TABLE_IN_USE, com a contagem em `usersCount`). */
export async function deleteQuoteTableAction(id: unknown): Promise<AdminActionResult> {
  const tableId = quoteTableIdSchema.safeParse(id);
  if (!tableId.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.deleteQuoteTable(caller, tableId.data);
  return res.ok ? { ok: true, data: null } : quoteFailure(res.status, res.error);
}

/**
 * Prêmios alterados da tabela: o Tradicional e a Fazendinha são endpoints separados na API; só chama o de cada jogo
 * com itens. Os erros de campo voltam pela chave da linha da tela ("tradicional:centena", "fazendinha:grupo:100").
 */
export async function saveQuoteValuesAction(id: unknown, input: unknown): Promise<AdminActionResult<AdminQuoteTable>> {
  const tableId = quoteTableIdSchema.safeParse(id);
  const body = quoteValuesSchema.safeParse(input);
  if (!tableId.success || !body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;
  const { traditional, fazendinha } = body.data;

  const failed = (status: number, error: ApiError, sentKeys: string[], partial: boolean): AdminFailure => {
    const failure = quoteFailure(status, error);
    const fieldErrors = failure.fieldErrors && remapQuoteFieldErrors(failure.fieldErrors, sentKeys);
    return {
      ...failure,
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(partial
        ? { message: `Os prêmios do Tradicional foram salvos; os da Fazendinha, não. ${failure.message}` }
        : {}),
    };
  };

  let table: AdminQuoteTable | null = null;
  if (traditional.length > 0) {
    const res = await adminApi.setTraditionalQuotes(caller, tableId.data, { quotes: traditional });
    if (!res.ok)
      return failed(
        res.status,
        res.error,
        traditional.map((q) => traditionalKey(q.modality)),
        false,
      );
    table = res.data;
  }
  if (fazendinha.length > 0) {
    const res = await adminApi.setFazendinhaQuotes(caller, tableId.data, { quotes: fazendinha });
    if (!res.ok) {
      const keys = fazendinha.map((q) => fazendinhaKey(q.mode, q.stakeCents));
      return failed(res.status, res.error, keys, table !== null);
    }
    table = res.data;
  }
  return { ok: true, data: table! };
}
