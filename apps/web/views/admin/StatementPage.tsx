import type { AdminPlayerStatement, AdminStatementEntry, StatementKind } from '@sysjb/contracts';
import { Info } from 'lucide-react';
import Link from 'next/link';
import type { PlayerOption } from '@/app/admin/actions';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FiltersCard from '@/components/admin/FiltersCard';
import Pagination from '@/components/admin/Pagination';
import PeriodField from '@/components/admin/PeriodField';
import PlayerCombobox from '@/components/admin/PlayerCombobox';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { DEFAULT_PAGE_SIZE } from '@/lib/admin/page-size';
import { type StatementQuery, statementHref } from '@/lib/admin/statement-query';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate, formatShortDateTime } from '@/lib/datetime';

interface StatementPageProps {
  query: StatementQuery;
  /** Hoje (YYYY-MM-DD, Brasília): maior data do filtro e base dos atalhos. */
  today: string;
  /** Apostador escolhido no filtro (nome para o campo). */
  player: PlayerOption | null;
  /** null = ainda não pesquisou (ou falta escolher o apostador). */
  statement: AdminPlayerStatement | null;
}

export const KIND_LABELS: Record<StatementKind, string> = {
  LOTTERY_BET: 'Aposta Loterias',
  LOTTERY_REFUND: 'Pule cancelada',
  FAZENDINHA_BET: 'Aposta Fazendinha',
  OPERATOR_CREDIT: 'Crédito pelo painel',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
  COMMISSION: 'Comissão',
  COMMISSION_REVERSAL: 'Estorno de comissão',
  OPENING_BALANCE: 'Saldo anterior',
  PRIZE: 'Prêmio',
  CASINO: 'Cassino',
  DEPOSIT: 'Recarga Pix',
  WITHDRAWAL: 'Saque',
  WITHDRAWAL_REFUND: 'Saque devolvido',
};

const BUCKETS: ReadonlyArray<{ key: 'balanceCents' | 'bonusCents' | 'prizesCents' | 'gamesCents'; label: string }> = [
  { key: 'balanceCents', label: 'Saldo' },
  { key: 'bonusCents', label: 'Bônus' },
  { key: 'prizesCents', label: 'Prêmios' },
  { key: 'gamesCents', label: 'Games' },
];

/** Valor do lançamento: entrada em verde, saída em vermelho, zero apagado. */
const tone = (cents: number) =>
  cents > 0 ? 'text-admin-success' : cents < 0 ? 'text-admin-danger' : 'text-admin-muted';

/** O que aparece em "Detalhe": o pule nas apostas; o motivo (e quem creditou) nos outros. */
function detail(entry: AdminStatementEntry): string {
  if (entry.puleNumber !== null) return `Pule #${entry.puleNumber}`;
  const parts = [entry.note, entry.operatorName ? `por ${entry.operatorName}` : null].filter(Boolean);
  return parts.join(' · ');
}

function Chip({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
      {label}: <strong className={`font-semibold tabular-nums text-admin-text ${className}`}>{value}</strong>
    </span>
  );
}

/**
 * Carteira > Extrato apostador: filtros (período e o apostador, obrigatório) e, depois de pesquisar, os lançamentos da
 * carteira, mais recentes primeiro, com a carteira de apostas depois de cada um. Componente de servidor.
 */
