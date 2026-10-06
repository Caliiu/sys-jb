import {
  type AdminDepositList,
  type AdminPromoterOption,
  type DepositStatus,
  PAYMENT_GATEWAY_INFO,
} from '@sysjb/contracts';
import { Info } from 'lucide-react';
import Link from 'next/link';
import type { PlayerOption } from '@/app/admin/actions';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import DepositReviewActions from '@/components/admin/DepositReviewActions';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import PeriodField from '@/components/admin/PeriodField';
import Pagination from '@/components/admin/Pagination';
import PlayerCombobox from '@/components/admin/PlayerCombobox';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import {
  DEPOSIT_STATUS_LABELS,
  WALLET_MOVEMENTS,
  type WalletMovementKind,
  type WalletMovementsQuery,
  walletMovementsHref,
} from '@/lib/admin/wallet-movements-query';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate, formatDateTime } from '@/lib/datetime';
import { maskCpfInput } from '@/lib/masks';

interface WalletMovementsPageProps {
  kind: WalletMovementKind;
  query: WalletMovementsQuery;
  /** Hoje (YYYY-MM-DD, Brasília): maior data do filtro e base dos atalhos. */
  today: string;
  promoters: AdminPromoterOption[] | null;
  /** Apostador escolhido no filtro (nome para o campo). */
  player: PlayerOption | null;
  /** Depósitos do filtro (só em Depósitos, depois de pesquisar); 'error' = a API não respondeu. */
  deposits?: AdminDepositList | 'error' | null;
  /** Gerente: libera ou recusa depósitos em análise (pagos por outro titular). */
  canReview?: boolean;
}

const DESTINATION_LABELS = { LOTTERIES: 'Loterias', GAMES: 'Games' } as const;

const STATUS_STYLES: Record<DepositStatus, string> = {
  PENDING: 'border-amber-300 bg-amber-50 text-amber-700',
  PAID: 'border-admin-success/25 bg-admin-success/10 text-admin-success',
  EXPIRED: 'border-admin-border bg-admin-hover text-admin-muted',
  CANCELED: 'border-admin-danger/25 bg-admin-danger/10 text-admin-danger',
  REVIEW: 'border-orange-300 bg-orange-50 text-orange-700',
  REJECTED: 'border-admin-danger/25 bg-admin-danger/10 text-admin-danger',
};

const REVIEW_REASON_LABELS = {
  PAYER_MISMATCH: 'Pago por outro titular',
  PAYER_UNKNOWN: 'Pagador não informado pelo gateway',
} as const;

/** CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00). */
const formatDocument = (digits: string) =>
  digits.length === 14
    ? `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
    : maskCpfInput(digits);

const cellClass = 'px-3 py-3 first:pl-0 last:pr-0';

/** Filtro de um cadastro que ainda não existe: igual aos outros, mas sem nome (não vai para a URL). */
const UNAVAILABLE = 'Cadastro ainda não disponível.';

/**
 * Carteira > Depósitos / Saques: filtros (apostador, status, período, promotor) e, depois de pesquisar, a lista.
 * Depósitos vêm da integração de pagamento (Recarga Pix); os saques ainda não são registrados: a lista vem vazia, com
 * o aviso. Componente de servidor.
 */
export default function WalletMovementsPage({
  kind,
  query,
  today,
  promoters,
  player,
  deposits = null,
  canReview = false,
}: WalletMovementsPageProps) {
  const config = WALLET_MOVEMENTS[kind];
  const idPrefix = `movements-${kind}`;

  return (
    <div className="space-y-6">
      <AdminPageTitle title={config.title} />
      <FiltersCard>
        <FilterForm action={config.href} aria-label={`Filtrar ${config.title.toLowerCase()}`}>
          <div className="grid items-end gap-4 md:grid-cols-2">
            <PlayerCombobox
              id={`${idPrefix}-player`}
              label="Apostador"
              name="apostador"
              initial={player}
              placeholder="Selecione um apostador"
            />
            <FilterSelect id={`${idPrefix}-status`} label="Status" name="status" defaultValue={query.status}>
              <option value="">Todos</option>
              {config.statuses.map((status) => (
                <option key={status.param} value={status.param}>
                  {status.label}
                </option>
              ))}
            </FilterSelect>
          </div>
          <div className="mt-4">
            <PeriodField
              label="Período (Data Início / Data Fim)"
              fromName="de"
              toName="ate"
              from={query.from}
              to={query.to}
              today={today}
            />
          </div>
          <div className="mt-4 grid items-end gap-4 md:grid-cols-2">
            <FilterSelect id={`${idPrefix}-promoter`} label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id={`${idPrefix}-section`} label="Seção" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id={`${idPrefix}-route`} label="Rota" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect
              id={`${idPrefix}-billing-group`}
              label="Grupo de Cobrança"
              defaultValue=""
              title={UNAVAILABLE}
            >
              <option value="">Todos</option>
            </FilterSelect>
          </div>
          <FilterActions clearHref={config.href} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-label="Resultados"
        className="rounded-lg border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        {!query.searched ? (
          <p className="px-4 py-14 text-center text-[15px] text-admin-muted">
            Para visualizar os dados, por favor, aplique um filtro no painel acima.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 px-4 pt-5">
              <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
                Período:{' '}
                <strong className="font-semibold text-admin-text">
                  {query.from === query.to
                    ? formatCalendarDate(query.from)
                    : `${formatCalendarDate(query.from)} – ${formatCalendarDate(query.to)}`}
                </strong>
              </span>
              {deposits && deposits !== 'error' && (
                <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
                  Total pago:{' '}
                  <strong className="font-semibold text-admin-success tabular-nums">
                    {formatBrl(deposits.paidTotalCents)}
                  </strong>
                </span>
              )}
            </div>
            <div className="mx-4 mt-4 overflow-x-auto border-t border-admin-border">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <caption className="sr-only">{config.title}</caption>
                <thead>
                  <tr className="border-b border-admin-border text-[13px] text-admin-muted">
                    {config.columns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className={`px-3 py-3 font-medium first:pl-0 last:pr-0 ${column === 'Valor' ? 'text-right' : ''}`}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                {deposits && deposits !== 'error' && deposits.items.length > 0 && (
                  <tbody>
                    {deposits.items.map((item) => (
                      <tr key={item.id} className="border-b border-admin-border last:border-0">
                        <td className={`${cellClass} whitespace-nowrap tabular-nums`}>
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className={cellClass}>
                          <Link href={ADMIN_ROUTES.user(item.user.id)} className="font-medium text-admin-accent">
                            {item.user.displayId} - {item.user.name}
                          </Link>
                        </td>
                        <td className={cellClass}>
                          {item.payerMatches === null ? (
                            <span className="text-admin-muted">—</span>
                          ) : (
                            <span className={item.payerMatches ? 'text-admin-muted' : 'font-medium text-admin-danger'}>
                              {item.payerMatches
                                ? 'Titular'
                                : item.payer
                                  ? `${item.payer.name ?? 'Outro titular'} · ${formatDocument(item.payer.document)}`
                                  : 'Outro titular'}
                            </span>
                          )}
                        </td>
                        <td className={cellClass}>{DESTINATION_LABELS[item.destination]}</td>
                        <td className={cellClass}>{PAYMENT_GATEWAY_INFO[item.gateway].label}</td>
                        <td className={`${cellClass} whitespace-nowrap text-right font-medium tabular-nums`}>
                          {formatBrl(item.amountCents)}
                        </td>
                        <td className={cellClass}>
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium ${STATUS_STYLES[item.status]}`}
                          >
                            {DEPOSIT_STATUS_LABELS[item.status]}
                          </span>
                          {item.reviewReason && (
                            <span className="mt-1 block text-[12px] text-admin-muted">
                              {REVIEW_REASON_LABELS[item.reviewReason]}
                              {item.reviewedBy &&
                                ` · ${item.status === 'PAID' ? 'liberado' : 'recusado'} por ${item.reviewedBy.name}`}
                            </span>
                          )}
                          {item.status === 'REVIEW' && canReview && (
                            <div className="mt-2">
                              <DepositReviewActions
                                depositId={item.id}
                                amountCents={item.amountCents}
                                playerName={item.user.name}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
              {deposits === 'error' ? (
                <p role="alert" className="py-10 text-center text-[14px] text-admin-danger">
                  Não foi possível carregar os depósitos. Tente novamente.
                </p>
              ) : (
                (!deposits || deposits.items.length === 0) && (
                  <p className="py-10 text-center text-[14px] text-admin-muted">Nenhum resultado encontrado</p>
                )
              )}
            </div>
            {deposits && deposits !== 'error' && deposits.total > 0 && (
              <Pagination
                hrefFor={(page) => walletMovementsHref(kind, { ...query, page })}
                page={deposits.page}
                totalPages={Math.max(1, Math.ceil(deposits.total / deposits.pageSize))}
                total={deposits.total}
                pageSize={deposits.pageSize}
                unit={['depósito', 'depósitos']}
              />
            )}
            {kind === 'withdrawals' && (
              <p className="flex items-start gap-2 px-6 pb-5 text-[12.5px] text-admin-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Os pedidos de {config.noun} ainda não são registrados no sistema: dependem da integração de pagamento.
                </span>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
