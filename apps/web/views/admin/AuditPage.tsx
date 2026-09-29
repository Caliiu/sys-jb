import {
  AUDIT_ACTIONS,
  type AdminAuditEntry,
  type AdminAuditSummary,
  type AuditPeriod,
  type Page,
} from '@sysjb/contracts';
import { X } from 'lucide-react';
import Link from 'next/link';
import AdminBox from '@/components/admin/AdminBox';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import AutoSubmitSelect from '@/components/admin/AutoSubmitSelect';
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
import { formatShortDateTime } from '@/lib/datetime';

interface AuditPageProps {
  query: AuditQuery;
  result: Page<AdminAuditEntry>;
  /** Contagem por período; null = os cards não aparecem (a lista funciona sem eles). */
  summary?: AdminAuditSummary | null;
}

/** Colunas com largura proporcional: em tela larga a sobra se divide entre elas, em vez de ir toda para o fim. */
const COLUMNS = [
  { header: 'Alterado em', width: 'w-[16%]' },
  { header: 'Ação', width: 'w-[22%]' },
  { header: 'Unidade', width: 'w-[24%]' },
  { header: 'Detalhes', width: 'w-[38%]' },
];

const PERIOD_CARDS: Array<{ period: AuditPeriod | ''; label: string; key: keyof AdminAuditSummary }> = [
  { period: 'today', label: 'Hoje', key: 'today' },
  { period: '7d', label: 'Últimos 7 dias', key: 'last7Days' },
  { period: '30d', label: 'Últimos 30 dias', key: 'last30Days' },
  { period: '', label: 'Total', key: 'total' },
];

const TONES: Record<AuditTone, { badge: string; dot: string }> = {
  danger: { badge: 'bg-admin-danger/10 text-admin-danger', dot: 'bg-admin-danger' },
  success: { badge: 'bg-admin-success/10 text-admin-success', dot: 'bg-admin-success' },
  neutral: { badge: 'bg-admin-bg text-admin-text', dot: 'bg-admin-muted' },
};

const labelClass = 'mb-1 block text-[11.5px] font-semibold text-admin-muted';
const selectClass =
  'h-9 w-full rounded-md border border-admin-border bg-admin-surface px-2.5 text-[13px] text-admin-text outline-none focus:border-admin-accent focus:ring-2 focus:ring-admin-accent/20';
const ghostButtonClass =
  'flex h-8 items-center gap-1.5 rounded-md border border-admin-border bg-admin-surface px-3 text-[12.5px] font-medium text-admin-text hover:bg-admin-bg';

const countFormat = new Intl.NumberFormat('pt-BR');

/** Selo da ação com bolinha colorida (vermelho = exclusão/bloqueio, verde = inclusão/crédito). */
function ActionBadge({ entry }: { entry: AdminAuditEntry }) {
  const tone = TONES[AUDIT_ACTION_TONES[entry.action]];
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-xl px-2.5 py-0.5 text-[12px] font-medium ${tone.badge}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {AUDIT_ACTION_LABELS[entry.action]}
    </span>
  );
}

/** Unidade afetada: link "ID · nome", "Banca" (ação sobre a banca) ou "Unidade removida". */
function Target({ entry }: { entry: AdminAuditEntry }) {
  if (entry.targetType === 'tenant') return <span className="text-admin-text">Banca</span>;
  if (!entry.target) return <span className="text-admin-muted">Unidade removida</span>;
  return (
    <Link href={ADMIN_ROUTES.user(entry.target.id)} className="font-semibold text-admin-text hover:text-admin-accent">
      <span className="font-normal tabular-nums text-admin-muted">{entry.target.displayId}</span> · {entry.target.name}
    </Link>
  );
}

