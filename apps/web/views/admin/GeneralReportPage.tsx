import type {
  AdminGeneralReport,
  AdminGeneralReportRow,
  AdminPromoterOption,
  GeneralReportSort,
  GeneralReportType,
} from '@sysjb/contracts';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import Link from 'next/link';
import type { PlayerOption } from '@/app/admin/actions';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import Pagination from '@/components/admin/Pagination';
import PeriodField from '@/components/admin/PeriodField';
import PlayerCombobox from '@/components/admin/PlayerCombobox';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { type GeneralReportQuery, generalReportHref, sortHref, sortParamOf } from '@/lib/admin/general-report-query';
import { DEFAULT_PAGE_SIZE } from '@/lib/admin/page-size';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate } from '@/lib/datetime';

interface GeneralReportPageProps {
  query: GeneralReportQuery;
  /** Hoje (YYYY-MM-DD, Brasília): maior data do filtro e base dos atalhos. */
  today: string;
  promoters: AdminPromoterOption[] | null;
  /** Apostador escolhido no filtro (nome para o campo). */
  player: PlayerOption | null;
  report: AdminGeneralReport;
}

const TYPE_LABELS: Record<GeneralReportType, string> = { player: 'Apostador', promoter: 'Promotor' };

/** Filtro de um cadastro que ainda não existe: igual aos outros, mas sem nome (não vai para a URL). */
const UNAVAILABLE = 'Cadastro ainda não disponível.';

type MoneyKey = Exclude<keyof AdminGeneralReportRow, 'player' | 'type'>;

/** Colunas de valores, na ordem da tela; `sort` = ordenável (o Líquido Geral não ordena, como na referência). */
const MONEY_COLUMNS: ReadonlyArray<{ key: MoneyKey; label: string; sort?: GeneralReportSort; hint?: string }> = [
  { key: 'salesCents', label: 'Vendas', sort: 'sales' },
  { key: 'commissionCents', label: 'Comissão', sort: 'commission' },
  { key: 'referralCommissionCents', label: 'Comissão Amigo', sort: 'referralCommission' },
  { key: 'prizesCents', label: 'Prêmios', sort: 'prizes' },
  {
    key: 'otherCents',
    label: 'Outros',
    sort: 'other',
    hint: 'Créditos e ajustes feitos pelo painel no período (saldo, bônus e games).',
  },
  { key: 'netCents', label: 'Líquido', sort: 'net' },
  { key: 'grossNetCents', label: 'Líquido Geral' },
];

const signed = (cents: number) => (cents < 0 ? 'text-admin-danger' : '');

/** Cabeçalho que ordena: link que inverte a direção; as setas mostram a ordem atual (a ativa em destaque). */
function SortHeader({
  query,
  sort,
  label,
  hint,
  align = 'right',
}: {
  query: GeneralReportQuery;
  sort?: GeneralReportSort;
  label: string;
  hint?: string;
  align?: 'left' | 'right';
}) {
  const text = hint ? (
    <span title={hint} className="underline decoration-dotted underline-offset-2">
      {label}
    </span>
  ) : (
    label
  );
  if (!sort) {
    return (
      <th scope="col" className={`px-3 py-3 font-medium ${align === 'right' ? 'text-right' : ''}`}>
        {text}
      </th>
    );
  }
  const active = query.sort === sort;
  const ariaSort = active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={`px-3 py-3 font-medium ${align === 'right' ? 'text-right' : ''}`}>
      <Link
        href={sortHref(query, sort)}
        className={`inline-flex items-center gap-1 hover:text-admin-text ${active ? 'text-admin-text' : ''}`}
      >
        {text}
        <span className="flex flex-col" aria-hidden>
          <ArrowUp className={`-mb-1 h-3 w-3 ${active && query.dir === 'asc' ? 'text-admin-text' : 'opacity-40'}`} />
          <ArrowDown className={`h-3 w-3 ${active && query.dir === 'desc' ? 'text-admin-text' : 'opacity-40'}`} />
        </span>
      </Link>
    </th>
  );
}

function PlayerLink({ row }: { row: AdminGeneralReportRow }) {
  return (
    <Link href={ADMIN_ROUTES.user(row.player.id)} className="font-medium hover:underline">
      {row.player.name}
    </Link>
  );
}

/**
 * Relatórios > Relatório geral: uma linha por usuário com movimento no período (vendas, comissões, prêmios, outros e os
 * líquidos, do ponto de vista da banca), ordenável e paginado. Abre em hoje. Componente de servidor.
 */
