import { AUDIT_ACTIONS, type AdminAuditEntry, type AuditPeriod, drawDateOf, type Page } from '@sysjb/contracts';
import { X } from 'lucide-react';
import Link from 'next/link';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import { chipClass, labelClass, smallButtonClass } from '@/components/admin/filter-styles';
import Pagination from '@/components/admin/Pagination';
import PrintButton from '@/components/admin/PrintButton';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_TONES,
  AUDIT_PERIOD_PARAMS,
  type AuditQuery,
  type AuditTone,
  auditHref,
  describeAuditDetails,
} from '@/lib/admin/audit-query';
import { PAGE_SIZES } from '@/lib/admin/page-size';
import { formatCalendarDate, formatShortDateTime } from '@/lib/datetime';

interface AuditPageProps {
  query: AuditQuery;
  result: Page<AdminAuditEntry>;
  /** Agora (ISO): datas do período mostrado no resumo. */
  nowIso: string;
}

/** Colunas com largura proporcional: em tela larga a sobra se divide entre elas, em vez de ir toda para o fim. */
const COLUMNS = [
  { header: 'Alterado em', width: 'w-[16%]' },
  { header: 'Ação', width: 'w-[22%]' },
  { header: 'Apostador', width: 'w-[24%]' },
  { header: 'Detalhes', width: 'w-[38%]' },
];

/** Atalhos de período (dias de Brasília, como a API conta). */
const PERIODS: Array<{ period: AuditPeriod | ''; label: string; daysBack: number | null }> = [
  { period: 'today', label: 'Hoje', daysBack: 0 },
  { period: '7d', label: '7D', daysBack: 6 },
  { period: '30d', label: '30D', daysBack: 29 },
  { period: '', label: 'Tudo', daysBack: null },
];

const TONES: Record<AuditTone, { badge: string; dot: string }> = {
  danger: { badge: 'border-admin-danger/25 bg-admin-danger/10 text-admin-danger', dot: 'bg-admin-danger' },
  success: { badge: 'border-admin-success/25 bg-admin-success/10 text-admin-success', dot: 'bg-admin-success' },
  neutral: { badge: 'border-admin-border bg-admin-hover text-admin-text', dot: 'bg-admin-muted' },
};

/** "30/09/2026 – 30/09/2026"; sem período, todo o histórico. */
function periodText(period: AuditPeriod | '', nowIso: string): string {
  const daysBack = PERIODS.find((p) => p.period === period)?.daysBack ?? null;
  if (daysBack === null) return 'Todo o histórico';
  const today = formatCalendarDate(drawDateOf(nowIso, 0));
  return `${formatCalendarDate(drawDateOf(nowIso, -daysBack))} – ${today}`;
}

/** Selo da ação com bolinha colorida (vermelho = exclusão/bloqueio, verde = inclusão/crédito). */
function ActionBadge({ entry }: { entry: AdminAuditEntry }) {
  const tone = TONES[AUDIT_ACTION_TONES[entry.action]];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium ${tone.badge}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {AUDIT_ACTION_LABELS[entry.action]}
    </span>
  );
}

/** Apostador afetado: link "ID · nome", "Banca" (ação sobre a banca) ou "Apostador removido". */
function Target({ entry }: { entry: AdminAuditEntry }) {
  if (entry.targetType === 'tenant') return <span>Banca</span>;
  if (!entry.target) return <span className="text-admin-muted">Apostador removido</span>;
  return (
    <Link href={ADMIN_ROUTES.user(entry.target.id)} className="font-medium hover:underline">
      <span className="font-normal tabular-nums text-admin-muted">{entry.target.displayId}</span> · {entry.target.name}
    </Link>
  );
}

