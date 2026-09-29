import 'server-only';
import { DEFAULT_HOME_LAYOUT, type HomeLayout } from '@sysjb/contracts';
import { apiRequest } from './api-client';

/**
 * Ordem e visibilidade dos blocos e cards do início, definidas pelo Gerente. Sem resposta da API, vale a ordem
 * padrão: o início abre do mesmo jeito.
 */
export async function loadHomeLayout(hostname: string): Promise<HomeLayout> {
  const res = await apiRequest<HomeLayout>(hostname, 'GET', '/v1/tenant/home-layout');
  return res.ok ? res.data : DEFAULT_HOME_LAYOUT;
}