export default function GeneralReportPage({ query, today, promoters, player, report }: GeneralReportPageProps) {
  const range = `${formatCalendarDate(report.from)} – ${formatCalendarDate(report.to)}`;

  return (
    <div className="space-y-6">
      <AdminPageTitle title="Relatório geral" />
      <FiltersCard>
        <FilterForm action={ADMIN_ROUTES.generalReport} aria-label="Filtrar relatório geral">
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PeriodField label="Período" fromName="de" toName="ate" from={query.from} to={query.to} today={today} />
            <FilterSelect id="report-promoter" label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
            <PlayerCombobox id="report-player" label="Apostador" name="apostador" initial={player} />
          </div>
          <div className="mt-4 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              id="report-type"
              label="Tipo"
              name="tipo"
              defaultValue={query.type === 'promoter' ? 'promotor' : query.type === 'player' ? 'apostador' : ''}
            >
              <option value="">Todos</option>
              <option value="apostador">Apostador</option>
              <option value="promotor">Promotor</option>
            </FilterSelect>
            <FilterSelect id="report-section" label="Seção" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id="report-route" label="Rota" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id="report-billing-group" label="Grupo de Cobrança" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todos</option>
            </FilterSelect>
          </div>
          {/* A ordem escolhida continua valendo numa nova pesquisa. */}
          {(query.sort !== 'sales' || query.dir !== 'desc') && (
            <>
              <input type="hidden" name="ordem" value={sortParamOf(query.sort)} />
              <input type="hidden" name="dir" value={query.dir} />
            </>
          )}
          {query.pageSize !== DEFAULT_PAGE_SIZE && <input type="hidden" name="pageSize" value={query.pageSize} />}
          <FilterActions clearHref={ADMIN_ROUTES.generalReport} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-label="Resultados"
        className="rounded-lg border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <div className="px-4 pt-5">
          <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
            Período: <strong className="font-semibold text-admin-text">{range}</strong>
          </span>
        </div>

        <div className="mx-4 mt-4 border-t border-admin-border">
          <div className="hidden overflow-x-auto md:block print:block">
            <table className="w-full min-w-[1040px] text-left text-[13.5px]">
              <caption className="sr-only">Relatório geral</caption>
              <thead>
                <tr className="border-b border-admin-border text-[13px] text-admin-muted">
                  <th scope="col" className="py-3 pr-3 font-medium">
                    ID
                  </th>
                  <SortHeader query={query} sort="name" label="Apostador" align="left" />
                  <SortHeader query={query} sort="type" label="Tipo" align="left" />
                  {MONEY_COLUMNS.map((column) => (
                    <SortHeader
                      key={column.key}
                      query={query}
                      sort={column.sort}
                      label={column.label}
                      hint={column.hint}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.items.map((row) => (
                  <tr key={row.player.id} className="border-b border-admin-border hover:bg-admin-hover/60">
                    <td className="py-3 pr-3 tabular-nums text-admin-muted">{row.player.displayId}</td>
                    <td className="px-3 py-3">
                      <PlayerLink row={row} />
                    </td>
                    <td className="px-3 py-3">{TYPE_LABELS[row.type]}</td>
                    {MONEY_COLUMNS.map(({ key }) => (
                      <td
                        key={key}
                        className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${signed(row[key])} ${
                          key === 'grossNetCents' ? 'font-semibold' : ''
                        }`}
                      >
                        {formatBrl(row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul aria-label="Relatório geral" className="divide-y divide-admin-border md:hidden print:hidden">
            {report.items.map((row) => (
              <li key={row.player.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="tabular-nums text-admin-muted">{row.player.displayId}</span> ·{' '}
                    <PlayerLink row={row} />
                  </span>
                  <span className="text-[13px] text-admin-muted">{TYPE_LABELS[row.type]}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                  {MONEY_COLUMNS.map(({ key, label }) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-admin-muted">{label}</dt>
                      <dd className={`tabular-nums ${signed(row[key])}`}>{formatBrl(row[key])}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>

          {report.items.length === 0 && (
            <p className="py-10 text-center text-[14px] text-admin-muted">Nenhum resultado encontrado</p>
          )}
        </div>

        <Pagination
          hrefFor={(page) => generalReportHref({ ...query, page })}
          page={report.page}
          totalPages={report.totalPages}
          total={report.total}
          pageSize={report.pageSize}
        />

        <p className="flex items-start gap-2 px-6 pb-5 text-[12.5px] text-admin-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Do ponto de vista da banca. Vendas pela data da venda; comissões pelo fechamento do mês; prêmios pela
            apuração. Líquido = vendas − prêmios − comissões; Líquido Geral = Líquido − Outros.
          </span>
        </p>
      </section>
    </div>
  );
}
