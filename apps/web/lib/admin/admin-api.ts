import 'server-only';
import type {
  AdminAuditEntry,
  AdminOperator,
  OperatorPasswordResponse,
  SaveOperatorRequest,
  AdminCommissionSettings,
  AdminDepositList,
  AdminDepositListItem,
  AdminWithdrawalList,
  CrmInactiveList,
  CrmNeverDepositedList,
  AdminWithdrawalListItem,
  WithdrawalSettings,
  AdminPaymentSettings,
  PaymentGatewayId,
  PaymentGatewayTestResult,
  SavePaymentGatewayRequest,
  AdminDrawsResponse,
  AdminBranding,
  AdminCasinoClosing,
  DepositBonusSettings,
  AdminCasinoGeneralReport,
  CasinoClosingPayRequest,
  CasinoClosingPayResult,
  HomeLayout,
  AdminMural,
  AdminPromoterListItem,
  AdminPromoterOption,
  AdminTicketDrawOption,
  AdminGeneralReport,
  AdminOperationSummary,
  AdminPlayerStatement,
  AdminPrizeList,
  AdminSalesByDrawReport,
  AdminTicketList,
  AdminTicketListItem,
  AdminUserDetail,
  AdminUserListItem,
  AdminWalletCreditRequest,
  CreateDrawExceptionRequest,
  Page,
  PublicQuotes,
  SaveDrawRequest,
  SaveBrandingRequest,
  SaveMuralRequest,
  SetPromoterRequest,
  SetFazendinhaQuotesRequest,
  SetTraditionalQuotesRequest,
} from '@sysjb/contracts';
import { apiRequest, apiRequestImage } from '../api-client';
import type { AdminSession } from './admin-context';
import type { AuditQuery } from './audit-query';
import type { CasinoGeneralQuery } from './casino-general-query';
import { type CrmQuery, crmApiQuery } from './crm-query';
import type { DepositsApiQuery, WithdrawalsApiQuery } from './wallet-movements-query';
import type { GeneralReportQuery } from './general-report-query';
import type { OperationSummaryQuery } from './operation-summary-query';
import type { PrizesQuery } from './prizes-query';
import type { SalesByDrawQuery } from './sales-by-draw-query';
import type { StatementQuery } from './statement-query';
import type { TicketsQuery } from './tickets-query';
import type { UsersQuery } from './users-query';

type Caller = Pick<AdminSession, 'hostname' | 'token'>;

const call = <T>(session: Caller, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown) =>
  apiRequest<T>(session.hostname, method, path, body, { operatorToken: session.token });

