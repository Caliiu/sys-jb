import { AUDIT_ACTIONS, type AdminAuditEntry, type Page } from '@sysjb/contracts';
import Link from 'next/link';
import Pagination from '@/components/admin/Pagination';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { AUDIT_ACTION_LABELS, type AuditQuery, auditHref, describeAuditDetails } from '@/lib/admin/audit-query';
import { formatDateTime } from '@/lib/datetime';

interface AuditPageProps {
  query: AuditQuery;
  result: Page<AdminAuditEntry>;
}

const fieldClass =
  'h-10 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';
const HEADERS = ['Data e hora', 'Operador', 'Ação', 'Usuário', 'Detalhes'];

/** Registro de auditoria: quem fez o quê, em quem e quando (somente leitura). Componente de servidor. */
export default function AuditPage({ query, result }: AuditPageProps) {
  const filtered = query.action !== '' || query.userId !== '';
  // Nome do usuário filtrado, quando aparece nos resultados (a URL só tem o id).
  const filteredUser = query.userId ? result.items.find((e) => e.target?.id === query.userId)?.target : undefined;

  return (
    <div>
      <h1 className="mb-1 text-[18px] font-bold text-admin-text">Registro de auditoria</h1>
      <p className="mb-4 text-[12.5px] text-admin-muted">
        Alterações feitas pelos operadores. Só aparecem os nomes dos campos, nunca os dados pessoais.
      </p>

      <form
        method="get"
        action={ADMIN_ROUTES.audit}
        aria-label="Filtrar auditoria"
        className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <label htmlFor="audit-action" className="sr-only">
          Ação
        </label>
        <select id="audit-action" name="acao" defaultValue={query.action} className={`${fieldClass} sm:w-64`}>
          <option value="">Todas as ações</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {AUDIT_ACTION_LABELS[action]}
            </option>
          ))}
        </select>
        {query.userId && <input type="hidden" name="usuario" value={query.userId} />}
        <button
          type="submit"
          className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white active:bg-admin-accent-dark"
        >
          Filtrar
        </button>
        {filtered && (
          <Link
            href={ADMIN_ROUTES.audit}
            className="flex h-10 items-center justify-center rounded-lg border border-admin-border px-4 text-[13px] font-semibold text-admin-text"
          >
            Limpar
          </Link>
        )}
      </form>

      {query.userId && (
        <p className="mb-3 text-[13px] text-admin-text">
          Mostrando só o usuário{' '}
          <Link href={ADMIN_ROUTES.user(query.userId)} className="font-semibold text-admin-accent hover:underline">
            {filteredUser ? `${filteredUser.name} (ID ${filteredUser.displayId})` : 'selecionado'}
          </Link>
          .
        </p>
      )}

      <section aria-label="Resultados" className="overflow-hidden rounded-xl bg-admin-surface shadow-admin">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Registro de auditoria</caption>
            <thead>
              <tr className="border-b border-admin-border text-[11.5px] uppercase tracking-wide text-admin-muted">
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.items.length === 0 && (
                <tr>
                  <td colSpan={HEADERS.length} className="px-4 py-8 text-center text-admin-muted">
                    {filtered ? 'Nenhum registro com esses filtros.' : 'Nenhuma alteração registrada ainda.'}
                  </td>
                </tr>
              )}
              {result.items.map((entry) => (
                <tr key={entry.id} className="border-b border-admin-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-admin-muted">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-admin-text">{entry.operator.name}</p>
                    <p className="text-[12px] text-admin-muted">{entry.operator.email}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{AUDIT_ACTION_LABELS[entry.action]}</td>
                  <td className="px-4 py-3">
                    {entry.targetType === 'tenant' ? (
                      <span className="text-admin-text">Banca</span>
                    ) : entry.target ? (
                      <Link
                        href={ADMIN_ROUTES.user(entry.target.id)}
                        className="font-semibold text-admin-accent hover:underline"
                      >
                        {entry.target.name}
                      </Link>
                    ) : (
                      <span className="text-admin-muted">Usuário removido</span>
                    )}
                    {entry.target && <p className="text-[12px] text-admin-muted">ID {entry.target.displayId}</p>}
                  </td>
                  <td className="px-4 py-3 text-admin-text">{describeAuditDetails(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          hrefFor={(page) => auditHref({ ...query, page })}
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          unit={['registro', 'registros']}
        />
      </section>
    </div>
  );
}
