import 'server-only';
import type {
  AdminAuditEntry,
  AdminCommissionClosing,
  AdminCommissionMonth,
  AdminCommissionSettings,
  AdminDrawsResponse,
  AdminBranding,
  HomeLayout,
  AdminMural,
  AdminPromoterListItem,
  AdminUserDetail,
  AdminUserListItem,
  AdminWalletCreditRequest,
  CreateDrawExceptionRequest,
  Page,
  PublicQuotes,
  SaveDrawRequest,
  SaveBrandingRequest,
  SaveMuralRequest,
  SetFazendinhaQuotesRequest,
  SetTraditionalQuotesRequest,
} from '@sysjb/contracts';
import { apiRequest, apiRequestImage } from '../api-client';
import type { AdminSession } from './admin-context';
import { AUDIT_PAGE_SIZE, type AuditQuery } from './audit-query';
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

  creditWallet: (session: Caller, id: string, body: AdminWalletCreditRequest) =>
    call<AdminUserDetail>(session, 'POST', `/v1/admin/users/${encodeURIComponent(id)}/wallet/credits`, body),

  getCommissionSettings: (session: Caller) =>
    call<AdminCommissionSettings>(session, 'GET', '/v1/admin/commissions/settings'),

  setCommissionSettings: (session: Caller, referralCommissionBps: number) =>
    call<AdminCommissionSettings>(session, 'PUT', '/v1/admin/commissions/settings', { referralCommissionBps }),

  getCommissionMonth: (session: Caller, month: string) =>
    call<AdminCommissionMonth>(session, 'GET', `/v1/admin/commissions/months/${encodeURIComponent(month)}`),

  closeCommissionMonth: (session: Caller, month: string) =>
    call<AdminCommissionMonth>(session, 'POST', `/v1/admin/commissions/months/${encodeURIComponent(month)}/close`, {}),

  listCommissionClosings: (session: Caller) =>
    call<AdminCommissionClosing[]>(session, 'GET', '/v1/admin/commissions/closings'),

  getQuotes: (session: Caller) => call<PublicQuotes>(session, 'GET', '/v1/admin/quotes'),

  setTraditionalQuotes: (session: Caller, body: SetTraditionalQuotesRequest) =>
    call<PublicQuotes>(session, 'PUT', '/v1/admin/quotes/tradicional', body),

  setFazendinhaQuotes: (session: Caller, body: SetFazendinhaQuotesRequest) =>
    call<PublicQuotes>(session, 'PUT', '/v1/admin/quotes/fazendinha', body),

  listDraws: (session: Caller) => call<AdminDrawsResponse>(session, 'GET', '/v1/admin/draws'),

  createDraw: (session: Caller, body: SaveDrawRequest) =>
    call<AdminDrawsResponse>(session, 'POST', '/v1/admin/draws', body),

  updateDraw: (session: Caller, id: string, body: SaveDrawRequest) =>
    call<AdminDrawsResponse>(session, 'PUT', `/v1/admin/draws/${encodeURIComponent(id)}`, body),

  deleteDraw: (session: Caller, id: string) =>
    call<AdminDrawsResponse>(session, 'DELETE', `/v1/admin/draws/${encodeURIComponent(id)}`),

  createDrawException: (session: Caller, body: CreateDrawExceptionRequest) =>
    call<AdminDrawsResponse>(session, 'POST', '/v1/admin/draws/exceptions', body),

  deleteDrawException: (session: Caller, id: string) =>
    call<AdminDrawsResponse>(session, 'DELETE', `/v1/admin/draws/exceptions/${encodeURIComponent(id)}`),

  listMurals: (session: Caller) => call<AdminMural[]>(session, 'GET', '/v1/admin/murals'),

  createMural: (session: Caller, body: SaveMuralRequest) =>
    call<AdminMural[]>(session, 'POST', '/v1/admin/murals', body),

  updateMural: (session: Caller, id: string, body: SaveMuralRequest) =>
    call<AdminMural[]>(session, 'PUT', `/v1/admin/murals/${encodeURIComponent(id)}`, body),

  deleteMural: (session: Caller, id: string) =>
    call<AdminMural[]>(session, 'DELETE', `/v1/admin/murals/${encodeURIComponent(id)}`),

  muralImage: (session: Caller, id: string) =>
    apiRequestImage(session.hostname, `/v1/admin/murals/${encodeURIComponent(id)}/image`, {
      operatorToken: session.token,
    }),

  getBranding: (session: Caller) => call<AdminBranding>(session, 'GET', '/v1/admin/branding'),

  saveBranding: (session: Caller, body: SaveBrandingRequest) =>
    call<AdminBranding>(session, 'PUT', '/v1/admin/branding', body),

  getHomeLayout: (session: Caller) => call<HomeLayout>(session, 'GET', '/v1/admin/branding/home'),

  saveHomeLayout: (session: Caller, body: HomeLayout) =>
    call<HomeLayout>(session, 'PUT', '/v1/admin/branding/home', body),

  brandingLogo: (session: Caller) =>
    apiRequestImage(session.hostname, '/v1/admin/branding/logo', { operatorToken: session.token }),

  listAudit(session: Caller, query: AuditQuery) {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(AUDIT_PAGE_SIZE) });
    if (query.action) params.set('action', query.action);
    if (query.userId) params.set('userId', query.userId);
    return call<Page<AdminAuditEntry>>(session, 'GET', `/v1/admin/audit?${params}`);
  },
};
