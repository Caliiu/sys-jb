import type {
  AdminCasinoClosing,
  CasinoClosingDetail,
  CasinoClosingMonth,
  CasinoClosingRow,
  CasinoClosingStatus,
  CasinoClosingTotals,
} from '@sysjb/contracts';
import { CalendarCheck, CalendarClock, Info } from 'lucide-react';
import Link from 'next/link';
import AdminBox from '@/components/admin/AdminBox';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import CasinoClosingPayButton from '@/components/admin/CasinoClosingPayButton';
import { smallButtonClass } from '@/components/admin/filter-styles';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { casinoClosingHref, formatClosingMonth } from '@/lib/admin/casino-closing-query';
import { formatCommission } from '@/lib/admin/commission';
import { formatBrl } from '@/lib/currency';
import { formatDateTime } from '@/lib/datetime';

interface CasinoClosingPageProps {
  data: AdminCasinoClosing;
  /** O operador pode pagar (Gerente); os outros só consultam. */
  canPay: boolean;
}

/** Colunas de valores, na ordem da tela (os nomes do Geral cassino). */
const MONEY_COLUMNS: ReadonlyArray<{ key: keyof CasinoClosingTotals; label: string }> = [
  { key: 'turnoverCents', label: 'Turnover' },
  { key: 'payoutCents', label: 'Payout' },
  { key: 'ggrCents', label: 'GGR' },
  { key: 'commissionCents', label: 'Comissão' },
];

const STATUS_LABELS: Record<CasinoClosingStatus, string> = {
  open: 'Em andamento',
  pending: 'A pagar',
  paid: 'Pago',
  blocked: 'Bloqueado',
  none: 'Sem comissão',
};

const STATUS_STYLES: Record<CasinoClosingStatus, string> = {
  open: 'border-admin-border bg-admin-hover text-admin-muted',
  pending: 'border-admin-accent/25 bg-admin-accent/10 text-admin-accent',
  paid: 'border-admin-success/25 bg-admin-success/10 text-admin-success',
  blocked: 'border-admin-danger/25 bg-admin-danger/10 text-admin-danger',
  none: 'border-admin-border bg-admin-surface text-admin-muted',
};

const signed = (cents: number) => (cents < 0 ? 'text-admin-danger' : '');
const promotersText = (count: number) => (count === 1 ? '1 promotor' : `${count} promotores`);

