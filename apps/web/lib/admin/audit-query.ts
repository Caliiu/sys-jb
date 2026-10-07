import {
  AUDIT_ACTIONS,
  PAYMENT_GATEWAY_INFO,
  type AdminAuditEntry,
  type AuditAction,
  type AuditPeriod,
  type PaymentGatewayId,
} from '@sysjb/contracts';
import { ADMIN_ROUTES } from './admin-routes';
import { formatBrl } from '../currency';
import { formatCommission } from './commission';
import { DEFAULT_PAGE_SIZE, parsePageSize } from './page-size';

export interface AuditQuery {
  page: number;
  pageSize: number;
  /** '' = todas as ações. */
  action: AuditAction | '';
  /** '' = todos os usuários; senão, o id (UUID) do usuário afetado. */
  userId: string;
  /** '' = todo o histórico. */
  period: AuditPeriod | '';
}

/** Período na URL (em português) e na API. */
export const AUDIT_PERIOD_PARAMS: Record<AuditPeriod, string> = { today: 'hoje', '7d': '7d', '30d': '30d' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Página da URL com tolerância: valor inválido vira 1, nunca erro (a URL é digitável). */
function parsePage(raw: string | string[] | undefined): number {
  const page = Number(first(raw));
  return Number.isInteger(page) && page >= 1 && page <= 1_000_000 ? page : 1;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtros da URL com tolerância: valor inválido vira "sem filtro", nunca erro (a URL é digitável). */
export function parseAuditQuery(raw: Record<string, string | string[] | undefined>): AuditQuery {
  const action = first(raw.acao) ?? '';
  const userId = first(raw.usuario) ?? '';
  const period = first(raw.periodo) ?? '';
  return {
    page: parsePage(raw.page),
    pageSize: parsePageSize(raw.pageSize),
    action: (AUDIT_ACTIONS as readonly string[]).includes(action) ? (action as AuditAction) : '',
    userId: UUID_RE.test(userId) ? userId.toLowerCase() : '',
    period:
      (Object.keys(AUDIT_PERIOD_PARAMS) as AuditPeriod[]).find((key) => AUDIT_PERIOD_PARAMS[key] === period) ?? '',
  };
}

/** Endereço da auditoria com filtros e página; omite o que é padrão. */
export function auditHref(query: Partial<AuditQuery>): string {
  const params = new URLSearchParams();
  if (query.action) params.set('acao', query.action);
  if (query.userId) params.set('usuario', query.userId);
  if (query.period) params.set('periodo', AUDIT_PERIOD_PARAMS[query.period]);
  if (query.pageSize && query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const qs = params.toString();
  return qs ? `${ADMIN_ROUTES.audit}?${qs}` : ADMIN_ROUTES.audit;
}

/** Cor do selo da ação: exclusões e bloqueios em vermelho, inclusões e créditos em verde, o resto neutro. */
export type AuditTone = 'danger' | 'success' | 'neutral';

export const AUDIT_ACTION_TONES: Record<AuditAction, AuditTone> = {
  'user.update': 'neutral',
  'user.block': 'danger',
  'user.unblock': 'success',
  'promoter.enable': 'success',
  'promoter.update': 'neutral',
  'promoter.disable': 'danger',
  'wallet.credit': 'success',
  'commission.rate': 'neutral',
  'commission.close': 'success',
  'quote.update': 'neutral',
  'draw.create': 'success',
  'draw.update': 'neutral',
  'draw.delete': 'danger',
  'draw.exception.create': 'success',
  'draw.exception.delete': 'danger',
  'mural.create': 'success',
  'mural.update': 'neutral',
  'mural.delete': 'danger',
  'branding.update': 'neutral',
  'home.layout.update': 'neutral',
  'operator.create': 'success',
  'operator.update': 'neutral',
  'operator.activate': 'success',
  'operator.deactivate': 'danger',
  'operator.password': 'neutral',
  'payment.gateway.update': 'neutral',
  'payment.gateway.activate': 'success',
  'payment.gateway.deactivate': 'danger',
  'deposit.approve': 'success',
  'deposit.reject': 'danger',
  'withdrawal.approve': 'success',
  'withdrawal.reject': 'danger',
  'withdrawal.resolve': 'neutral',
  'withdrawal.settings': 'neutral',
  'casino.commission.pay': 'success',
  'deposit.bonus.settings': 'neutral',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'user.update': 'Cadastro corrigido',
  'user.block': 'Usuário bloqueado',
  'user.unblock': 'Usuário reativado',
  'promoter.enable': 'Promovido a promotor',
  'promoter.update': 'Comissão alterada',
  'promoter.disable': 'Deixou de ser promotor',
  'wallet.credit': 'Carteira creditada',
  'commission.rate': 'Indique e ganhe alterado',
  'commission.close': 'Comissões do mês fechadas',
  'quote.update': 'Cotações alteradas',
  'draw.create': 'Sorteio cadastrado',
  'draw.update': 'Sorteio alterado',
  'draw.delete': 'Sorteio excluído',
  'draw.exception.create': 'Exceção de data criada',
  'draw.exception.delete': 'Exceção de data removida',
  'mural.create': 'Mural cadastrado',
  'mural.update': 'Mural alterado',
  'mural.delete': 'Mural excluído',
  'branding.update': 'Identidade visual alterada',
  'home.layout.update': 'Cards do início alterados',
  'operator.create': 'Operador cadastrado',
  'operator.update': 'Operador alterado',
  'operator.activate': 'Operador ativado',
  'operator.deactivate': 'Operador desativado',
  'operator.password': 'Nova senha de operador',
  'payment.gateway.update': 'Credenciais de pagamento alteradas',
  'payment.gateway.activate': 'Gateway de pagamento ativado',
  'payment.gateway.deactivate': 'Gateway de pagamento desativado',
  'deposit.approve': 'Depósito em análise liberado',
  'deposit.reject': 'Depósito em análise recusado',
  'withdrawal.approve': 'Saque aprovado',
  'withdrawal.reject': 'Saque recusado',
  'withdrawal.resolve': 'Saque concluído à mão',
  'withdrawal.settings': 'Limites de saque alterados',
  'casino.commission.pay': 'Comissão de cassino paga',
  'deposit.bonus.settings': 'Bônus de recarga alterado',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  phone: 'Telefone',
  document: 'CPF',
  promoterCommissionBps: 'Comissão',
  balanceJb: 'Saldo',
  bonusJb: 'Bônus',
  balanceGames: 'Disponível em Games',
  role: 'Perfil',
  minDepositCents: 'Recarga mínima',
  firstDeposit: 'Bônus da primeira recarga',
  daily: 'Bônus da primeira do dia',
  federal: 'Bônus do dia da Federal',
};

const commission = (bps: number | null | undefined) => (typeof bps === 'number' ? formatCommission(bps) : '—');

/** Resumo legível do que mudou (só nomes de campos e comissão: a trilha não guarda valores pessoais). */
export function describeAuditDetails(entry: AdminAuditEntry): string {
  const details = entry.details;
  if (!details) return '—';
  if (details.month && typeof details.amount === 'number') {
    const [year, month] = details.month.split('-');
    return `Mês ${month}/${year}: ${formatBrl(details.amount)} pagos`;
  }
  if (details.draw && details.date) {
    const [year, month, day] = details.date.split('-');
    const kind = details.fields[0] === 'EXTRA' ? 'Sorteio extra' : 'Sem sorteio';
    const draw = details.draw === 'Todos' ? 'todos os sorteios' : details.draw;
    return `${kind} em ${day}/${month}/${year}: ${draw}`;
  }
  if (details.draw) return details.fields.length ? `${details.draw}: ${details.fields.join(', ')}` : details.draw;
  if (details.gateway) {
    const label = PAYMENT_GATEWAY_INFO[details.gateway as PaymentGatewayId]?.label ?? details.gateway;
    return details.fields.length ? `${label}: ${details.fields.join(', ')}` : label;
  }
  if (details.mural) return details.fields.length ? `${details.mural}: ${details.fields.join(', ')}` : details.mural;
  if (details.fields.includes('referralCommissionBps')) {
    return `Indique e ganhe de ${commission(details.from)} para ${commission(details.to)}`;
  }
  if (typeof details.amount === 'number') {
    const bucket = details.fields.map((field) => FIELD_LABELS[field] ?? field).join(', ');
    return `${bucket}: + ${formatBrl(details.amount)}`;
  }
  const casino = details.fields.includes('casinoCommissionBps')
    ? `cassino de ${commission(details.casinoFrom)} para ${commission(details.casinoTo)}`
    : null;
  if (details.fields.includes('promoterCommissionBps') && ('from' in details || 'to' in details)) {
    const lotteries =
      details.from == null
        ? `Comissão de ${commission(details.to)}`
        : details.to == null
          ? `Comissão era ${commission(details.from)}`
          : `Comissão de ${commission(details.from)} para ${commission(details.to)}`;
    return casino ? `${lotteries}; ${casino}` : lotteries;
  }
  if (casino) return `Comissão de ${casino}`;
  if (details.fields.length === 0) return '—';
  return `Campos: ${details.fields.map((field) => FIELD_LABELS[field] ?? field).join(', ')}`;
}
