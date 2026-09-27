'use server';

import type { ApiError, PublicProfile } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { hostnameOnly, serviceKeyFor } from '@/lib/server-env';
import { readSessionToken } from '@/lib/session';

/**
 * Ações do perfil do próprio usuário. Server action é endpoint público: cada uma confere o formato da
 * entrada e usa a sessão do cookie HttpOnly (o token nunca passa pelo navegador). Quem decide de verdade
 * é a API, que só altera a conta da sessão.
 */

export interface ProfileFailure {
  ok: false;
  code: ApiError['code'];
  message: string;
  /** campo -> mensagem (validação e conflitos). */
  fieldErrors?: Record<string, string>;
}

export type ProfileActionResult<T = null> = { ok: true; data: T } | ProfileFailure;

const invalidInput: ProfileFailure = { ok: false, code: 'VALIDATION_ERROR', message: 'Dados inválidos.' };
const sessionEnded: ProfileFailure = {
  ok: false,
  code: 'SESSION_INVALID',
  message: 'Sessão encerrada. Entre novamente.',
};
const unavailable: ProfileFailure = {
  ok: false,
  code: 'TENANT_NOT_FOUND',
  message: 'Banca indisponível neste endereço.',
};

/** Mensagem pronta para a tela: sem detalhe técnico, com o erro de cada campo quando a API indica. */
function toFailure(status: number, error: ApiError): ProfileFailure {
  const fieldErrors = error.details?.length
    ? Object.fromEntries(error.details.map((detail) => [detail.field, detail.message]))
    : undefined;
  const failure = (message: string): ProfileFailure => ({
    ok: false,
    code: error.code,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
  });

  if (status >= 500 || error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN') {
    return failure('Serviço indisponível. Tente novamente em instantes.');
  }
  switch (error.code) {
    case 'SESSION_INVALID':
      return failure('Sessão encerrada. Entre novamente.');
    case 'VALIDATION_ERROR':
      return failure('Corrija os campos destacados.');
    default:
      return failure(error.message);
  }
}

async function caller(): Promise<{ hostname: string; sessionToken: string } | ProfileFailure> {
  const hostname = hostnameOnly((await headers()).get('host'));
  if (!hostname || !serviceKeyFor(hostname)) return unavailable;
  const sessionToken = await readSessionToken();
  return sessionToken ? { hostname, sessionToken } : sessionEnded;
}

const isFailure = (value: object): value is ProfileFailure => 'ok' in value;

// Só o formato: as regras de e-mail e telefone são da API (uma fonte de verdade).
const updateSchema = z
  .strictObject({
    email: z.string().max(254).nullable().optional(),
    phone: z.string().max(32).optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined));

const passwordSchema = z.strictObject({ password: z.string().min(1).max(128) });

/** Altera e-mail e/ou telefone do usuário logado. */
export async function updateProfileAction(input: unknown): Promise<ProfileActionResult<PublicProfile>> {
  const body = updateSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const session = await caller();
  if (isFailure(session)) return session;

  const res = await apiRequest<PublicProfile>(session.hostname, 'PATCH', '/v1/me', body.data, {
    sessionToken: session.sessionToken,
  });
  return res.ok ? { ok: true, data: res.data } : toFailure(res.status, res.error);
}

/** Troca a senha do usuário logado. A API encerra as outras sessões; esta continua. */
export async function changePasswordAction(input: unknown): Promise<ProfileActionResult> {
  const body = passwordSchema.safeParse(input);
  if (!body.success) return invalidInput;
  const session = await caller();
  if (isFailure(session)) return session;

  const res = await apiRequest<null>(session.hostname, 'POST', '/v1/me/password', body.data, {
    sessionToken: session.sessionToken,
  });
  return res.ok ? { ok: true, data: null } : toFailure(res.status, res.error);
}
