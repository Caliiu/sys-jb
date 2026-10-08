/**
 * Contratos do painel administrativo (operadores, perfis, usuários vistos pelo operador).
 * Sem dependências de servidor: a API e o web importam daqui.
 */
import { drawDateOf } from './fazendinha.js';
import type { PublicTenant, PublicWallet } from './index.js';

export const USER_STATUSES = ['ACTIVE', 'BLOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const OPERATOR_ROLES = ['MANAGER', 'FINANCE', 'SUPPORT'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const PERMISSIONS = [
  'users.read',
  'users.update',
  'users.status',
  'promoters.read',
  'promoters.manage',
  'audit.read',
  'wallet.adjust',
  'commissions.read',
  'commissions.manage',
  'quotes.read',
  'quotes.manage',
  'draws.read',
  'draws.manage',
  'murals.read',
  'murals.manage',
  'branding.read',
  'branding.manage',
  'tickets.read',
  'operation.read',
  'operators.manage',
  'payments.read',
  'payments.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissões de cada perfil (fonte única, usada pela API para autorizar e pelo web para
 * decidir o que mostrar; a API é quem garante).
 * - MANAGER (Gerente): tudo (inclusive promover a promotor, definir a comissão, ver a auditoria e creditar
 *   carteiras; o banco confere o perfil de novo no crédito — ver migration operator_wallet_credit).
 * - SUPPORT (Suporte): consulta e corrige dados de cadastro; não bloqueia; não vê promotores.
 * - FINANCE (Financeiro): somente consulta (usuários, promotores, comissões, cotações e sorteios).
 * Cotações: `quotes.manage` edita a tabela de prêmios da banca (Tradicional e Fazendinha).
 * Sorteios: `draws.manage` cadastra/altera sorteios e exceções de data (o banco recusa o que deixaria apostas
 * vendidas sem sorteio).
 * Identidade visual: `branding.manage` altera nome, logo, cores e o texto da barra de convite (só o Gerente).
 * Mural: `murals.manage` cadastra/altera/exclui os avisos com imagem do app do jogador (só o Gerente).
 * Comissões: `commissions.manage` define a % do "Indique e ganhe" e fecha o mês (o banco confere o perfil
 * MANAGER de novo no fechamento).
 * Bilhetes: `tickets.read` consulta os pules vendidos (todos os perfis; ninguém altera pule pelo painel).
 * Resumo da operação: `operation.read` vê os números financeiros da banca no período (Gerente e Financeiro).
 * Operadores: `operators.manage` cadastra, altera, ativa/desativa e gera senha dos operadores da própria banca (só o
 * Gerente; o banco confere o perfil de novo — ver migration operator_management).
 * Pagamentos: `payments.read` vê os gateways configurados (sem as credenciais); `payments.manage` grava credenciais,
 * testa, escolhe o gateway ativo e libera ou recusa depósitos em análise (pagos por outro titular); nos saques, define
 * os limites, aprova ou recusa os que estão em análise e conclui à mão um envio sem resposta — só o Gerente; o banco
 * confere o perfil de novo (migrations payments, deposit_payer e withdrawals).
 */
export const ROLE_PERMISSIONS: Readonly<Record<OperatorRole, readonly Permission[]>> = {
  MANAGER: [
    'users.read',
    'users.update',
    'users.status',
    'promoters.read',
    'promoters.manage',
    'audit.read',
    'wallet.adjust',
    'commissions.read',
    'commissions.manage',
    'quotes.read',
    'quotes.manage',
    'draws.read',
    'draws.manage',
    'murals.read',
    'murals.manage',
    'branding.read',
    'branding.manage',
    'tickets.read',
    'operation.read',
    'operators.manage',
    'payments.read',
    'payments.manage',
  ],
  SUPPORT: ['users.read', 'users.update', 'tickets.read'],
  FINANCE: [
    'users.read',
    'promoters.read',
    'commissions.read',
    'quotes.read',
    'draws.read',
    'tickets.read',
    'operation.read',
    'payments.read',
  ],
};

