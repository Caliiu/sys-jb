'use server';

import type {
  AdminCommissionSettings,
  AdminDrawsResponse,
  AdminBranding,
  HomeLayout,
  AdminMural,
  AdminPromoterListItem,
  PublicQuotes,
  SetFazendinhaQuotesRequest,
  SetTraditionalQuotesRequest,
  AdminUserDetail,
  OperatorLoginResponse,
} from '@sysjb/contracts';
import {
  DRAW_EXCEPTION_KINDS,
  DRAW_GAMES,
  DRAW_LIMITS,
  MAX_COMMISSION_BPS,
  MAX_WALLET_CREDIT_CENTS,
  MURAL_DISPLAY_MODES,
  MURAL_LIMITS,
  BRANDING_LIMITS,
  HOME_BLOCK_IDS,
  MIN_CASINO_COMMISSION_BPS,
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
const casinoCommissionSchema = z.number().int().min(MIN_CASINO_COMMISSION_BPS).max(MAX_COMMISSION_BPS);

/**
 * Promove o usuário a promotor ou altera as comissões (centésimos de %): a de Loterias e a de cassino (sobre o GGR
 * mensal). A API confere a permissão.
 */
export async function setPromoterAction(
  userId: unknown,
  commissionBps: unknown,
  casinoCommissionBps: unknown,
): Promise<AdminActionResult<AdminPromoterListItem>> {
  const id = userIdSchema.safeParse(userId);
  const bps = commissionSchema.safeParse(commissionBps);
  const casino = casinoCommissionSchema.safeParse(casinoCommissionBps);
  if (!id.success || !bps.success || !casino.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.setPromoter(caller, id.data, {
    commissionBps: bps.data,
    casinoCommissionBps: casino.data,
  });
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
    code: z.string().max(DRAW_LIMITS.codeMax + 10),
    drawTime: z.string().max(5),
    closesAt: z.string().max(5),
    weekdays: z.array(z.number().int()).max(7),
    games: z.array(z.enum(DRAW_GAMES)).max(DRAW_GAMES.length),
    result: z.strictObject({ lottery: z.string().max(4), extraction: z.number().int() }).nullable(),
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

// Mural: só o formato; datas, conteúdo da imagem e permissão são da API.
const muralIdSchema = z.uuid();
const saveMuralSchema = z.strictObject({
  id: muralIdSchema.optional(),
  name: z.string().max(MURAL_LIMITS.nameMax + 10),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  displayMode: z.enum(MURAL_DISPLAY_MODES),
});

const muralFailure = (status: number, error: Parameters<typeof toAdminFailure>[1]): AdminFailure =>
  error.code === 'NOT_FOUND'
    ? { ok: false, code: 'NOT_FOUND', message: 'Mural não encontrado. Atualize a página.' }
    : toAdminFailure(status, error);

/**
 * Cadastra (sem id) ou altera um mural. Vem como FormData por causa da imagem (campo `image`, opcional na
 * alteração: sem ela, mantém a atual). A API confere a permissão, as datas e o conteúdo da imagem, e audita.
 */
export async function saveMuralAction(form: unknown): Promise<AdminActionResult<AdminMural[]>> {
  if (!(form instanceof FormData)) return invalidInput;
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value : undefined;
  };
  const body = saveMuralSchema.safeParse({
    ...(text('id') ? { id: text('id') } : {}),
    name: text('name'),
    startsOn: text('startsOn'),
    endsOn: text('endsOn'),
    displayMode: text('displayMode'),
  });
  if (!body.success) return invalidInput;

  const file = form.get('image');
  let image: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MURAL_LIMITS.imageMaxBytes) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Corrija os campos destacados.',
        fieldErrors: { image: 'Imagem acima de 3 MB.' },
      };
    }
    image = Buffer.from(await file.arrayBuffer()).toString('base64');
  }

  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const { id, ...mural } = body.data;
  const request = { ...mural, ...(image ? { image } : {}) };
  const res = id ? await adminApi.updateMural(caller, id, request) : await adminApi.createMural(caller, request);
  return res.ok ? { ok: true, data: res.data } : muralFailure(res.status, res.error);
}

export async function deleteMuralAction(id: unknown): Promise<AdminActionResult<AdminMural[]>> {
  const muralId = muralIdSchema.safeParse(id);
  if (!muralId.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.deleteMural(caller, muralId.data);
  return res.ok ? { ok: true, data: res.data } : muralFailure(res.status, res.error);
}

// Identidade visual: só o formato; regras (tamanhos, cores, conteúdo da logo) e permissão são da API.
const saveBrandingSchema = z.strictObject({
  name: z.string().max(BRANDING_LIMITS.nameMax + 10),
  primaryColor: z.string().max(7),
  secondaryColor: z.string().max(7),
  inviteBarText: z.string().max(BRANDING_LIMITS.inviteBarMax + 10),
  inviteBarEnabled: z.enum(['0', '1']).transform((value) => value === '1'),
  supportPhone: z.string().max(32),
});

/**
 * Altera a identidade visual da banca do operador. FormData por causa da logo (campo `logo`, opcional;
 * `removeLogo=1` volta à logo padrão). A API confere a permissão e o conteúdo da logo, e audita.
 */
export async function saveBrandingAction(form: unknown): Promise<AdminActionResult<AdminBranding>> {
  if (!(form instanceof FormData)) return invalidInput;
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' ? value : undefined;
  };
  const body = saveBrandingSchema.safeParse({
    name: text('name'),
    primaryColor: text('primaryColor'),
    secondaryColor: text('secondaryColor'),
    inviteBarText: text('inviteBarText'),
    inviteBarEnabled: text('inviteBarEnabled'),
    supportPhone: text('supportPhone') ?? '',
  });
  if (!body.success) return invalidInput;

  const file = form.get('logo');
  let logo: string | null | undefined = text('removeLogo') === '1' ? null : undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > BRANDING_LIMITS.logoMaxBytes) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Corrija os campos destacados.',
        fieldErrors: { logo: 'Logo acima de 1 MB.' },
      };
    }
    logo = Buffer.from(await file.arrayBuffer()).toString('base64');
  }

  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.saveBranding(caller, { ...body.data, ...(logo !== undefined ? { logo } : {}) });
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

// Cards do início: só o formato; a API confere que o layout está completo (todos os blocos e cards) e a permissão.
const homeLayoutSchema = z.strictObject({
  blocks: z
    .array(
      z.strictObject({
        id: z.enum(HOME_BLOCK_IDS),
        visible: z.boolean(),
        cards: z.array(z.strictObject({ id: z.string().max(40), visible: z.boolean() })).max(10),
      }),
    )
    .max(HOME_BLOCK_IDS.length),
});

/** Salva a ordem e a visibilidade dos blocos e cards do início. A API valida e audita. */
export async function saveHomeLayoutAction(input: unknown): Promise<AdminActionResult<HomeLayout>> {
  const body = homeLayoutSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const caller = await operatorCaller();
  if (isFailure(caller)) return caller;

  const res = await adminApi.saveHomeLayout(caller, body.data);
  return res.ok ? { ok: true, data: res.data } : toAdminFailure(res.status, res.error);
}

/** Apostador escolhido nos filtros (só o que a tela mostra: nada de CPF ou telefone). */
export interface PlayerOption {
  id: string;
  displayId: number;
  name: string;
}

const PLAYER_SEARCH_RESULTS = 10;
const playerSearchSchema = z.string().trim().min(2).max(100);

/** Busca de apostadores para o filtro (nome, CPF, telefone ou ID): as primeiras correspondências. */
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
