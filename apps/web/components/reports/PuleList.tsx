import { PULE_LIST_LIMIT, type PuleList as PuleListData } from '@sysjb/contracts';
import Link from 'next/link';
import { formatBrl } from '@/lib/currency';
import { formatShortCalendarDate, formatShortDateTime } from '@/lib/datetime';
import { puleReceipt } from '@/lib/routes';

const card = 'rounded-xl bg-white px-4 py-3 shadow-sm';

/** Relatórios > Consultar pule > por data: totais do dia e as pules (cada uma abre o recibo). */
export default function PuleList({ data }: { data: PuleListData }) {
  return (
    <div className="space-y-4 px-3 py-3 text-[15px] text-gray-900">
      <dl className={`${card} space-y-2 py-4`}>
        <div className="flex justify-between">
          <dt>Registradas</dt>
          <dd className="tabular-nums">{formatBrl(data.registeredCents)}</dd>
        </div>
        <div className="flex justify-between text-red-500">
          <dt>Canceladas</dt>
          <dd className="tabular-nums">{formatBrl(data.canceledCents)}</dd>
        </div>
      </dl>

      {data.pules.length === 0 ? (
        <p className={`${card} py-4 text-gray-600`}>Nenhuma pule neste dia.</p>
      ) : (
        <ul aria-label="Pules" className="space-y-2">
          {data.pules.map((pule) => (
            <li key={pule.puleNumber}>
              <Link
                href={puleReceipt(pule.puleNumber, data.date)}
                aria-label={`Pule #${pule.puleNumber}, ${formatBrl(pule.totalCents)}`}
                className={`${card} block space-y-1 active:scale-[0.99] transition-transform`}
              >
                <span className="flex justify-between gap-3">
                  <span className="font-medium tabular-nums">#{pule.puleNumber}</span>
                  <span className="tabular-nums">{formatShortDateTime(pule.createdAt).replace(' ', ' - ')}</span>
                </span>
                <span className="flex justify-between gap-3 text-[13px] text-gray-500">
                  <span>{pule.code}</span>
                  <span className="tabular-nums">Vale {formatShortCalendarDate(pule.drawDate)}</span>
                </span>
                <span className="flex justify-between gap-3">
                  <span className="text-green-600">Registrada</span>
                  <span className="font-bold tabular-nums">{formatBrl(pule.totalCents)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data.truncated && (
        <p className="px-1 text-[13px] text-gray-600">
          Mostrando as {PULE_LIST_LIMIT} pules mais recentes do dia (os totais contam todas).
        </p>
      )}
    </div>
  );
}
