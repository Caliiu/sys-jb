import {
  type AdminPromoterOption,
  CRM_LIMITS,
  type CrmInactiveList,
  type CrmInactiveRow,
  type CrmList,
  type CrmNeverDepositedList,
  type CrmNeverDepositedRow,
} from '@sysjb/contracts';
import { ArrowDown, ArrowUp, Download, Info } from 'lucide-react';
import Link from 'next/link';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import Pagination from '@/components/admin/Pagination';
import { chipClass, controlClass, labelClass, smallButtonClass } from '@/components/admin/filter-styles';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { CRM_TYPE_LABELS } from '@/lib/admin/crm-csv';
import {
  CRM_LIST_CONFIG,
  type CrmQuery,
  type CrmSort,
  DEFAULT_DIR,
  crmExportHref,
  crmHref,
  crmShortcutHref,
  crmSortHref,
  crmSortParam,
  isCrmShortcut,
} from '@/lib/admin/crm-query';
import { DEFAULT_PAGE_SIZE } from '@/lib/admin/page-size';
import { formatBrl } from '@/lib/currency';
import { formatDateTime } from '@/lib/datetime';
import { maskPhoneInput } from '@/lib/masks';

type Row = CrmInactiveRow | CrmNeverDepositedRow;

interface Column<L extends CrmList> {
  label: string;
  /** Sem ordenação: o cabeçalho é só texto. */
  sort?: CrmSort<L>;
  hint?: string;
  align?: 'right';
  cell: (row: L extends 'inactive' ? CrmInactiveRow : CrmNeverDepositedRow) => React.ReactNode;
}

const RELATIONSHIP_HINT = 'Dias desde o cadastro do apostador.';

/** Colunas comuns (nome, tipo, promotor, código e telefone), na ordem da referência. */
function commonColumns<L extends CrmList>(): Column<L>[] {
  return [
    {
      label: 'Nome',
      sort: 'name' as CrmSort<L>,
      cell: (row: Row) => (
        <Link href={ADMIN_ROUTES.user(row.player.id)} className="font-medium text-admin-accent hover:underline">
          {row.player.name}
        </Link>
      ),
    },
    { label: 'Tipo', sort: 'type' as CrmSort<L>, cell: (row: Row) => CRM_TYPE_LABELS[row.type] },
    {
      label: 'Promotor Associado',
      sort: 'promoter' as CrmSort<L>,
      cell: (row: Row) =>
        row.promoter ? (
          <Link href={ADMIN_ROUTES.user(row.promoter.id)} className="hover:underline">
            {row.promoter.displayId} - {row.promoter.name}
          </Link>
        ) : (
          <span className="text-admin-muted">—</span>
        ),
    },
    {
      label: 'Código',
      sort: 'code' as CrmSort<L>,
      cell: (row: Row) => <span className="tabular-nums">{row.player.displayId}</span>,
    },
    {
      label: 'Telefone',
      sort: 'phone' as CrmSort<L>,
      cell: (row: Row) => (
        <a
          href={`https://wa.me/55${row.phone}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp ${maskPhoneInput(row.phone)}`}
          className="whitespace-nowrap tabular-nums text-admin-accent hover:underline"
        >
          {maskPhoneInput(row.phone)}
        </a>
      ),
    },
  ];
}

const INACTIVE_COLUMNS: Column<'inactive'>[] = [
  ...commonColumns<'inactive'>(),
  {
    label: 'Valor total depositado',
    sort: 'totalDeposited',
    align: 'right',
    cell: (row) => formatBrl(row.totalDepositedCents),
  },
  {
    label: 'Qtd. de dias sem depositar',
    sort: 'daysWithoutDeposit',
    align: 'right',
    hint: 'Dias desde a última Recarga Pix paga.',
    cell: (row) => (
      <span title={`Último depósito: ${formatDateTime(row.lastDepositAt)}`}>{row.daysWithoutDeposit}</span>
    ),
  },
  {
    label: 'Qtd. de dias de relacionamento',
    sort: 'relationshipDays',
    align: 'right',
    hint: RELATIONSHIP_HINT,
    cell: (row) => row.relationshipDays,
  },
  { label: 'Qtd. de depósitos feitos', sort: 'deposits', align: 'right', cell: (row) => row.deposits },
];

