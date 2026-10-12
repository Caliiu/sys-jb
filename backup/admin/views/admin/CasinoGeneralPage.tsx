import type {
  AdminCasinoGeneralReport,
  AdminPromoterOption,
  CasinoGeneralRow,
  GeneralReportType,
  OperationGameTotals,
} from '@sysjb/contracts';
import { Info } from 'lucide-react';
import Link from 'next/link';
import type { PlayerOption } from '@/app/admin/actions';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import PeriodField from '@/components/admin/PeriodField';
import PlayerCombobox from '@/components/admin/PlayerCombobox';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { type CasinoGeneralQuery, TYPE_PARAM_OF } from '@/lib/admin/casino-general-query';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate } from '@/lib/datetime';

interface CasinoGeneralPageProps {
  query: CasinoGeneralQuery;
  /** Hoje (YYYY-MM-DD, Brasília): maior data do filtro e base dos atalhos. */
  today: string;
  promoters: AdminPromoterOption[] | null;
  /** Apostador escolhido no filtro (nome para o campo). */
  player: PlayerOption | null;
  /** null = ainda não pesquisou. */
  report: AdminCasinoGeneralReport | null;
}

const TYPE_LABELS: Record<GeneralReportType, string> = { player: 'Apostador', promoter: 'Promotor' };

/** Filtro de um cadastro que ainda não existe: igual aos outros, mas sem nome (não vai para a URL). */
const UNAVAILABLE = 'Cadastro ainda não disponível.';

/** Colunas de valores, na ordem da tela (os nomes do card Cassino do resumo da operação). */
const MONEY_COLUMNS: ReadonlyArray<{ key: keyof OperationGameTotals; label: string }> = [
  { key: 'turnoverCents', label: 'Turnover' },
  { key: 'payoutCents', label: 'Payout' },
  { key: 'netCents', label: 'Líquido' },
];

const signed = (cents: number) => (cents < 0 ? 'text-admin-danger' : '');

function PlayerLink({ row }: { row: CasinoGeneralRow }) {
  return (
    <Link href={ADMIN_ROUTES.user(row.player.id)} className="font-medium hover:underline">
      {row.player.name}
    </Link>
  );
}

/** Tabela (desktop) e lista (celular) por usuário, com o total do período. */
function CasinoGeneralResults({ rows, totals }: Pick<AdminCasinoGeneralReport, 'rows' | 'totals'>) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-[14px] text-admin-muted">Nenhum jogo de cassino no período.</p>;
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block print:block">
        <table className="w-full min-w-[720px] text-left text-[13.5px]">
          <caption className="sr-only">Geral cassino</caption>
          <thead>
            <tr className="border-b border-admin-border text-[13px] text-admin-muted">
              <th scope="col" className="py-3 pr-3 font-medium">
                ID
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Apostador
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Tipo
              </th>
              {MONEY_COLUMNS.map(({ key, label }) => (
                <th key={key} scope="col" className="px-3 py-3 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.player.id} className="border-b border-admin-border hover:bg-admin-hover/60">
                <td className="py-3 pr-3 tabular-nums text-admin-muted">{row.player.displayId}</td>
                <td className="px-3 py-3">
                  <PlayerLink row={row} />
                </td>
                <td className="px-3 py-3">{TYPE_LABELS[row.type]}</td>
                {MONEY_COLUMNS.map(({ key }) => (
                  <td key={key} className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${signed(row[key])}`}>
                    {formatBrl(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-admin-text">
              <th scope="row" colSpan={3} className="py-3 pr-3">
                Total
              </th>
              {MONEY_COLUMNS.map(({ key }) => (
                <td key={key} className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${signed(totals[key])}`}>
                  {formatBrl(totals[key])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <ul aria-label="Geral cassino" className="divide-y divide-admin-border md:hidden print:hidden">
        {rows.map((row) => (
          <li key={row.player.id} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <span>
                <span className="tabular-nums text-admin-muted">{row.player.displayId}</span> · <PlayerLink row={row} />
              </span>
              <span className="text-[13px] text-admin-muted">{TYPE_LABELS[row.type]}</span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-x-4 text-[13px]">
              {MONEY_COLUMNS.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-admin-muted">{label}</dt>
                  <dd className={`tabular-nums ${signed(row[key])}`}>{formatBrl(row[key])}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
        <li className="py-3 font-semibold">
          <dl className="grid grid-cols-3 gap-x-4 text-[13px]">
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
 * Relatórios > Cassino > Geral cassino: filtros (período, promotor, apostador e tipo) e, depois de pesquisar, o
 * cassino de cada usuário no período (turnover, payout e líquido, do ponto de vista da banca). Componente de servidor.
 */
export default function CasinoGeneralPage({ query, today, promoters, player, report }: CasinoGeneralPageProps) {
  return (
    <div className="space-y-6">
      <AdminPageTitle title="Geral cassino" />
      <FiltersCard>
        <FilterForm action={ADMIN_ROUTES.casinoGeneralReport} aria-label="Filtrar geral cassino">
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PeriodField label="Período" fromName="de" toName="ate" from={query.from} to={query.to} today={today} />
            <FilterSelect id="casino-promoter" label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
            <PlayerCombobox id="casino-player" label="Apostador" name="apostador" initial={player} />
          </div>
          <div className="mt-4 grid items-end gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FilterSelect
              id="casino-type"
              label="Tipo"
              name="tipo"
              defaultValue={query.type ? TYPE_PARAM_OF[query.type] : ''}
            >
              <option value="">Todos</option>
              <option value="apostador">Apostador</option>
              <option value="promotor">Promotor</option>
            </FilterSelect>
            <FilterSelect id="casino-section" label="Seção" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id="casino-route" label="Rota" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
          </div>
          <FilterActions clearHref={ADMIN_ROUTES.casinoGeneralReport} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-label="Resultados"
        className="rounded-lg border border-admin-border bg-admin-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:p-6"
      >
        {report ? (
          <>
            <span className="inline-block rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
              Período:{' '}
              <strong className="font-semibold text-admin-text">
                {report.from === report.to
                  ? formatCalendarDate(report.from)
                  : `${formatCalendarDate(report.from)} – ${formatCalendarDate(report.to)}`}
              </strong>
            </span>
            <div className="mt-4 border-t border-admin-border">
              <CasinoGeneralResults rows={report.rows} totals={report.totals} />
            </div>
            <p className="mt-4 flex items-start gap-2 text-[12.5px] text-admin-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Turnover = total apostado; payout = prêmios pagos; líquido = turnover − payout.
                {!report.available && <> O cassino ainda não tem registro no sistema: os valores aparecem zerados.</>}
              </span>
            </p>
          </>
        ) : (
          <p className="py-12 text-center text-[15px] text-admin-muted">
            Para visualizar os dados, por favor, aplique um filtro no painel acima.
          </p>
        )}
      </section>
    </div>
  );
}