export default function StatementPage({ query, today, player, statement }: StatementPageProps) {
  return (
    <div className="space-y-6">
      <AdminPageTitle title="Extrato apostador" />
      <FiltersCard>
        <FilterForm action={ADMIN_ROUTES.statement} aria-label="Filtrar extrato">
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PeriodField label="Período" fromName="de" toName="ate" from={query.from} to={query.to} today={today} />
            <PlayerCombobox id="statement-player" label="Apostador" name="apostador" initial={player} required />
          </div>
          {query.pageSize !== DEFAULT_PAGE_SIZE && <input type="hidden" name="pageSize" value={query.pageSize} />}
          <FilterActions clearHref={ADMIN_ROUTES.statement} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-label="Extrato"
        className="rounded-lg border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        {!statement ? (
          <p className="px-4 py-14 text-center text-[15px] text-admin-muted">
            Para visualizar os dados, por favor, aplique um filtro no painel acima.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 pt-5">
              <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
                Apostador:{' '}
                <Link
                  href={ADMIN_ROUTES.user(statement.player.id)}
                  className="font-semibold text-admin-text hover:underline"
                >
                  {statement.player.displayId} - {statement.player.name}
                </Link>
              </span>
              <Chip
                label="Período"
                value={
                  statement.from === statement.to
                    ? formatCalendarDate(statement.from)
                    : `${formatCalendarDate(statement.from)} – ${formatCalendarDate(statement.to)}`
                }
              />
              <Chip label="Saldo inicial" value={formatBrl(statement.openingCents)} />
              <Chip label="Entradas" value={formatBrl(statement.creditsCents)} className="text-admin-success" />
              <Chip label="Saídas" value={formatBrl(statement.debitsCents)} className="text-admin-danger" />
              <Chip label="Saldo final" value={formatBrl(statement.closingCents)} />
            </div>

            <div className="mx-4 mt-4 border-t border-admin-border">
              {statement.items.length === 0 ? (
                <p className="py-10 text-center text-[14px] text-admin-muted">Nenhum lançamento no período.</p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block print:block">
                    <table className="w-full min-w-[980px] text-left text-[13.5px]">
                      <caption className="sr-only">Lançamentos</caption>
                      <thead>
                        <tr className="border-b border-admin-border text-[13px] text-admin-muted">
                          <th scope="col" className="py-3 pr-3 font-medium">
                            Data/Hora
                          </th>
                          <th scope="col" className="px-3 py-3 font-medium">
                            Lançamento
                          </th>
                          <th scope="col" className="px-3 py-3 font-medium">
                            Detalhe
                          </th>
                          {BUCKETS.map(({ key, label }) => (
                            <th key={key} scope="col" className="px-3 py-3 text-right font-medium">
                              {label}
                            </th>
                          ))}
                          <th scope="col" className="px-3 py-3 text-right font-medium">
                            Total
                          </th>
                          <th scope="col" className="py-3 pl-3 text-right font-medium">
                            Saldo após
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.items.map((entry) => (
                          <tr key={entry.id} className="border-b border-admin-border align-top hover:bg-admin-hover/60">
                            <td className="whitespace-nowrap py-3 pr-3 tabular-nums">
                              {formatShortDateTime(entry.createdAt)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3">{KIND_LABELS[entry.kind]}</td>
                            <td className="px-3 py-3 text-admin-muted">{detail(entry)}</td>
                            {BUCKETS.map(({ key }) => (
                              <td
                                key={key}
                                className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${tone(entry[key])}`}
                              >
                                {entry[key] === 0 ? '—' : formatBrl(entry[key])}
                              </td>
                            ))}
                            <td
                              className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${tone(entry.totalCents)}`}
                            >
                              {formatBrl(entry.totalCents)}
                            </td>
                            <td className="whitespace-nowrap py-3 pl-3 text-right tabular-nums">
                              {formatBrl(entry.balanceAfterCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul aria-label="Lançamentos" className="divide-y divide-admin-border md:hidden print:hidden">
                    {statement.items.map((entry) => (
                      <li key={entry.id} className="py-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{KIND_LABELS[entry.kind]}</span>
                          <span className={`font-semibold tabular-nums ${tone(entry.totalCents)}`}>
                            {formatBrl(entry.totalCents)}
                          </span>
                        </div>
                        {detail(entry) && <p className="mt-0.5 text-[13px] text-admin-muted">{detail(entry)}</p>}
                        <p className="mt-0.5 flex justify-between text-[12.5px] tabular-nums text-admin-muted">
                          <span>{formatShortDateTime(entry.createdAt)}</span>
                          <span>Saldo após {formatBrl(entry.balanceAfterCents)}</span>
                        </p>
                        {entry.gamesCents !== 0 && (
                          <p className="mt-0.5 text-[12.5px] text-admin-muted">
                            Games: <span className={tone(entry.gamesCents)}>{formatBrl(entry.gamesCents)}</span>
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <Pagination
              hrefFor={(page) => statementHref({ ...query, page })}
              page={statement.page}
              totalPages={statement.totalPages}
              total={statement.total}
              pageSize={statement.pageSize}
              unit={['lançamento', 'lançamentos']}
            />

            <p className="flex items-start gap-2 px-6 pb-5 text-[12.5px] text-admin-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Saldos e Total da carteira de apostas (saldo + bônus + prêmios). Games é mostrado à parte e não entra no
                saldo.
              </span>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