const NEVER_DEPOSITED_COLUMNS: Column<'never-deposited'>[] = [
  ...commonColumns<'never-deposited'>(),
  {
    label: 'Data do cadastro',
    cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.createdAt)}</span>,
  },
  {
    label: 'Qtd. de dias de relacionamento',
    sort: 'relationshipDays',
    align: 'right',
    hint: RELATIONSHIP_HINT,
    cell: (row) => row.relationshipDays,
  },
];

/** Textos de cada lista. */
const COPY: Record<CrmList, { title: string; daysLabel: string; chipLabel: string; note: string }> = {
  inactive: {
    title: 'Apostadores inativos',
    daysLabel: 'Qtd. dias sem depositar',
    chipLabel: 'Sem Depositar',
    note: 'Contas ativas que já fizeram ao menos uma Recarga Pix paga, pelos dias desde a última. Crédito pelo painel não conta como depósito.',
  },
  'never-deposited': {
    title: 'Nunca depositantes',
    daysLabel: 'Qtd. dias de relacionamento',
    chipLabel: 'de Relacionamento',
    note: 'Contas ativas sem nenhuma Recarga Pix paga, pelos dias desde o cadastro. Crédito pelo painel não conta como depósito.',
  },
};

/** Cabeçalho que ordena: link que inverte a direção; as setas mostram a ordem atual (a ativa em destaque). */
function SortHeader<L extends CrmList>({ query, column }: { query: CrmQuery<L>; column: Column<L> }) {
  const align = `px-3 py-3 font-medium first:pl-0 ${column.align === 'right' ? 'text-right' : ''}`;
  if (!column.sort) {
    return (
      <th scope="col" className={align}>
        {column.label}
      </th>
    );
  }
  const active = query.sort === column.sort;
  const ariaSort = active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={align}>
      <Link
        href={crmSortHref(query, column.sort)}
        className={`inline-flex items-center gap-1 hover:text-admin-text ${active ? 'text-admin-text' : ''}`}
      >
        <span>{column.label}</span>
        {column.hint && (
          <span title={column.hint} aria-label={column.hint}>
            <Info className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        <span className="flex flex-col" aria-hidden>
          <ArrowUp className={`-mb-1 h-3 w-3 ${active && query.dir === 'asc' ? 'text-admin-text' : 'opacity-40'}`} />
          <ArrowDown className={`h-3 w-3 ${active && query.dir === 'desc' ? 'text-admin-text' : 'opacity-40'}`} />
        </span>
      </Link>
    </th>
  );
}

interface CrmPageProps<L extends CrmList> {
  query: CrmQuery<L>;
  promoters: AdminPromoterOption[] | null;
  data: L extends 'inactive' ? CrmInactiveList : CrmNeverDepositedList;
}

/**
 * CRM > Apostadores inativos / Nunca depositantes (visual de IMAGES/CRM.png): atalhos de dias, faixa de dias e
 * promotor; a lista ordenável e paginada, com o telefone em link para o WhatsApp e "Exportar Excel" com os mesmos
 * filtros. Componente de servidor.
 */
export default function CrmPage<L extends CrmList>({ query, promoters, data }: CrmPageProps<L>) {
  const config = CRM_LIST_CONFIG[query.list];
  const copy = COPY[query.list];
  const columns = (query.list === 'inactive' ? INACTIVE_COLUMNS : NEVER_DEPOSITED_COLUMNS) as unknown as Column<L>[];
  const rows = data.items as Array<Parameters<Column<L>['cell']>[0]>;
  const idPrefix = `crm-${query.list}`;

  return (
    <div className="space-y-6">
      <AdminPageTitle title={copy.title} />
      <FiltersCard>
        <FilterForm action={config.href} aria-label={`Filtrar ${copy.title.toLowerCase()}`}>
          <nav aria-label="Atalhos de dias" className="flex flex-wrap gap-2">
            {CRM_LIMITS.shortcuts.map((days) => (
              <Link
                key={days}
                href={crmShortcutHref(query, days)}
                aria-current={isCrmShortcut(query, days) ? 'true' : undefined}
                className={chipClass(isCrmShortcut(query, days))}
              >
                {days} dias
              </Link>
            ))}
          </nav>
          <div className="mt-4 grid items-end gap-4 md:grid-cols-3">
            <div>
              <label htmlFor={`${idPrefix}-min`} className={labelClass}>
                {copy.daysLabel} mínima
              </label>
              <input
                id={`${idPrefix}-min`}
                name="min"
                type="number"
                inputMode="numeric"
                min={0}
                max={CRM_LIMITS.maxDays}
                defaultValue={query.minDays}
                required
                className={controlClass}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-max`} className={labelClass}>
                {copy.daysLabel} máxima
              </label>
              <input
                id={`${idPrefix}-max`}
                name="max"
                type="number"
                inputMode="numeric"
                min={0}
                max={CRM_LIMITS.maxDays}
                defaultValue={query.maxDays}
                required
                className={controlClass}
              />
            </div>
            <FilterSelect id={`${idPrefix}-promoter`} label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
          </div>
          {/* A ordem e o tamanho da página continuam valendo numa nova pesquisa. */}
          {(query.sort !== config.defaultSort || query.dir !== DEFAULT_DIR) && (
            <>
              <input type="hidden" name="ordem" value={crmSortParam(query.sort)} />
              <input type="hidden" name="dir" value={query.dir} />
            </>
          )}
          {query.pageSize !== DEFAULT_PAGE_SIZE && <input type="hidden" name="pageSize" value={query.pageSize} />}
          <FilterActions clearHref={config.href} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-label="Resultados"
        className="rounded-lg border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <div className="flex flex-wrap gap-2 px-4 pt-5">
          <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
            Dias Mín {copy.chipLabel}: <strong className="font-semibold text-admin-text">{data.minDays}</strong>
          </span>
          <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
            Dias Máx {copy.chipLabel}: <strong className="font-semibold text-admin-text">{data.maxDays}</strong>
          </span>
        </div>

        <div className="mx-4 mt-4 border-t border-admin-border">
          <div className="flex justify-end pt-4">
            {data.total > 0 && (
              <a href={crmExportHref(query)} download className={smallButtonClass}>
                <Download className="h-4 w-4" aria-hidden />
                Exportar Excel
              </a>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-[14px]">
              <caption className="sr-only">{copy.title}</caption>
              <thead>
                <tr className="border-b border-admin-border text-[13px] text-admin-muted">
                  {columns.map((column) => (
                    <SortHeader key={column.label} query={query} column={column} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.player.id}
                    className="border-b border-admin-border last:border-0 hover:bg-admin-hover/60"
                  >
                    {columns.map((column) => (
                      <td
                        key={column.label}
                        className={`px-3 py-3 first:pl-0 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && (
            <p className="py-10 text-center text-[14px] text-admin-muted">Nenhum registro encontrado.</p>
          )}
        </div>

        {data.total > 0 && (
          <Pagination
            hrefFor={(page) => crmHref({ ...query, page } as CrmQuery)}
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            pageSize={data.pageSize}
            unit={['apostador', 'apostadores']}
          />
        )}

        <p className="flex items-start gap-2 px-6 pb-5 pt-2 text-[12.5px] text-admin-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{copy.note} Dias no calendário de Brasília.</span>
        </p>
      </section>
    </div>
  );
}
