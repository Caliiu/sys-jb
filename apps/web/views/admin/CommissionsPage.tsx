import type {
  AdminCommissionClosing,
  AdminCommissionMonth,
  AdminCommissionSettings,
  CommissionPayoutStatus,
} from '@sysjb/contracts';
import Link from 'next/link';
import CloseMonthButton from '@/components/admin/CloseMonthButton';
import ReferralRateForm from '@/components/admin/ReferralRateForm';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatCommission } from '@/lib/admin/commission';
import { commissionsHref, monthLabel } from '@/lib/admin/commissions-query';
import { formatBrl } from '@/lib/currency';
import { formatDateTime } from '@/lib/datetime';

interface CommissionsPageProps {
  settings: AdminCommissionSettings;
  data: AdminCommissionMonth;
  closings: AdminCommissionClosing[];
  /** Meses do seletor (AAAA-MM), mais recentes primeiro. */
  months: string[];
  /** Pode alterar a % e fechar o mês. */
  canManage: boolean;
}

const cardClass = 'rounded-xl bg-admin-surface p-5 shadow-admin';
const fieldClass =
  'h-10 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';
const HEADERS = ['Quem indicou', 'Tipo', 'Apostado pelos indicados', 'Percentual', 'Ganho', 'Situação'];

const STATUS_LABEL: Record<'open' | 'closed', Record<CommissionPayoutStatus, string>> = {
  open: { PAID: 'A pagar', BLOCKED: 'Bloqueado: não recebe', ZERO: 'Sem ganho' },
  closed: { PAID: 'Pago no Saldo', BLOCKED: 'Bloqueado: não recebeu', ZERO: 'Sem ganho' },
};

/**
 * Comissões: "Indique e ganhe" (X% da banca) + promotor (Y% de cada um), sobre o valor apostado pelos
 * indicados, pagas no Saldo no fechamento mensal. Componente de servidor.
 */
export default function CommissionsPage({ settings, data, closings, months, canManage }: CommissionsPageProps) {
  const phase = data.closed ? 'closed' : 'open';
  const beneficiaries = data.rows.filter((r) => r.status === 'PAID').length;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[18px] font-bold text-admin-text">Comissões</h1>

      <section aria-labelledby="referral-title" className={cardClass}>
        <h2 id="referral-title" className="text-[14px] font-bold text-admin-text">
          Indique e ganhe
        </h2>
        <p className="mt-1 text-[12.5px] text-admin-muted">
          Quem indica um jogador ganha este percentual sobre tudo o que o indicado apostar. Se quem indicou for
          promotor, soma a comissão dele de promotor (ex.: 3% + 7% = 10%). Pago no Saldo no fechamento do mês.
        </p>
        <div className="mt-4">
          {canManage ? (
            <ReferralRateForm referralCommissionBps={settings.referralCommissionBps} />
          ) : (
            <p className="text-[13.5px] text-admin-text">
              Percentual atual: <strong>{formatCommission(settings.referralCommissionBps)}</strong>
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="month-title" className="overflow-hidden rounded-xl bg-admin-surface shadow-admin">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="month-title" className="text-[14px] font-bold text-admin-text first-letter:uppercase">
              {monthLabel(data.month)}
            </h2>
            <p className="mt-1 text-[12.5px] text-admin-muted">
              {data.closed
                ? `Fechado em ${formatDateTime(data.closed.closedAt)} por ${data.closed.operatorName}.`
                : data.canClose
                  ? 'Prévia com os percentuais de hoje. Nada foi pago ainda.'
                  : 'Mês em andamento: prévia parcial (só pode ser fechado depois que terminar).'}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <form method="get" action={ADMIN_ROUTES.commissions} className="flex gap-2">
              <label htmlFor="commission-month" className="sr-only">
                Mês
              </label>
              <select id="commission-month" name="mes" defaultValue={data.month} className={fieldClass}>
                {months.map((month) => (
                  <option key={month} value={month}>
                    {monthLabel(month)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-10 rounded-lg border border-admin-border px-4 text-[13px] font-semibold text-admin-text"
              >
                Ver
              </button>
            </form>
            {canManage && data.canClose && (
              <CloseMonthButton month={data.month} paidCents={data.totals.paidCents} beneficiaries={beneficiaries} />
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Comissões de {monthLabel(data.month)}</caption>
            <thead>
              <tr className="border-y border-admin-border text-[11.5px] uppercase tracking-wide text-admin-muted">
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={HEADERS.length} className="px-4 py-8 text-center text-admin-muted">
                    Nenhuma aposta de jogadores indicados neste mês.
                  </td>
                </tr>
              )}
              {data.rows.map((row) => (
                <tr key={row.user.id} className="border-b border-admin-border last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={ADMIN_ROUTES.user(row.user.id)}
                      className="font-semibold text-admin-accent hover:underline"
                    >
                      {row.user.name}
                    </Link>
                    <p className="text-[12px] text-admin-muted">ID {row.user.displayId}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.promoterRateBps > 0 ? 'Indicação + Promotor' : 'Indicação'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatBrl(row.wageredCents)}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {row.promoterRateBps > 0
                      ? `${formatCommission(row.referralRateBps)} + ${formatCommission(row.promoterRateBps)} = ${formatCommission(
                          row.referralRateBps + row.promoterRateBps,
                        )}`
                      : formatCommission(row.referralRateBps)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">
                    {formatBrl(row.amountCents)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 ${
                      row.status === 'BLOCKED' ? 'text-admin-danger' : 'text-admin-text'
                    }`}
                  >
                    {STATUS_LABEL[phase][row.status]}
                  </td>
                </tr>
              ))}
            </tbody>
            {data.rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-admin-border font-semibold">
                  <td className="px-4 py-3" colSpan={2}>
                    Total
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatBrl(data.totals.wageredCents)}</td>
                  <td />
                  <td className="px-4 py-3 tabular-nums">{formatBrl(data.totals.paidCents)}</td>
                  <td className="px-4 py-3 text-admin-muted">{data.closed ? 'pago' : 'a pagar'}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section aria-labelledby="closings-title" className={cardClass}>
        <h2 id="closings-title" className="mb-3 text-[14px] font-bold text-admin-text">
          Meses fechados
        </h2>
        {closings.length === 0 ? (
          <p className="text-[13px] text-admin-muted">Nenhum mês fechado ainda.</p>
        ) : (
          <ul className="divide-y divide-admin-border">
            {closings.map((closing) => (
              <li key={closing.month} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                <Link
                  href={commissionsHref(closing.month)}
                  className="font-semibold text-admin-accent first-letter:uppercase hover:underline"
                >
                  {monthLabel(closing.month)}
                </Link>
                <span className="text-admin-muted">
                  {formatBrl(closing.totalPaidCents)} pagos · {closing.operatorName} ·{' '}
                  {formatDateTime(closing.closedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
