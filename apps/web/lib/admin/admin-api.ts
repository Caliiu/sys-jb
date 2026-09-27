import 'server-only';
import type { AdminPromoterListItem, AdminUserDetail, AdminUserListItem, Page } from '@sysjb/contracts';
import { apiRequest } from '../api-client';
import type { AdminSession } from './admin-context';
import { PROMOTERS_PAGE_SIZE, type PromotersQuery } from './promoters-query';
import { USERS_PAGE_SIZE, type UsersQuery } from './users-query';

type Caller = Pick<AdminSession, 'hostname' | 'token'>;

const call = <T>(session: Caller, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown) =>
  apiRequest<T>(session.hostname, method, path, body, { operatorToken: session.token });

/** Chamadas do painel à API, sempre em nome do operador logado (a API decide o que ele pode). */
export const adminApi = {
  listUsers(session: Caller, query: UsersQuery) {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(USERS_PAGE_SIZE) });
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    return call<Page<AdminUserListItem>>(session, 'GET', `/v1/admin/users?${params}`);
  },

  getUser: (session: Caller, id: string) =>
    call<AdminUserDetail>(session, 'GET', `/v1/admin/users/${encodeURIComponent(id)}`),

  updateUser: (session: Caller, id: string, patch: Record<string, unknown>) =>
    call<AdminUserDetail>(session, 'PATCH', `/v1/admin/users/${encodeURIComponent(id)}`, patch),

  setUserStatus: (session: Caller, id: string, status: string) =>
    call<AdminUserDetail>(session, 'PATCH', `/v1/admin/users/${encodeURIComponent(id)}/status`, { status }),

  listPromoters(session: Caller, query: PromotersQuery) {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(PROMOTERS_PAGE_SIZE) });
    if (query.search) params.set('search', query.search);
    return call<Page<AdminPromoterListItem>>(session, 'GET', `/v1/admin/promoters?${params}`);
  },

  getPromoter: (session: Caller, id: string) =>
    call<AdminPromoterListItem>(session, 'GET', `/v1/admin/promoters/${encodeURIComponent(id)}`),

  listReferrals(session: Caller, id: string, page: number) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PROMOTERS_PAGE_SIZE) });
    return call<Page<AdminUserListItem>>(
      session,
      'GET',
      `/v1/admin/promoters/${encodeURIComponent(id)}/referrals?${params}`,
    );
  },

  setPromoter: (session: Caller, id: string, commissionBps: number) =>
    call<AdminPromoterListItem>(session, 'PUT', `/v1/admin/promoters/${encodeURIComponent(id)}`, { commissionBps }),

  removePromoter: (session: Caller, id: string) =>
    call<null>(session, 'DELETE', `/v1/admin/promoters/${encodeURIComponent(id)}`),
};