export function hasPermission(role: OperatorRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface PublicOperator {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  permissions: readonly Permission[];
}

export interface OperatorLoginRequest {
  email: string;
  password: string;
}

/** Como no login do cliente, o token é opaco e fica só no servidor do web (cookie HttpOnly). */
export interface OperatorLoginResponse {
  token: string;
  /** ISO 8601. */
  expiresAt: string;
  operator: PublicOperator;
}

/** Quem está logado no painel e de qual banca (a banca vem do operador, nunca do endereço acessado). */
export interface OperatorMeResponse {
  operator: PublicOperator;
  tenant: PublicTenant;
}

/** Linha da lista de usuários. CPF e telefone: só dígitos (a tela formata). */
export interface AdminUserListItem {
  id: string;
  displayId: number;
  name: string;
  document: string;
  phone: string;
  status: UserStatus;
  /** ISO 8601. */
  createdAt: string;
  /** Quem indicou o usuário no cadastro (jogador ou promotor); null = veio sem convite. */
  referredBy: { id: string; displayId: number; name: string } | null;
  /**
   * O mesmo "indicado por", só quando essa pessoa é promotor (ganha a % de promotor além da de indicação).
   * `commissionBps`: comissão do promotor em centésimos de %.
   */
  promoter: { id: string; displayId: number; name: string; commissionBps: number } | null;
}

export interface AdminUserDetail {
  id: string;
  displayId: number;
  name: string;
  email: string | null;
  phone: string;
  document: string;
  /** YYYY-MM-DD. */
  birthDate: string;
  /** Código do link de convite deste usuário. */
  inviteCode: string;
  status: UserStatus;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 do último login; null se nunca entrou. */
  lastLoginAt: string | null;
  wallet: PublicWallet;
  /** Comissão em centésimos de % (1 a 10000); null = não é promotor. */
  promoterCommissionBps: number | null;
  /** Comissão de cassino do promotor em centésimos de % do GGR mensal (0 a 10000); 0 para quem não é promotor. */
  casinoCommissionBps: number;
  /**
   * Quem indicou este usuário no cadastro (jogador comum ou promotor); null = veio sem convite.
   * `promoterCommissionBps` não nulo = quem indicou é promotor (ganha indicação + promotor).
   */
  referredBy: { id: string; displayId: number; name: string; promoterCommissionBps: number | null } | null;
}

/** Comissão do promotor em centésimos de % (1 = 0,01%; 10000 = 100%). Inteiro: nunca ponto flutuante. */
export const MIN_COMMISSION_BPS = 1;
export const MAX_COMMISSION_BPS = 10_000;
/** Comissão de cassino do promotor: 0% (sem comissão de cassino) a 100% do GGR. */
export const MIN_CASINO_COMMISSION_BPS = 0;

/** Linha da lista de promotores. */
export interface AdminPromoterListItem {
  id: string;
  displayId: number;
  name: string;
  /** Só dígitos (a tela formata). */
  phone: string;
  /** Código do link de convite do promotor. */
  inviteCode: string;
  status: UserStatus;
  commissionBps: number;
  /** Comissão de cassino (centésimos de % do GGR mensal dos indicados). */
  casinoCommissionBps: number;
  /** Jogadores cadastrados pelo link de convite deste promotor. */
  referralsCount: number;
  /** ISO 8601. */
  createdAt: string;
}

/** PUT /v1/admin/promoters/:userId: promove o usuário a promotor ou altera as comissões. */
export interface SetPromoterRequest {
  commissionBps: number;
  /** Omitido = mantém a atual (0 para quem está virando promotor). */
  casinoCommissionBps?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminUserListQuery {
  page?: number;
  pageSize?: number;
  /** Nome, CPF, telefone ou ID do usuário. */
  search?: string;
  status?: UserStatus;
  /** Só os jogadores indicados por este promotor. */
  promoterId?: string;
}

/** Opção do filtro por promotor (GET /v1/admin/promoters/options): todos os promotores, por nome. */
export interface AdminPromoterOption {
  id: string;
  displayId: number;
  name: string;
}

// ---------------------------------------------------------------------------
// Bilhetes (pules vendidos: Loterias e Fazendinha, cada jogo com a sua numeração)
// ---------------------------------------------------------------------------

/** Jogo do bilhete: a numeração é própria de cada um (o mesmo número pode existir nos dois). */
export type AdminTicketGame = 'lotteries' | 'fazendinha';

export interface AdminTicketListItem {
  game: AdminTicketGame;
  puleNumber: number;
  /** ISO 8601 da venda. */
  createdAt: string;
  /** Data do sorteio ("vale"), YYYY-MM-DD. */
  drawDate: string;
  /** Nome do sorteio na venda (ex.: LT PT RIO 09HS). */
  lottery: string;
  /** Código da extração na venda (ex.: PTRIO09). */
  drawCode: string;
  totalCents: number;
  player: { id: string; displayId: number; name: string };
  /** ISO 8601 do cancelamento pelo jogador (só Loterias); null = válido. */
  canceledAt: string | null;
}

/** GET /v1/admin/tickets: bilhetes vendidos no dia (Brasília), mais recentes primeiro, e o total apostado. */
export interface AdminTicketList extends Page<AdminTicketListItem> {
  /** Soma dos bilhetes válidos do filtro (não só da página; cancelados não contam). */
  totalCents: number;
}

export interface AdminTicketListQuery {
  /** Dia da venda (YYYY-MM-DD, Brasília). */
  date: string;
  page?: number;
  pageSize?: number;
  /** Só os bilhetes dos indicados deste promotor. */
  promoterId?: string;
  /** Só os bilhetes deste apostador. */
  userId?: string;
  /** Só os bilhetes deste sorteio (pelo nome e hora da venda, que não mudam depois de vender). */
  drawId?: string;
}

/** Opção do filtro "Horário (Extração)" (GET /v1/admin/tickets/draw-options): sorteios da banca, por horário. */
export interface AdminTicketDrawOption {
  id: string;
  name: string;
  /** HH:MM. */
  drawTime: string;
}

// ---------------------------------------------------------------------------
// Pules premiadas (Operação > Prêmios)
// ---------------------------------------------------------------------------

/** Maior período (dias, contando o primeiro e o último) de uma consulta de pules premiadas. */
export const ADMIN_PRIZES_MAX_DAYS = 93;
/** Maior prêmio aceito nos filtros (R$ 10 milhões, em centavos). */
export const ADMIN_PRIZE_FILTER_MAX_CENTS = 1_000_000_000;

/** Pule premiada na apuração (um registro por pule; a numeração é própria de cada jogo). */
export interface AdminPrizeListItem {
  game: AdminTicketGame;
  puleNumber: number;
  /** Data do jogo (sorteio), YYYY-MM-DD. */
  drawDate: string;
  /** Nome do sorteio na venda (ex.: LT PT RIO 09HS). */
  lottery: string;
  /** Código da extração na venda (ex.: PTRIO09). */
  drawCode: string;
  /** Valor apostado no pule. */
  stakeCents: number;
  /** Prêmio pago ao pule. */
  prizeCents: number;
  /** ISO 8601 da apuração. */
  settledAt: string;
  player: { id: string; displayId: number; name: string };
}

/**
 * Pule apurada cujo resultado o provedor corrigiu depois do pagamento e que, pelo resultado corrigido, teria outro
 * prêmio. O pago não muda sozinho (a carência já tinha passado): é um aviso para o operador conferir e ajustar a
 * carteira se for o caso.
 */
export interface AdminPrizeReview {
  game: AdminTicketGame;
  puleNumber: number;
  /** Data do jogo (sorteio), YYYY-MM-DD. */
  drawDate: string;
  lottery: string;
  drawCode: string;
  /** Prêmio pago na apuração (0 = a pule não tinha ganhado). */
  paidCents: number;
  /** Prêmio pelo resultado corrigido. */
  correctedCents: number;
  /** ISO 8601 da apuração e da conferência com o resultado corrigido. */
  settledAt: string;
  checkedAt: string;
  player: { id: string; displayId: number; name: string };
}

/** Máximo de avisos de resultado corrigido devolvidos numa consulta (os mais recentes). */
export const ADMIN_PRIZE_REVIEWS_LIMIT = 200;

/** GET /v1/admin/prizes: pules premiadas no período (data do jogo), maiores prêmios primeiro, e as somas do filtro. */
export interface AdminPrizeList extends Page<AdminPrizeListItem> {
  /** Soma dos prêmios de todo o filtro (não só da página). */
  totalPrizeCents: number;
  /** Resultados corrigidos depois do pagamento (mesmo filtro, exceto a faixa de prêmio), mais recentes primeiro. */
  reviews: AdminPrizeReview[];
  /** Quantos avisos há no filtro (pode passar de ADMIN_PRIZE_REVIEWS_LIMIT). */
  reviewsTotal: number;
  /**
   * Pules do filtro (exceto a faixa de prêmio) cujo sorteio já passou e que ainda não foram apurados: sorteio sem
   * resultado ligado, resultado que não chegou ou ainda na carência.
   */
  pendingCount: number;
}

export interface AdminPrizeListQuery {
  /** Período pela data do jogo (YYYY-MM-DD, Brasília), inclusivo; até ADMIN_PRIZES_MAX_DAYS dias. */
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
  /** Só os pules dos indicados deste promotor. */
  promoterId?: string;
  /** Só os pules deste apostador. */
  userId?: string;
  /** Só os pules deste sorteio (pelo nome e hora da venda). */
  drawId?: string;
  /** Faixa do prêmio (centavos, inclusiva). */
  minPrizeCents?: number;
  maxPrizeCents?: number;
}

// ---------------------------------------------------------------------------
// Resumo da Operação
// ---------------------------------------------------------------------------

/** Maior período (dias, contando o primeiro e o último) do resumo da operação. */
export const OPERATION_SUMMARY_MAX_DAYS = 366;

/** Entradas e saídas de um jogo no período. */
export interface OperationGameTotals {
  /** Total apostado. */
  turnoverCents: number;
  /** Total pago em prêmios. */
  payoutCents: number;
  /** Turnover menos payout. */
  netCents: number;
}

/**
 * GET /v1/admin/operation-summary: números da banca no período (dias de Brasília, inclusivos), de todos os jogadores ou
 * só dos indicados de um promotor. Valores em centavos. Os saldos são de agora (não do período).
 */
export interface AdminOperationSummary {
  from: string;
  to: string;
  /** Promotor do filtro; null = todos. */
  promoter: AdminPromoterOption | null;
  newUsers: {
    /** Cadastros no período. */
    signups: number;
    /** Cadastros do período que já fizeram o primeiro depósito. */
    firstDeposits: number;
    /** firstDeposits / signups, em centésimos de % (0 a 10000). */
    firstDepositRateBps: number;
    /** Média do primeiro depósito. */
    firstDepositAverageCents: number;
  };
  cashflow: { depositsCents: number; withdrawalsCents: number; netCents: number };
  balances: {
    /** Disponível para saque agora. */
    withdrawableCents: number;
    /** Soma das carteiras agora (saldo, bônus e prêmios, Loterias e games). */
    totalCents: number;
    /** Lançamentos creditados pelo painel e ajustes manuais no período (sem bônus). */
    creditedCents: number;
    /** Bônus creditados no período. */
    bonusCreditedCents: number;
  };
  result: {
    wageredCents: number;
    prizesCents: number;
    /** Jogado menos prêmios. */
    grossCents: number;
    /** Comissões pagas no período. */
    commissionCents: number;
    /** Bruto menos comissão. */
    netCents: number;
  };
  lotteries: OperationGameTotals;
  casino: OperationGameTotals;
  /** Números que ainda não têm origem no sistema (vêm zerados). Hoje todos têm: vem vazio. */
  unavailable: Array<'deposits' | 'withdrawals' | 'casino'>;
}

// ---------------------------------------------------------------------------
// Relatório geral (Relatórios > Relatório geral)
// ---------------------------------------------------------------------------

/** Tipo do usuário no relatório: promotor (tem comissão de promotor) ou apostador comum. */
export const GENERAL_REPORT_TYPES = ['player', 'promoter'] as const;
export type GeneralReportType = (typeof GENERAL_REPORT_TYPES)[number];

/** Colunas que ordenam o relatório. */
export const GENERAL_REPORT_SORTS = [
  'name',
  'type',
  'sales',
  'commission',
  'referralCommission',
  'prizes',
  'other',
  'net',
] as const;
export type GeneralReportSort = (typeof GENERAL_REPORT_SORTS)[number];

/** Uma linha por usuário com movimento no período. Valores em centavos, do ponto de vista da banca. */
export interface AdminGeneralReportRow {
  player: { id: string; displayId: number; name: string };
  type: GeneralReportType;
  /** Pules vendidos (Loterias e Fazendinha), pela data da venda. */
  salesCents: number;
  /** Parte de promotor da comissão creditada no período. */
  commissionCents: number;
  /** Parte "Indique e ganhe" da comissão creditada no período. */
  referralCommissionCents: number;
  /** Prêmios apurados no período. */
  prizesCents: number;
  /** Créditos e ajustes pelo painel no período (todas as bolsas, inclusive bônus). */
  otherCents: number;
  /** Vendas − prêmios − comissão − comissão amigo. */
  netCents: number;
  /** Líquido − outros. */
  grossNetCents: number;
}

/** GET /v1/admin/reports/general: o relatório do período (dias de Brasília, inclusivos), paginado e ordenado. */
export interface AdminGeneralReport extends Page<AdminGeneralReportRow> {
  from: string;
  to: string;
}

export interface AdminGeneralReportQuery {
  /** Período (YYYY-MM-DD, Brasília), inclusivo; até OPERATION_SUMMARY_MAX_DAYS dias. */
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
  /** O promotor e os indicados dele. */
  promoterId?: string;
  userId?: string;
  type?: GeneralReportType;
  /** Padrão: vendas, decrescente. */
  sort?: GeneralReportSort;
  dir?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Vendas por extração (Relatórios > Loterias > Vendas por extração)
// ---------------------------------------------------------------------------

/** Valores de uma extração (ou do total) no período, em centavos. */
export interface SalesByDrawTotals {
  /** Pules vendidos (Loterias e Fazendinha). */
  tickets: number;
  lotteriesCents: number;
  fazendinhaCents: number;
  /** Loterias + Fazendinha. */
  salesCents: number;
  /** Prêmios dos pules da extração (apuração). */
  prizesCents: number;
  /** Vendas − prêmios. */
  netCents: number;
}

/** Uma extração: o sorteio pelo nome e hora da venda (não mudam depois de vender). */
export interface SalesByDrawRow extends SalesByDrawTotals {
  /** Nome do sorteio (ex.: LT PT RIO 09HS). */
  lottery: string;
  /** Hora do sorteio (0–23). */
  hour: number;
  /** Código da extração na venda (ex.: PTRIO09); vazio se não houver. */
  drawCode: string;
  /** HH:MM do cadastro atual; null se o sorteio não existe mais. */
  drawTime: string | null;
}

/** GET /v1/admin/reports/sales-by-draw: vendas por extração no período (data do jogo), por horário. */
export interface AdminSalesByDrawReport {
  from: string;
  to: string;
  rows: SalesByDrawRow[];
  totals: SalesByDrawTotals;
}

export interface AdminSalesByDrawQuery {
  /** Período pela data do jogo (YYYY-MM-DD, Brasília), inclusivo; até OPERATION_SUMMARY_MAX_DAYS dias. */
  from: string;
  to: string;
  /** Só os pules dos indicados deste promotor. */
  promoterId?: string;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Geral cassino (Relatórios > Cassino > Geral cassino)
// ---------------------------------------------------------------------------

/** Uma linha por usuário com jogo de cassino no período. Valores em centavos, do ponto de vista da banca. */
export interface CasinoGeneralRow extends OperationGameTotals {
  player: { id: string; displayId: number; name: string };
  type: GeneralReportType;
}

/** GET /v1/admin/reports/casino/general: cassino por usuário no período (dias de Brasília, inclusivos). */
export interface AdminCasinoGeneralReport {
  from: string;
  to: string;
  rows: CasinoGeneralRow[];
  totals: OperationGameTotals;
  /** Sempre true desde que as rodadas do cassino são gravadas (false marcava o relatório vazio, antes do cassino). */
  available: boolean;
}

export interface AdminCasinoGeneralQuery {
  /** Período (YYYY-MM-DD, Brasília), inclusivo; até OPERATION_SUMMARY_MAX_DAYS dias e até hoje. */
  from: string;
  to: string;
  /** Só os indicados deste promotor (a base da comissão de cassino dele). */
  promoterId?: string;
  userId?: string;
  type?: GeneralReportType;
}

// ---------------------------------------------------------------------------
// Fechamento cassino (Relatórios > Cassino > Fechamento cassino)
// ---------------------------------------------------------------------------

/** Cassino dos indicados no mês, do ponto de vista da banca, e a comissão dos promotores. Centavos. */
export interface CasinoClosingTotals {
  turnoverCents: number;
  payoutCents: number;
  /** Turnover − payout (pode ser negativo). */
  ggrCents: number;
  /**
   * % de cassino do promotor sobre o GGR, arredondada para baixo no centavo; GGR negativo paga 0. No total do mês,
   * só o que vale pagar (sem promotores bloqueados que ainda não receberam).
   */
  commissionCents: number;
}

/**
 * Situação de um promotor no mês:
 * - open: mês em andamento (parcial, ainda não pode ser pago);
 * - pending: mês encerrado, comissão a pagar;
 * - paid: já recebeu (valores e % gravados no pagamento);
 * - blocked: promotor bloqueado, não recebe;
 * - none: sem comissão no mês (sem movimento, GGR negativo ou % de cassino zero).
 */
export const CASINO_CLOSING_STATUSES = ['open', 'pending', 'paid', 'blocked', 'none'] as const;
export type CasinoClosingStatus = (typeof CASINO_CLOSING_STATUSES)[number];

/** Quanto do mês já foi pago e quanto falta. */
export interface CasinoClosingProgress {
  paidCents: number;
  pendingCents: number;
  /** Promotores com comissão a pagar (mês encerrado). */
  pendingCount: number;
}

/** Card de um mês: o último mês encerrado (a fechar) ou o mês em andamento (parcial). */
export interface CasinoClosingMonth extends CasinoClosingProgress {
  /** YYYY-MM. */
  month: string;
  /** O mês já terminou (Brasília): só ele pode ser pago. */
  ended: boolean;
  totals: CasinoClosingTotals;
  /** Promotores com comissão no mês (fora os bloqueados que ainda não receberam). */
  promotersWithCommission: number;
}

/** Linha do detalhamento: um promotor, a % de cassino dele e o cassino dos indicados no mês. */
export interface CasinoClosingRow extends CasinoClosingTotals {
  promoter: { id: string; displayId: number; name: string };
  casinoCommissionBps: number;
  /** Jogadores cadastrados pelo link do promotor. */
  referralsCount: number;
  status: CasinoClosingStatus;
  /** Quando recebeu (ISO 8601); null se ainda não recebeu. */
  paidAt: string | null;
}

/** Meses dos cards do fechamento (YYYY-MM, Brasília): o último encerrado e o em andamento. */
export function casinoClosingMonths(nowIso: string): { previous: string; current: string } {
  const current = drawDateOf(nowIso, 0).slice(0, 7);
  const [year, month] = current.split('-').map(Number) as [number, number];
  // Dia 1 do mês anterior (Date.UTC aceita mês 0 - 1 = dezembro do ano anterior).
  return { previous: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7), current };
}

/** Detalhamento de um mês, promotor a promotor (por nome). */
export interface CasinoClosingDetail extends CasinoClosingProgress {
  month: string;
  ended: boolean;
  rows: CasinoClosingRow[];
  totals: CasinoClosingTotals;
}

/**
 * GET /v1/admin/reports/casino/closing (+ `month=YYYY-MM`): os cards do mês anterior e do atual e, com `month`, o
 * detalhamento por promotor daquele mês.
 */
export interface AdminCasinoClosing {
  /** [mês anterior, mês atual]. */
  months: [CasinoClosingMonth, CasinoClosingMonth];
  /** null = nenhum mês escolhido. */
  detail: CasinoClosingDetail | null;
}

/**
 * POST /v1/admin/reports/casino/closing/pay: paga a comissão de cassino de um mês encerrado, no saldo de saque (prêmios das loterias), a um promotor
 * (`promoterId`) ou a todos os pendentes. Só o Gerente; os valores são calculados pelo banco, nunca vêm do painel.
 */
export interface CasinoClosingPayRequest {
  month: string;
  promoterId?: string;
}

export interface CasinoClosingPayResult {
  /** Promotores pagos agora. */
  paidCount: number;
  paidCents: number;
}

// ---------------------------------------------------------------------------
// Extrato do apostador (Carteira > Extrato apostador)
// ---------------------------------------------------------------------------

/** Tipos de lançamento da carteira (wallet_entries.kind). */
export const STATEMENT_KINDS = [
  'LOTTERY_BET',
  'LOTTERY_REFUND',
  'FAZENDINHA_BET',
  'OPERATOR_CREDIT',
  'MANUAL_ADJUSTMENT',
  'COMMISSION',
  'COMMISSION_REVERSAL',
  'OPENING_BALANCE',
  'PRIZE',
  'CASINO',
  'DEPOSIT',
  'WITHDRAWAL',
  'WITHDRAWAL_REFUND',
  'CASINO_COMMISSION',
  'DEPOSIT_BONUS',
] as const;
export type StatementKind = (typeof STATEMENT_KINDS)[number];

/** Um lançamento da carteira. Valores em centavos (positivo = entrou, negativo = saiu). */
export interface AdminStatementEntry {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  kind: StatementKind;
  /** Número do pule (aposta, devolução, comissão da aposta e prêmio); null nos outros lançamentos. */
  puleNumber: number | null;
  /** Motivo (crédito pelo painel, ajuste, comissão, saldo anterior). */
  note: string | null;
  /** Operador que creditou pelo painel. */
  operatorName: string | null;
  balanceCents: number;
  bonusCents: number;
  prizesCents: number;
  /** Disponível em games. */
  gamesCents: number;
  /** Saldo + bônus + prêmios (a carteira de apostas). */
  totalCents: number;
  /** Carteira de apostas (saldo + bônus + prêmios) depois deste lançamento. */
  balanceAfterCents: number;
}

/**
 * GET /v1/admin/users/:id/statement: lançamentos da carteira do apostador no período (dias de Brasília, inclusivos),
 * mais recentes primeiro, paginados. Os saldos são da carteira de apostas (saldo + bônus + prêmios), que o banco
 * mantém igual à soma dos lançamentos.
 */
export interface AdminPlayerStatement extends Page<AdminStatementEntry> {
  from: string;
  to: string;
  player: { id: string; displayId: number; name: string };
  /** Carteira de apostas antes do primeiro dia do período. */
  openingCents: number;
  /** Carteira de apostas no fim do período. */
  closingCents: number;
  /** Soma do que entrou e do que saiu (carteira de apostas) em todo o período. */
  creditsCents: number;
  debitsCents: number;
}

export interface AdminPlayerStatementQuery {
  /** Período (YYYY-MM-DD, Brasília), inclusivo; até OPERATION_SUMMARY_MAX_DAYS dias e até hoje. */
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
}

/** Ações registradas na trilha de auditoria (sempre sobre um usuário da banca). */
export const AUDIT_ACTIONS = [
  'user.update',
  'user.block',
  'user.unblock',
  'promoter.enable',
  'promoter.update',
  'promoter.disable',
  'wallet.credit',
  'commission.rate',
  'commission.close',
  'quote.update',
  'draw.create',
  'draw.update',
  'draw.delete',
  'draw.exception.create',
  'draw.exception.delete',
  'mural.create',
  'mural.update',
  'mural.delete',
  'branding.update',
  'home.layout.update',
  'operator.create',
  'operator.update',
  'operator.activate',
  'operator.deactivate',
  'operator.password',
  'payment.gateway.update',
  'payment.gateway.activate',
  'payment.gateway.deactivate',
  'deposit.approve',
  'deposit.reject',
  'withdrawal.approve',
  'withdrawal.reject',
  'withdrawal.resolve',
  'withdrawal.settings',
  'casino.commission.pay',
  'deposit.bonus.settings',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Registro da auditoria: quem fez o quê, em quem e quando. Nunca traz valores pessoais. */
export interface AdminAuditEntry {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  action: AuditAction;
  operator: { id: string; name: string; email: string };
  /**
   * 'tenant' = ação sobre a banca (ex.: % de indicação, fechamento do mês); 'operator' = sobre um operador (cadastro,
   * situação, senha). Nos dois, `target` é null.
   */
  targetType: 'user' | 'tenant' | 'operator';
  /** Usuário afetado; null em ações sobre a banca ou se o usuário não existir mais nesta banca. */
  target: { id: string; displayId: number; name: string } | null;
  /** Operador afetado (targetType 'operator'); null nos outros casos ou se não existir mais nesta banca. */
  operatorTarget: { id: string; name: string; email: string } | null;
  /**
   * Nomes dos campos alterados; na comissão, antes/depois em centésimos de %; no crédito de carteira, o
   * valor em centavos (fields = a bolsa creditada).
   */
  details: AuditDetails | null;
}

/**
 * Metadados da ação (nunca valores pessoais): nomes dos campos alterados; na comissão, antes/depois em
 * centésimos de %; no crédito de carteira, o valor em centavos; nos sorteios, o nome do sorteio e a data; no
 * mural, o nome do mural.
 */
export type AuditDetails = {
  fields: string[];
  from?: number | null;
  to?: number | null;
  /** Comissão de cassino do promotor antes/depois (centésimos de %). */
  casinoFrom?: number;
  casinoTo?: number;
  amount?: number;
  month?: string;
  draw?: string;
  date?: string;
  /** Nome do mural. */
  mural?: string;
  /** Gateway de pagamento (ex.: MISTICPAY); nunca as credenciais. */
  gateway?: string;
};

/** GET /v1/admin/audit: mais recentes primeiro; filtros opcionais por ação e por usuário afetado. */
/**
 * Período da auditoria, em dias de calendário de Brasília: hoje, últimos 7 dias (hoje e os 6 anteriores) ou
 * últimos 30 dias (hoje e os 29 anteriores).
 */
export const AUDIT_PERIODS = ['today', '7d', '30d'] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

export interface AdminAuditQuery {
  page?: number;
  pageSize?: number;
  action?: AuditAction;
  /** id (UUID) do usuário afetado. */
  userId?: string;
  period?: AuditPeriod;
}

/** Bolsas que o painel pode creditar: saldo, bônus e disponível em games. */
export const WALLET_CREDIT_BUCKETS = ['balance', 'bonus', 'games'] as const;
export type WalletCreditBucket = (typeof WALLET_CREDIT_BUCKETS)[number];

/** Maior crédito numa operação: R$ 100.000,00 (em centavos). O banco confere o mesmo limite. */
export const MAX_WALLET_CREDIT_CENTS = 10_000_000;

/** POST /v1/admin/users/:id/wallet/credits: credita a carteira. Responde com o detalhe do usuário. */
export interface AdminWalletCreditRequest {
  /** UUID gerado pelo painel por tentativa: repetir a mesma chave não credita de novo. */
  idempotencyKey: string;
  bucket: WalletCreditBucket;
  /** Centavos, de 1 a MAX_WALLET_CREDIT_CENTS. */
  amountCents: number;
  /** Motivo (3 a 200 caracteres), guardado no registro de movimentações. */
  note: string;
}

/**
 * "Indique e ganhe" da banca: % (centésimos) do valor apostado pelos indicados, paga na hora de cada aposta de Loterias
 * e Fazendinha (estornada se o pule for cancelado). 0 = desligado.
 */
export interface AdminCommissionSettings {
  referralCommissionBps: number;
}

/** PUT /v1/admin/commissions/settings. */
export interface SetCommissionSettingsRequest {
  referralCommissionBps: number;
}

// ---------------------------------------------------------------------------
// Operadores (Administração > Operadores; só o Gerente, na própria banca)
// ---------------------------------------------------------------------------

/** Operador da banca como o Gerente vê (nunca o hash da senha). */
export interface AdminOperator {
  id: string;
  name: string;
  email: string;
  role: OperatorRole;
  active: boolean;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 do último login no painel; null se nunca entrou. */
  lastLoginAt: string | null;
  /** É o operador da sessão: não muda o próprio perfil, não se desativa e não gera a própria senha por aqui. */
  self: boolean;
}

/** POST /v1/admin/operators (cadastro) e PUT /v1/admin/operators/:id (alteração). */
export interface SaveOperatorRequest {
  name: string;
  /** Único no sistema todo: é o login do painel e diz a qual banca o operador pertence. */
  email: string;
  role: OperatorRole;
}

/** PATCH /v1/admin/operators/:id/status. Desativar encerra as sessões abertas do operador na hora. */
export interface SetOperatorStatusRequest {
  active: boolean;
}

/**
 * Resposta do cadastro e de POST /v1/admin/operators/:id/password: a senha gerada é mostrada UMA vez (o banco guarda
 * só o hash). Gerar nova senha encerra as sessões abertas do operador.
 */
export interface OperatorPasswordResponse {
  operator: AdminOperator;
  password: string;
}