/** Registro de auditoria: quem fez o quê, em quem e quando (somente leitura). Componente de servidor. */
export default function AuditPage({ query, result, summary = null }: AuditPageProps) {
  const filtered = query.action !== '' || query.userId !== '' || query.period !== '';
  // Nome da unidade filtrada, quando aparece nos resultados (a URL só tem o id).
  const filteredUser = query.userId ? result.items.find((e) => e.target?.id === query.userId)?.target : undefined;

  return (
    <div>
      <AdminPageTitle title="Registro de Auditoria" />

      {summary && (
        <nav aria-label="Períodos" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 print:hidden">
          {PERIOD_CARDS.map(({ period, label, key }) => {
            const active = query.period === period;
            return (
              <Link
                key={key}
                href={auditHref({ ...query, period, page: 1 })}
                aria-current={active ? 'true' : undefined}
                className={`rounded-lg border bg-admin-surface px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors ${
                  active
                    ? 'border-admin-accent ring-2 ring-admin-accent/20'
                    : 'border-admin-border hover:border-admin-accent/50'
                }`}
              >
                <span className="block text-[12px] font-medium text-admin-muted">{label}</span>
                <span className="mt-1 block text-[24px] font-semibold leading-none tabular-nums text-admin-text">
                  {countFormat.format(summary[key])}
                </span>
                <span className="sr-only">{summary[key] === 1 ? ' registro' : ' registros'}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <AdminBox
        variant="card"
        title="Registro de alterações"
        actions={<PrintButton className={`${ghostButtonClass} print:hidden`} />}
      >
        <form
          method="get"
          action={ADMIN_ROUTES.audit}
          aria-label="Filtrar auditoria"
          className="border-b border-admin-border px-4 py-3 print:hidden"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-72">
              <label htmlFor="audit-action" className={labelClass}>
                Ação
              </label>
              <AutoSubmitSelect id="audit-action" name="acao" defaultValue={query.action} className={selectClass}>
                <option value="">Todas as ações</option>
                {AUDIT_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {AUDIT_ACTION_LABELS[action]}
                  </option>
                ))}
              </AutoSubmitSelect>
            </div>
            <div className="sm:w-40">
              <label htmlFor="audit-page-size" className={labelClass}>
                Resultados por página
              </label>
              <AutoSubmitSelect
                id="audit-page-size"
                name="pageSize"
                defaultValue={String(query.pageSize)}
                className={selectClass}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </AutoSubmitSelect>
            </div>
            {query.userId && <input type="hidden" name="usuario" value={query.userId} />}
            {query.period && <input type="hidden" name="periodo" value={AUDIT_PERIOD_PARAMS[query.period]} />}
            {filtered && (
              <Link href={ADMIN_ROUTES.audit} className={`${ghostButtonClass} h-9 sm:ml-auto`}>
                Limpar filtros
              </Link>
            )}
          </div>

          {query.userId && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-admin-muted">
              Mostrando só a unidade
              <span className="inline-flex items-center gap-1 rounded-full bg-admin-accent/10 py-0.5 pl-2.5 pr-1 font-medium text-admin-accent">
                <Link href={ADMIN_ROUTES.user(query.userId)} className="hover:underline">
                  {filteredUser ? `${filteredUser.name} (ID ${filteredUser.displayId})` : 'selecionada'}
                </Link>
                <Link
                  href={auditHref({ ...query, userId: '', page: 1 })}
                  aria-label="Remover filtro de unidade"
                  className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-admin-accent/20"
                >
                  <X className="h-3 w-3" aria-hidden />
                </Link>
              </span>
            </p>
          )}
          <p className="mt-3 text-[12px] text-admin-muted">
            Só aparecem os nomes dos campos alterados, nunca os dados pessoais.
          </p>
        </form>

        {result.items.length === 0 ? (
          <p className="px-4 py-12 text-center text-[13px] text-admin-muted">
            {filtered ? 'Nenhum registro com esses filtros.' : 'Nenhuma alteração registrada ainda.'}
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block print:block">
              <table className="w-full min-w-[720px] table-fixed text-left text-[13px]">
                <caption className="sr-only">Registro de auditoria</caption>
                <thead>
                  <tr className="border-b border-admin-border bg-admin-bg/60 text-[11.5px] font-semibold text-admin-muted">
                    {COLUMNS.map(({ header, width }) => (
                      <th key={header} scope="col" className={`${width} px-4 py-2.5 font-semibold`}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-admin-border align-top transition-colors last:border-0 hover:bg-admin-bg/60"
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="block tabular-nums text-admin-text">
                          {formatShortDateTime(entry.createdAt)}
                        </span>
                        <span className="block text-[12px] text-admin-muted" title={entry.operator.email}>
                          {entry.operator.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge entry={entry} />
                      </td>
                      <td className="break-words px-4 py-3">
                        <Target entry={entry} />
                      </td>
                      <td className="break-words px-4 py-3 text-admin-text">{describeAuditDetails(entry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul aria-label="Registro de auditoria" className="divide-y divide-admin-border md:hidden print:hidden">
              {result.items.map((entry) => (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <ActionBadge entry={entry} />
                    <span className="whitespace-nowrap text-[12px] tabular-nums text-admin-muted">
                      {formatShortDateTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px]">
                    <Target entry={entry} />
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-admin-text">{describeAuditDetails(entry)}</p>
                  <p className="mt-1 text-[12px] text-admin-muted">por {entry.operator.name}</p>
                </li>
              ))}
            </ul>
          </>
        )}

        <Pagination
          hrefFor={(page) => auditHref({ ...query, page })}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
          unit={['registro', 'registros']}
        />
      </AdminBox>
    </div>
  );
}
