'use server';

import { type PublicTenant, type SupportContact, supportMessage } from '@sysjb/contracts';
import { headers } from 'next/headers';
import { apiRequest } from '@/lib/api-client';
import { hostnameOnly, isAdminHost, serviceKeyFor } from '@/lib/server-env';
import { readSessionToken } from '@/lib/session';

/**
 * WhatsApp do atendimento para o botão "Suporte"/"Atendimento", com a mensagem inicial. Logado: a API escolhe
 * (promotor vinculado ou a banca) e monta a mensagem com o código de unidade. Sem sessão (login e cadastro): o
 * número da banca, sem código. phone null = sem atendimento.
 */
export async function supportContactAction(): Promise<SupportContact> {
  const hostname = hostnameOnly((await headers()).get('host'));
  const visitor = supportMessage({ promoterName: null, unitCode: null });
  if (!hostname || isAdminHost(hostname) || !serviceKeyFor(hostname)) return { phone: null, message: visitor };

  const sessionToken = await readSessionToken();
  if (sessionToken) {
    const res = await apiRequest<SupportContact>(hostname, 'GET', '/v1/me/support', undefined, { sessionToken });
    if (res.ok) return { phone: res.data.phone, message: res.data.message };
    // Sessão expirada: segue como visitante (número da banca). Outras falhas: sem número.
    if (res.error.code !== 'SESSION_INVALID') return { phone: null, message: visitor };
  }
  const tenant = await apiRequest<PublicTenant>(hostname, 'GET', '/v1/tenant');
  return { phone: tenant.ok ? tenant.data.supportPhone : null, message: visitor };
}
