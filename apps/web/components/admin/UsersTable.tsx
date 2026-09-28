import type { AdminUserListItem } from '@sysjb/contracts';
import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatDate } from '@/lib/datetime';
import { maskCpfInput, maskPhoneInput } from '@/lib/masks';
import StatusBadge from './StatusBadge';

interface UsersTableProps {
  items: AdminUserListItem[];
  emptyMessage?: string;
  /**
   * Colunas "Indicado por" (quem indicou, jogador ou promotor) e "Promotor" (o mesmo, só se for promotor).
   * Desligadas na lista de indicados do próprio promotor.
   */
  showPromoter?: boolean;
  /** O nome do promotor vira link para a página dele (perfil com promoters.read). */
  canReadPromoters?: boolean;
}

/** Tabela de usuários. CPF e telefone chegam só com dígitos e são formatados aqui. */
export default function UsersTable({
  items,
  emptyMessage = 'Nenhum usuário encontrado.',
  showPromoter = true,
  canReadPromoters = false,
}: UsersTableProps) {
  const HEADERS = [
    'ID',
    'Nome',
    'CPF',
    'Telefone',
    ...(showPromoter ? ['Indicado por', 'Promotor'] : []),
    'Status',
    'Cadastro',
  ];
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
                {emptyMessage}
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
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{maskCpfInput(user.document)}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{maskPhoneInput(user.phone)}</td>
              {showPromoter && (
                <td className="px-4 py-3">
                  {user.referredBy ? (
                    <Link href={ADMIN_ROUTES.user(user.referredBy.id)} className="text-admin-accent hover:underline">
                      {user.referredBy.name}
                    </Link>
                  ) : (
                    <span className="text-admin-muted" aria-label="Sem indicação">
                      —
                    </span>
                  )}
                </td>
              )}
              {showPromoter && (
                <td className="px-4 py-3">
                  {!user.promoter ? (
                    <span className="text-admin-muted" aria-label="Sem promotor">
                      —
                    </span>
                  ) : canReadPromoters ? (
                    <Link href={ADMIN_ROUTES.promoter(user.promoter.id)} className="text-admin-accent hover:underline">
                      {user.promoter.name}
                    </Link>
                  ) : (
                    user.promoter.name
                  )}
                </td>
              )}
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