/** Registro de auditoria: quem fez o quê, em quem e quando (somente leitura). Componente de servidor. */
export default function AuditPage({ query, result, nowIso }: AuditPageProps) {
  const filtered = query.action !== '' || query.userId !== '' || query.period !== '';
  // Nome do apostador filtrado, quando aparece nos resultados (a URL só tem o id).
  const filteredUser = query.userId ? result.items.find((e) => e.target?.id === query.userId)?.target : undefined;

  return (
    <div className="space-y-6">
      <AdminPageTitle title="Log de auditoria" />

      <FiltersCard>
        <p className={labelClass}>Período</p>
        <nav aria-label="Período" className="flex flex-wrap gap-1.5">
          {PERIODS.map(({ period, label }) => {
            const active = query.period === period;
            return (
              <Link
                key={label}
                href={auditHref({ ...query, period, page: 1 })}
                aria-current={active ? 'true' : undefined}
                className={chipClass(active)}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <FilterForm action={ADMIN_ROUTES.audit} aria-label="Filtrar auditoria" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect id="audit-action" label="Ação" name="acao" defaultValue={query.action}>
              <option value="">Todas</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {AUDIT_ACTION_LABELS[action]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              id="audit-page-size"
              label="Resultados por página"
              name="pageSize"
              defaultValue={String(query.pageSize)}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </FilterSelect>
          </div>
          {query.userId && <input type="hidden" name="usuario" value={query.userId} />}
          {query.period && <input type="hidden" name="periodo" value={AUDIT_PERIOD_PARAMS[query.period]} />}

          {query.userId && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-admin-muted">
              Mostrando só o apostador
              <span className="inline-flex items-center gap-1 rounded-md border border-admin-border bg-admin-hover py-0.5 pl-2.5 pr-1 font-medium text-admin-text">
                <Link href={ADMIN_ROUTES.user(query.userId)} className="hover:underline">
                  {filteredUser ? `${filteredUser.name} (ID ${filteredUser.displayId})` : 'selecionado'}
                </Link>
                <Link
                  href={auditHref({ ...query, userId: '', page: 1 })}
                  aria-label="Remover filtro de apostador"
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-admin-border"
                >
                  <X className="h-3 w-3" aria-hidden />
                </Link>
              </span>
            </p>
          )}

          <FilterActions clearHref={ADMIN_ROUTES.audit} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-label="Resultados"
        className="rounded-xl border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <div className="flex flex-wrap items-center gap-3 px-6 pt-6">
          <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
            Período: <strong className="font-semibold text-admin-text">{periodText(query.period, nowIso)}</strong>
          </span>
          <div className="ml-auto print:hidden">
            <PrintButton className={smallButtonClass} />
          </div>
        </div>
        <p className="px-6 pt-3 text-[12.5px] text-admin-muted">
          Só aparecem os nomes dos campos alterados, nunca os dados pessoais.
        </p>

        <div className="mx-6 mt-4 border-t border-admin-border">
          {result.items.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-admin-muted">
              {filtered ? 'Nenhum resultado encontrado' : 'Nenhuma alteração registrada ainda.'}
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block print:block">
                <table className="w-full min-w-[720px] table-fixed text-left text-[14px]">
                  <caption className="sr-only">Registro de auditoria</caption>
                  <thead>
                    <tr className="border-b border-admin-border text-[13px] text-admin-muted">
                      {COLUMNS.map(({ header, width }) => (
                        <th key={header} scope="col" className={`${width} px-4 py-3 font-medium first:pl-0 last:pr-0`}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((entry) => (
                      <tr key={entry.id} className="border-b border-admin-border align-top hover:bg-admin-hover/60">
                        <td className="whitespace-nowrap py-3 pr-4">
                          <span className="block tabular-nums">{formatShortDateTime(entry.createdAt)}</span>
                          <span className="block text-[13px] text-admin-muted" title={entry.operator.email}>
                            {entry.operator.name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ActionBadge entry={entry} />
                        </td>
                        <td className="break-words px-4 py-3">
                          <Target entry={entry} />
                        </td>
                        <td className="break-words py-3 pl-4">{describeAuditDetails(entry)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul aria-label="Registro de auditoria" className="divide-y divide-admin-border md:hidden print:hidden">
                {result.items.map((entry) => (
                  <li key={entry.id} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <ActionBadge entry={entry} />
                      <span className="whitespace-nowrap text-[12.5px] tabular-nums text-admin-muted">
                        {formatShortDateTime(entry.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-[14px]">
                      <Target entry={entry} />
                    </p>
                    <p className="mt-0.5 text-[13px]">{describeAuditDetails(entry)}</p>
                    <p className="mt-1 text-[12.5px] text-admin-muted">por {entry.operator.name}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <Pagination
          hrefFor={(page) => auditHref({ ...query, page })}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
        />
      </section>
    </div>
  );
}
