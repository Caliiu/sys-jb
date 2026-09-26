import type { AdminUserListItem } from '@sysjb/contracts';
import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatDate } from '@/lib/admin/format';
import StatusBadge from './StatusBadge';

const HEADERS = ['ID', 'Nome', 'CPF', 'Telefone', 'Status', 'Cadastro'];

/** Tabela de usuários. CPF e telefone chegam mascarados da API; os dados completos só no detalhe. */
export default function UsersTable({ items }: { items: AdminUserListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Usuários da banca</caption>
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
          {items.length === 0 && (
            <tr>
              <td colSpan={HEADERS.length} className="px-4 py-8 text-center text-admin-muted">
                Nenhum usuário encontrado.
              </td>
            </tr>
          )}
          {items.map((user) => (
            <tr key={user.id} className="border-b border-admin-border last:border-0 hover:bg-admin-bg">
              <td className="px-4 py-3 tabular-nums text-admin-muted">{user.displayId}</td>
              <td className="px-4 py-3">
                <Link href={ADMIN_ROUTES.user(user.id)} className="font-semibold text-admin-accent hover:underline">
                  {user.name}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{user.documentMasked}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{user.phoneMasked}</td>
              <td className="px-4 py-3">
                <StatusBadge status={user.status} />
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-admin-muted">{formatDate(user.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