/** Chamadas do painel à API, sempre em nome do operador logado (a API decide o que ele pode). */
export const adminApi = {
  listUsers(session: Caller, query: UsersQuery) {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', query.status);
    if (query.promoterId) params.set('promoterId', query.promoterId);
    return call<Page<AdminUserListItem>>(session, 'GET', `/v1/admin/users?${params}`);
  },

  /** Bilhetes vendidos no dia, com os filtros da tela. */
  listTickets(session: Caller, query: TicketsQuery) {
    const params = new URLSearchParams({
      date: query.date,
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.promoterId) params.set('promoterId', query.promoterId);
    if (query.userId) params.set('userId', query.userId);
    if (query.drawId) params.set('drawId', query.drawId);
    return call<AdminTicketList>(session, 'GET', `/v1/admin/tickets?${params}`);
  },

  /** Bilhete pelo número (um por jogo: Loterias e Fazendinha têm numerações próprias). */
  searchTicket: (session: Caller, puleNumber: number) =>
    call<AdminTicketListItem[]>(session, 'GET', `/v1/admin/tickets/${encodeURIComponent(String(puleNumber))}`),

  /** Sorteios da banca para o filtro "Horário (Extração)". */
  listPrizes(session: Caller, query: PrizesQuery) {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.promoterId) params.set('promoterId', query.promoterId);
    if (query.userId) params.set('userId', query.userId);
    if (query.drawId) params.set('drawId', query.drawId);
    if (query.minPrizeCents !== null) params.set('minPrizeCents', String(query.minPrizeCents));
    if (query.maxPrizeCents !== null) params.set('maxPrizeCents', String(query.maxPrizeCents));
    return call<AdminPrizeList>(session, 'GET', `/v1/admin/prizes?${params}`);
  },
  playerStatement(session: Caller, query: StatementQuery) {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    return call<AdminPlayerStatement>(
      session,
      'GET',
      `/v1/admin/users/${encodeURIComponent(query.userId)}/statement?${params}`,
    );
  },
  salesByDraw(session: Caller, query: SalesByDrawQuery) {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.promoterId) params.set('promoterId', query.promoterId);
    if (query.userId) params.set('userId', query.userId);
    return call<AdminSalesByDrawReport>(session, 'GET', `/v1/admin/reports/sales-by-draw?${params}`);
  },
  casinoGeneral(session: Caller, query: CasinoGeneralQuery) {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.promoterId) params.set('promoterId', query.promoterId);
    if (query.userId) params.set('userId', query.userId);
    if (query.type) params.set('type', query.type);
    return call<AdminCasinoGeneralReport>(session, 'GET', `/v1/admin/reports/casino/general?${params}`);
  },
  /** Fechamento cassino: os cards do mês anterior e do atual e, com `month` (YYYY-MM), o detalhamento do mês. */
  casinoClosing: (session: Caller, month: string | null) =>
    call<AdminCasinoClosing>(
      session,
      'GET',
      `/v1/admin/reports/casino/closing${month ? `?${new URLSearchParams({ month })}` : ''}`,
    ),
  payCasinoClosing: (session: Caller, body: CasinoClosingPayRequest) =>
    call<CasinoClosingPayResult>(session, 'POST', '/v1/admin/reports/casino/closing/pay', body),
  /** CRM: Apostadores inativos ou Nunca depositantes, com os filtros da tela. */
  crmList<L extends CrmQuery['list']>(session: Caller, query: CrmQuery & { list: L }) {
    const params = new URLSearchParams(
      Object.entries(crmApiQuery(query)).map(([key, value]) => [key, String(value)] as [string, string]),
    );
    const path = query.list === 'inactive' ? 'inactive' : 'never-deposited';
    return call<L extends 'inactive' ? CrmInactiveList : CrmNeverDepositedList>(
      session,
      'GET',
      `/v1/admin/crm/${path}?${params}`,
    );
  },
  generalReport(session: Caller, query: GeneralReportQuery) {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      page: String(query.page),
      pageSize: String(query.pageSize),
      sort: query.sort,
      dir: query.dir,
    });
    if (query.promoterId) params.set('promoterId', query.promoterId);
    if (query.userId) params.set('userId', query.userId);
    if (query.type) params.set('type', query.type);
    return call<AdminGeneralReport>(session, 'GET', `/v1/admin/reports/general?${params}`);
  },
  operationSummary(session: Caller, query: OperationSummaryQuery) {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.promoterId) params.set('promoterId', query.promoterId);
    return call<AdminOperationSummary>(session, 'GET', `/v1/admin/operation-summary?${params}`);
  },
  ticketDrawOptions: (session: Caller) =>
    call<AdminTicketDrawOption[]>(session, 'GET', '/v1/admin/tickets/draw-options'),

  /** Todos os promotores (nome e ID), para o filtro da lista de usuários. */
  listPromoterOptions: (session: Caller) => call<AdminPromoterOption[]>(session, 'GET', '/v1/admin/promoters/options'),

  getUser: (session: Caller, id: string) =>
    call<AdminUserDetail>(session, 'GET', `/v1/admin/users/${encodeURIComponent(id)}`),

  updateUser: (session: Caller, id: string, patch: Record<string, unknown>) =>
    call<AdminUserDetail>(session, 'PATCH', `/v1/admin/users/${encodeURIComponent(id)}`, patch),

  listOperators: (session: Caller) => call<AdminOperator[]>(session, 'GET', '/v1/admin/operators'),

  createOperator: (session: Caller, body: SaveOperatorRequest) =>
    call<OperatorPasswordResponse>(session, 'POST', '/v1/admin/operators', body),

  updateOperator: (session: Caller, id: string, body: SaveOperatorRequest) =>
    call<AdminOperator>(session, 'PUT', `/v1/admin/operators/${encodeURIComponent(id)}`, body),

  setOperatorStatus: (session: Caller, id: string, active: boolean) =>
    call<AdminOperator>(session, 'PATCH', `/v1/admin/operators/${encodeURIComponent(id)}/status`, { active }),

  resetOperatorPassword: (session: Caller, id: string) =>
    call<OperatorPasswordResponse>(session, 'POST', `/v1/admin/operators/${encodeURIComponent(id)}/password`, {}),

  setUserStatus: (session: Caller, id: string, status: string) =>
    call<AdminUserDetail>(session, 'PATCH', `/v1/admin/users/${encodeURIComponent(id)}/status`, { status }),

  setPromoter: (session: Caller, id: string, body: SetPromoterRequest) =>
    call<AdminPromoterListItem>(session, 'PUT', `/v1/admin/promoters/${encodeURIComponent(id)}`, body),

  removePromoter: (session: Caller, id: string) =>
    call<null>(session, 'DELETE', `/v1/admin/promoters/${encodeURIComponent(id)}`),

  creditWallet: (session: Caller, id: string, body: AdminWalletCreditRequest) =>
    call<AdminUserDetail>(session, 'POST', `/v1/admin/users/${encodeURIComponent(id)}/wallet/credits`, body),

  getCommissionSettings: (session: Caller) =>
    call<AdminCommissionSettings>(session, 'GET', '/v1/admin/commissions/settings'),

  setCommissionSettings: (session: Caller, referralCommissionBps: number) =>
    call<AdminCommissionSettings>(session, 'PUT', '/v1/admin/commissions/settings', { referralCommissionBps }),

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

  // Configurações > Pagamentos (as credenciais só vão; nunca voltam).
  getPaymentSettings: (session: Caller) => call<AdminPaymentSettings>(session, 'GET', '/v1/admin/payments'),
  savePaymentGateway: (session: Caller, gateway: PaymentGatewayId, body: SavePaymentGatewayRequest) =>
    call<AdminPaymentSettings>(session, 'PUT', `/v1/admin/payments/${gateway}`, body),
  setPaymentGatewayActive: (session: Caller, gateway: PaymentGatewayId, active: boolean) =>
    call<AdminPaymentSettings>(session, 'PUT', `/v1/admin/payments/${gateway}/active`, { active }),
  testPaymentGateway: (session: Caller, gateway: PaymentGatewayId) =>
    call<PaymentGatewayTestResult>(session, 'POST', `/v1/admin/payments/${gateway}/test`, {}),
  /** Carteira > Depósitos. */
  listDeposits(session: Caller, query: DepositsApiQuery) {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.userId) params.set('userId', query.userId);
    if (query.promoterId) params.set('promoterId', query.promoterId);
    if (query.status) params.set('status', query.status);
    return call<AdminDepositList>(session, 'GET', `/v1/admin/deposits?${params}`);
  },
  /** Depósito em análise: liberar o crédito ou recusar (só o Gerente). */
  reviewDeposit: (session: Caller, id: string, approve: boolean) =>
    call<AdminDepositListItem>(session, 'POST', `/v1/admin/deposits/${id}/review`, { approve }),
  /** Carteira > Saques. */
  listWithdrawals(session: Caller, query: WithdrawalsApiQuery) {
    const params = new URLSearchParams({
      from: query.from,
      to: query.to,
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.userId) params.set('userId', query.userId);
    if (query.promoterId) params.set('promoterId', query.promoterId);
    if (query.status) params.set('status', query.status);
    return call<AdminWithdrawalList>(session, 'GET', `/v1/admin/withdrawals?${params}`);
  },
  reviewWithdrawal: (session: Caller, id: string, approve: boolean, note?: string) =>
    call<AdminWithdrawalListItem>(session, 'POST', `/v1/admin/withdrawals/${id}/review`, {
      approve,
      ...(note ? { note } : {}),
    }),
  resolveWithdrawal: (session: Caller, id: string, paid: boolean) =>
    call<AdminWithdrawalListItem>(session, 'POST', `/v1/admin/withdrawals/${id}/resolve`, { paid }),
  getDepositBonusSettings: (session: Caller) =>
    call<DepositBonusSettings>(session, 'GET', '/v1/admin/deposit-bonus-settings'),
  saveDepositBonusSettings: (session: Caller, body: DepositBonusSettings) =>
    call<DepositBonusSettings>(session, 'PUT', '/v1/admin/deposit-bonus-settings', body),
  getWithdrawalSettings: (session: Caller) => call<WithdrawalSettings>(session, 'GET', '/v1/admin/withdrawal-settings'),
  saveWithdrawalSettings: (session: Caller, body: WithdrawalSettings) =>
    call<WithdrawalSettings>(session, 'PUT', '/v1/admin/withdrawal-settings', body),
  getHomeLayout: (session: Caller) => call<HomeLayout>(session, 'GET', '/v1/admin/branding/home'),

  saveHomeLayout: (session: Caller, body: HomeLayout) =>
    call<HomeLayout>(session, 'PUT', '/v1/admin/branding/home', body),

  brandingLogo: (session: Caller) =>
    apiRequestImage(session.hostname, '/v1/admin/branding/logo', { operatorToken: session.token }),

  listAudit(session: Caller, query: AuditQuery) {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
    if (query.action) params.set('action', query.action);
    if (query.userId) params.set('userId', query.userId);
    if (query.period) params.set('period', query.period);
    return call<Page<AdminAuditEntry>>(session, 'GET', `/v1/admin/audit?${params}`);
  },
};
