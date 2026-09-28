'use server';

import type {
  AdminCommissionMonth,
  AdminCommissionSettings,
  AdminDrawsResponse,
  AdminPromoterListItem,
  PublicQuotes,
  SetFazendinhaQuotesRequest,
  SetTraditionalQuotesRequest,
  AdminUserDetail,
  AdminUserListItem,
  OperatorLoginResponse,
} from '@sysjb/contracts';
import {
  DRAW_EXCEPTION_KINDS,
  DRAW_GAMES,
  DRAW_LIMITS,
  MAX_COMMISSION_BPS,
  MAX_WALLET_CREDIT_CENTS,
  MIN_COMMISSION_BPS,
  USER_STATUSES,
  WALLET_CREDIT_BUCKETS,
} from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { adminApi } from '@/lib/admin/admin-api';
import { clearOperatorToken, readOperatorToken, writeOperatorToken } from '@/lib/admin/admin-session';
import { type AdminActionResult, type AdminFailure, toAdminFailure } from '@/lib/admin/admin-result';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';

/**
 * Ações do painel. Server action é endpoint público: toda ação confere o formato da entrada e,
 * principalmente, a API valida a sessão do operador e a permissão do perfil a cada chamada.
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

const userIdSchema = z.uuid();

// Só o formato: as regras de CPF, telefone e e-mail são da API (uma fonte de verdade).
const profileSchema = z
  .strictObject({
    name: z.string().max(200).optional(),
    email: z.string().max(254).nullable().optional(),
    phone: z.string().max(32).optional(),
    document: z.string().max(32).optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined));

export async function updateUserAction(userId: unknown, patch: unknown): Promise<AdminActionResult<AdminUserDetail>> {
  const id = userIdSchema.safeParse(userId);
  const body = profileSchema.safeParse(patch);
  if (!id.success || !body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.updateUser(caller, id.data, body.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

export async function setUserStatusAction(
  userId: unknown,
  status: unknown,
): Promise<AdminActionResult<AdminUserDetail>> {
  const id = userIdSchema.safeParse(userId);
  const next = z.enum(USER_STATUSES).safeParse(status);
  if (!id.success || !next.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setUserStatus(caller, id.data, next.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

const commissionSchema = z.number().int().min(MIN_COMMISSION_BPS).max(MAX_COMMISSION_BPS);

/** Promove o usuário a promotor ou altera a comissão (centésimos de %). A API confere a permissão. */
export async function setPromoterAction(
  userId: unknown,
  commissionBps: unknown,
): Promise<AdminActionResult<AdminPromoterListItem>> {
  const id = userIdSchema.safeParse(userId);
  const bps = commissionSchema.safeParse(commissionBps);
  if (!id.success || !bps.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setPromoter(caller, id.data, bps.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

export async function removePromoterAction(userId: unknown): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  if (!id.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.removePromoter(caller, id.data);
  return res.ok ? { ok: true, data: null } : toAdminFailure(res.status, res.error);
}

const walletCreditSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  bucket: z.enum(WALLET_CREDIT_BUCKETS),
  amountCents: z.number().int().min(1).max(MAX_WALLET_CREDIT_CENTS),
  note: z.string().trim().min(3).max(200),
});

/** Adiciona saldo, bônus ou disponível em games. A API (e o banco) conferem perfil, limite e a chave. */
export async function creditWalletAction(userId: unknown, input: unknown): Promise<AdminActionResult<AdminUserDetail>> {
  const id = userIdSchema.safeParse(userId);
  const body = walletCreditSchema.safeParse(input);
  if (!id.success || !body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.creditWallet(caller, id.data, body.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

/** Altera a % do "Indique e ganhe" (0% a 100%, em centésimos). A API confere a permissão e audita. */
export async function setReferralRateAction(bps: unknown): Promise<AdminActionResult<AdminCommissionSettings>> {
  const rate = z.number().int().min(0).max(MAX_COMMISSION_BPS).safeParse(bps);
  if (!rate.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setCommissionSettings(caller, rate.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

/** Fecha o mês (YYYY-MM): paga as comissões no Saldo. Só uma vez por mês; a API e o banco conferem. */
export async function closeCommissionMonthAction(month: unknown): Promise<AdminActionResult<AdminCommissionMonth>> {
  const value = z
    .string()
    .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
    .safeParse(month);
  if (!value.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.closeCommissionMonth(caller, value.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

// Só o formato; catálogo, completude e limites são conferidos pela API.
const quoteTableSchema = z.strictObject({
  quotes: z
    .array(
      z.strictObject({
        modality: z.string().max(40).optional(),
        mode: z.enum(['grupo', 'dezena', 'centena']).optional(),
        stakeCents: z.number().int().optional(),
        prizeCents: z.number().int().min(0),
      }),
    )
    .max(100),
});

/** Salva a tabela do Tradicional (inteira). A API confere a permissão, grava e audita o que mudou. */
export async function saveTraditionalQuotesAction(input: unknown): Promise<AdminActionResult<PublicQuotes>> {
  const body = quoteTableSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setTraditionalQuotes(caller, body.data as SetTraditionalQuotesRequest);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

/** Salva a tabela da Fazendinha (inteira: modalidades × valores). */
export async function saveFazendinhaQuotesAction(input: unknown): Promise<AdminActionResult<PublicQuotes>> {
  const body = quoteTableSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setFazendinhaQuotes(caller, body.data as SetFazendinhaQuotesRequest);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

// Sorteios: só o formato; horários, dias, travas de apostas vendidas e permissão são da API.
const drawIdSchema = z.uuid();
const saveDrawSchema = z.strictObject({
  id: drawIdSchema.optional(),
  draw: z.strictObject({
    group: z.string().max(DRAW_LIMITS.groupMax + 10),
    name: z.string().max(DRAW_LIMITS.nameMax + 10),
    drawTime: z.string().max(5),
    closesAt: z.string().max(5),
    weekdays: z.array(z.number().int()).max(7),
    games: z.array(z.enum(DRAW_GAMES)).max(DRAW_GAMES.length),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(DRAW_LIMITS.sortOrderMax),
  }),
});
const drawExceptionSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  drawId: drawIdSchema.nullable(),
  kind: z.enum(DRAW_EXCEPTION_KINDS),
  note: z
    .string()
    .max(DRAW_LIMITS.noteMax + 10)
    .optional(),
});

/** Cadastra (sem id) ou altera um sorteio. A API confere a permissão e as apostas vendidas, e audita. */
export async function saveDrawAction(input: unknown): Promise<AdminActionResult<AdminDrawsResponse>> {
  const body = saveDrawSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const { id, draw } = body.data;
  const res = id ? await adminApi.updateDraw(caller, id, draw) : await adminApi.createDraw(caller, draw);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

export async function deleteDrawAction(id: unknown): Promise<AdminActionResult<AdminDrawsResponse>> {
  const drawId = drawIdSchema.safeParse(id);
  if (!drawId.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.deleteDraw(caller, drawId.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

export async function addDrawExceptionAction(input: unknown): Promise<AdminActionResult<AdminDrawsResponse>> {
  const body = drawExceptionSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.createDrawException(caller, body.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

export async function removeDrawExceptionAction(id: unknown): Promise<AdminActionResult<AdminDrawsResponse>> {
  const exceptionId = drawIdSchema.safeParse(id);
  if (!exceptionId.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.deleteDrawException(caller, exceptionId.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

const SEARCH_RESULTS = 5;
const searchSchema = z.string().trim().min(2).max(100);

/** Busca de usuários para escolher quem vira promotor: só as primeiras correspondências. */
export async function searchUsersAction(search: unknown): Promise<AdminActionResult<AdminUserListItem[]>> {
  const term = searchSchema.safeParse(search);
  if (!term.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.listUsers(caller, { page: 1, search: term.data, status: '' });
  return res.ok ? { ok: true, data: res.data.items.slice(0, SEARCH_RESULTS) } : toAdminFailure(res.status, res.error);
}