function ClosingStatus({ row }: { row: CasinoClosingRow }) {
  return (
    <span
      title={row.paidAt ? `Pago em ${formatDateTime(row.paidAt)}` : undefined}
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[12px] font-medium ${STATUS_STYLES[row.status]}`}
    >
      {STATUS_LABELS[row.status]}
    </span>
  );
}

/** Card de um mês: valores do mês, o que já foi pago e o que falta, e o atalho para o detalhamento. */
function MonthCard({ card, kind, selected }: { card: CasinoClosingMonth; kind: string; selected: boolean }) {
  const Icon = card.ended ? CalendarCheck : CalendarClock;
  const label = formatClosingMonth(card.month);
  const rows: Array<[string, number]> = [
    ['Turnover', card.totals.turnoverCents],
    ['Payout', card.totals.payoutCents],
    ['GGR', card.totals.ggrCents],
    [card.ended ? 'Comissão do mês' : 'Comissão parcial', card.totals.commissionCents],
  ];
  return (
    <article
      aria-label={`${kind}: ${label}`}
      className={`rounded-xl border bg-admin-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        selected ? 'border-admin-accent ring-2 ring-admin-accent/15' : 'border-admin-border'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12.5px] text-admin-muted">{kind}</p>
          <h2 className="mt-0.5 text-[18px] font-semibold capitalize text-admin-text">{label}</h2>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-admin-hover text-admin-muted">
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
      </header>
      <dl className="mt-4 space-y-1.5 text-[13.5px]">
        {rows.map(([name, cents]) => (
          <div key={name} className="flex justify-between gap-3">
            <dt className="text-admin-muted">{name}</dt>
            <dd className={`tabular-nums font-medium ${signed(cents)}`}>{formatBrl(cents)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-admin-border pt-3 text-[12.5px] text-admin-muted">
        {!card.ended
          ? 'Mês em andamento: valores parciais, pagamento depois do fim do mês.'
          : card.pendingCount > 0
            ? `A pagar: ${formatBrl(card.pendingCents)} (${promotersText(card.pendingCount)})` +
              (card.paidCents > 0 ? ` · pago: ${formatBrl(card.paidCents)}` : '')
            : card.paidCents > 0
              ? `Pago: ${formatBrl(card.paidCents)}. Nada pendente.`
              : 'Nenhuma comissão a pagar.'}
      </p>
      <Link
        href={casinoClosingHref(card.month)}
        aria-current={selected ? 'true' : undefined}
        className={`${smallButtonClass} mt-4`}
      >
        {selected ? 'Visualizando' : 'Visualizar'}
      </Link>
    </article>
  );
}

function PromoterLink({ row }: { row: CasinoClosingRow }) {
  return (
    <Link href={ADMIN_ROUTES.user(row.promoter.id)} className="font-medium hover:underline">
      {row.promoter.name}
    </Link>
  );
}

/** Ação da linha: só o Gerente, só quem está a pagar. */
function RowAction({ row, month, canPay }: { row: CasinoClosingRow; month: string; canPay: boolean }) {
  if (!canPay || row.status !== 'pending') return null;
  return (
    <CasinoClosingPayButton
      month={month}
      promoter={{ id: row.promoter.id, name: row.promoter.name }}
      amountCents={row.commissionCents}
    />
  );
}

/** Tabela (desktop) e lista (celular) por promotor, com o total do mês. */
function DetailResults({ detail, canPay }: { detail: CasinoClosingDetail; canPay: boolean }) {
  const { rows, totals, month } = detail;
  if (rows.length === 0) {
    return <p className="py-10 text-center text-[14px] text-admin-muted">Nenhum promotor cadastrado na banca.</p>;
  }
  const withActions = canPay && detail.pendingCount > 0;
  return (
    <>
      <div className="hidden overflow-x-auto md:block print:block">
        <table className="w-full min-w-[920px] text-left text-[13.5px]">
          <caption className="sr-only">Detalhamento por promotor</caption>
          <thead>
            <tr className="border-b border-admin-border text-[13px] text-admin-muted">
              <th scope="col" className="py-3 pr-3 font-medium">
                ID
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Promotor
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                % cassino
              </th>
              <th scope="col" className="px-3 py-3 text-right font-medium">
                Indicados
              </th>
              {MONEY_COLUMNS.map(({ key, label }) => (
                <th key={key} scope="col" className="px-3 py-3 text-right font-medium">
                  {label}
                </th>
              ))}
              <th scope="col" className="px-3 py-3 font-medium">
                Situação
              </th>
              {withActions && (
                <th scope="col" className="py-3 pl-3 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.promoter.id} className="border-b border-admin-border hover:bg-admin-hover/60">
                <td className="py-3 pr-3 tabular-nums text-admin-muted">{row.promoter.displayId}</td>
                <td className="px-3 py-3">
                  <PromoterLink row={row} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCommission(row.casinoCommissionBps)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.referralsCount}</td>
                {MONEY_COLUMNS.map(({ key }) => (
                  <td key={key} className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${signed(row[key])}`}>
                    {formatBrl(row[key])}
                  </td>
                ))}
                <td className="px-3 py-3">
                  <ClosingStatus row={row} />
                </td>
                {withActions && (
                  <td className="py-3 pl-3">
                    <RowAction row={row} month={month} canPay={canPay} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-admin-text">
              <th scope="row" colSpan={4} className="py-3 pr-3">
                Total
              </th>
              {MONEY_COLUMNS.map(({ key }) => (
                <td key={key} className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${signed(totals[key])}`}>
                  {formatBrl(totals[key])}
                </td>
              ))}
              <td colSpan={withActions ? 2 : 1} />
            </tr>
          </tfoot>
        </table>
      </div>

      <ul aria-label="Detalhamento por promotor" className="divide-y divide-admin-border md:hidden print:hidden">
        {rows.map((row) => (
          <li key={row.promoter.id} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <span>
                <span className="tabular-nums text-admin-muted">{row.promoter.displayId}</span> ·{' '}
                <PromoterLink row={row} />
              </span>
              <ClosingStatus row={row} />
            </div>
            <p className="mt-1 text-[12.5px] text-admin-muted">
              {formatCommission(row.casinoCommissionBps)} de cassino · {row.referralsCount} indicado(s)
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
              {MONEY_COLUMNS.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-admin-muted">{label}</dt>
                  <dd className={`tabular-nums ${signed(row[key])}`}>{formatBrl(row[key])}</dd>
                </div>
              ))}
            </dl>
            {withActions && row.status === 'pending' && (
              <div className="mt-2">
                <RowAction row={row} month={month} canPay={canPay} />
              </div>
            )}
          </li>
        ))}
        <li className="py-3 font-semibold">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            {MONEY_COLUMNS.map(({ key, label }) => (
              <div key={key}>
                <dt className="text-admin-muted">Total {label.toLowerCase()}</dt>
                <dd className={`tabular-nums ${signed(totals[key])}`}>{formatBrl(totals[key])}</dd>
              </div>
            ))}
          </dl>
        </li>
      </ul>
    </>
  );
}

/**
 * Relatórios > Cassino > Fechamento cassino: cards do último mês encerrado e do mês em andamento e, ao visualizar um
 * mês, o detalhamento por promotor: % de cassino sobre o GGR (turnover − payout) dos indicados, com o pagamento no
 * saldo de saque (Gerente; um promotor ou todos os pendentes). Componente de servidor; só os botões de pagar rodam no navegador.
 */
export default function CasinoClosingPage({ data, canPay }: CasinoClosingPageProps) {
  const [previous, current] = data.months;
  const { detail } = data;
  const payAll = detail?.ended && detail.pendingCount > 0;

  return (
    <div className="space-y-6">
      <AdminPageTitle title="Fechamento cassino" />
      <div className="mx-auto grid max-w-[1040px] gap-4 md:grid-cols-2">
        <MonthCard card={previous} kind="Mês anterior" selected={detail?.month === previous.month} />
        <MonthCard card={current} kind="Mês atual" selected={detail?.month === current.month} />
      </div>

      <AdminBox
        title="Detalhamento por promotor"
        actions={
          canPay && (
            <CasinoClosingPayButton
              month={detail?.month ?? previous.month}
              amountCents={detail?.pendingCents ?? 0}
              count={detail?.pendingCount ?? 0}
              disabled={!payAll}
            />
          )
        }
      >
        <div className="px-4 pb-4 pt-3 md:px-6 md:pb-6">
          {detail ? (
            <>
              <span className="inline-block rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
                Mês:{' '}
                <strong className="font-semibold capitalize text-admin-text">
                  {formatClosingMonth(detail.month)}
                </strong>
                {detail.ended ? ' (encerrado)' : ' (em andamento: parcial)'}
              </span>
              <div className="mt-4 border-t border-admin-border">
                <DetailResults detail={detail} canPay={canPay} />
              </div>
              <p className="mt-4 flex items-start gap-2 text-[12.5px] text-admin-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Turnover = apostado pelos indicados do promotor no mês; payout = prêmios; GGR = turnover − payout.
                  Comissão = % de cassino do promotor sobre o GGR (GGR negativo não paga), creditada no saldo de saque (prêmios). Só mês
                  encerrado pode ser pago; promotor bloqueado não recebe.
                </span>
              </p>
            </>
          ) : (
            <p className="py-12 text-center text-[15px] text-admin-muted">
              Carregue ou visualize os dados de um mês nos cards acima.
            </p>
          )}
        </div>
      </AdminBox>
    </div>
  );
}
