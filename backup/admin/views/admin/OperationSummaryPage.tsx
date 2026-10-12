import type { AdminOperationSummary, AdminPromoterOption, OperationGameTotals } from '@sysjb/contracts';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import PeriodField from '@/components/admin/PeriodField';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import type { OperationSummaryQuery } from '@/lib/admin/operation-summary-query';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate } from '@/lib/datetime';

interface OperationSummaryPageProps {
  query: OperationSummaryQuery;
  /** Hoje (YYYY-MM-DD, Brasília): maior data do filtro e base dos atalhos. */
  today: string;
  promoters: AdminPromoterOption[] | null;
  summary: AdminOperationSummary;
}

/** O que ainda não tem origem no sistema (vem zerado), para a nota no fim. */
const UNAVAILABLE_TEXT: Record<AdminOperationSummary['unavailable'][number], string> = {
  deposits: 'depósitos (e o primeiro depósito)',
  withdrawals: 'saques',
  casino: 'cassino',
};

const percent = (bps: number) =>
  `${(bps / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = `summary-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col rounded-lg border border-admin-border bg-admin-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <h2 id={id} className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-admin-muted">
        {title}
      </h2>
      <dl className="flex-1 space-y-2">{children}</dl>
    </section>
  );
}

/** Linha "rótulo ... valor"; `total` = linha de fechamento (separada por um traço, em negrito). */
function Row({
  label,
  value,
  total = false,
  tone,
}: {
  label: string;
  value: string;
  total?: boolean;
  tone?: 'success' | 'danger';
}) {
  const color = tone === 'success' ? 'text-admin-success' : tone === 'danger' ? 'text-admin-danger' : 'text-admin-text';
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${total ? 'mt-3 border-t border-admin-border pt-3' : ''}`}
    >
      <dt className={`text-[14px] ${total ? 'font-semibold text-admin-text' : 'text-admin-muted'}`}>{label}</dt>
      <dd className={`tabular-nums ${total ? 'text-[18px] font-bold' : 'text-[15px] font-semibold'} ${color}`}>
        {value}
      </dd>
    </div>
  );
}

const netTone = (cents: number) => (cents < 0 ? 'danger' : 'success');

function GameCard({ title, totals }: { title: string; totals: OperationGameTotals }) {
  return (
    <Card title={title}>
      <Row label="Turnover" value={formatBrl(totals.turnoverCents)} />
      <Row label="Payout" value={formatBrl(totals.payoutCents)} />
      <Row label="Líquido" value={formatBrl(totals.netCents)} total />
    </Card>
  );
}

/**
 * Operação > Resumo da Operação: filtros (período e promotor) e os números da banca no período: novos usuários,
 * movimentação financeira, saldos (de agora), resultado, Loterias e Cassino. Componente de servidor.
 */
export default function OperationSummaryPage({ query, today, promoters, summary }: OperationSummaryPageProps) {
  const { newUsers, cashflow, balances, result } = summary;
  const range =
    summary.from === summary.to
      ? formatCalendarDate(summary.from)
      : `${formatCalendarDate(summary.from)} – ${formatCalendarDate(summary.to)}`;
  const promoterName = summary.promoter ? `${summary.promoter.displayId} - ${summary.promoter.name}` : 'Todos';
  const missing = summary.unavailable.map((item) => UNAVAILABLE_TEXT[item]);

  return (
    <div className="space-y-6">
      <AdminPageTitle title="Resumo da Operação" />
      <FiltersCard>
        <FilterForm action={ADMIN_ROUTES.operationSummary} aria-label="Filtrar resumo da operação">
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PeriodField label="Período" fromName="de" toName="ate" from={query.from} to={query.to} today={today} />
            <FilterSelect id="summary-promoter" label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
          </div>
          <FilterActions clearHref={ADMIN_ROUTES.operationSummary} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-label="Resumo"
        className="rounded-lg border border-admin-border bg-admin-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <span className="inline-block rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
          Período: <strong className="font-semibold text-admin-text">{range}</strong>
        </span>
        <p className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 border-y border-admin-border py-3 text-[14px] text-admin-muted">
          <span>
            <strong className="font-semibold text-admin-text">Período:</strong> {formatCalendarDate(summary.from)} até{' '}
            {formatCalendarDate(summary.to)}
          </span>
          <span>
            <strong className="font-semibold text-admin-text">Promotor:</strong> {promoterName}
          </span>
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section
            aria-labelledby="summary-new-users"
            className="rounded-lg border border-admin-border bg-admin-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <h2
              id="summary-new-users"
              className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-admin-muted"
            >
              Novos Usuários
            </h2>
            <div className="flex items-center gap-4">
              <div className="flex shrink-0 flex-col items-center">
                <span
                  aria-hidden
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-admin-accent text-[24px] font-bold tabular-nums text-white"
                >
                  {newUsers.signups.toLocaleString('pt-BR')}
                </span>
                <span className="mt-1.5 text-[12px] text-admin-muted">Cadastros</span>
              </div>
              <dl className="flex-1 space-y-2">
                <div className="sr-only">
                  <dt>Cadastros</dt>
                  <dd>{newUsers.signups}</dd>
                </div>
                <Row label="FTD" value={newUsers.firstDeposits.toLocaleString('pt-BR')} />
                <Row label="% FTD" value={percent(newUsers.firstDepositRateBps)} />
                <Row label="Média" value={formatBrl(newUsers.firstDepositAverageCents)} total />
              </dl>
            </div>
          </section>

          <Card title="Movimentação Financeira">
            <Row label="Total Depósito" value={formatBrl(cashflow.depositsCents)} />
            <Row label="Total Saque" value={formatBrl(cashflow.withdrawalsCents)} />
            <Row label="Saldo" value={formatBrl(cashflow.netCents)} total />
          </Card>

          <Card title="Saldos">
            <Row label="Disponível para Saques" value={formatBrl(balances.withdrawableCents)} />
            <Row label="Saldo Total" value={formatBrl(balances.totalCents)} />
            <Row label="Lançamento Creditado" value={formatBrl(balances.creditedCents)} />
            <Row label="Bônus Creditado" value={formatBrl(balances.bonusCreditedCents)} />
          </Card>

          <Card title="Resultado">
            <Row label="Total Jogado" value={formatBrl(result.wageredCents)} />
            <Row label="Total Prêmios" value={formatBrl(result.prizesCents)} />
            <Row label="Bruto" value={formatBrl(result.grossCents)} />
            <Row label="Comissão" value={formatBrl(result.commissionCents)} />
            <Row label="Líquido" value={formatBrl(result.netCents)} total tone={netTone(result.netCents)} />
          </Card>

          <GameCard title="Loterias" totals={summary.lotteries} />
          <GameCard title="Cassino" totals={summary.casino} />
        </div>

        <p className="mt-4 flex items-start gap-2 text-[12.5px] text-admin-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Saldos são os de agora. Jogado pela data da venda; prêmios pela apuração.
            {missing.length > 0 && <> Ainda sem registro no sistema (aparecem zerados): {missing.join(', ')}.</>}
          </span>
        </p>
      </section>
    </div>
  );
}
