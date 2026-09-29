import type { AdminUserListItem } from '@sysjb/contracts';
import Link from 'next/link';
import WhatsAppIcon from '@/components/icons/WhatsAppIcon';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatCommission } from '@/lib/admin/commission';
import { formatShortDate } from '@/lib/datetime';
import { maskCpfInput, maskPhoneInput } from '@/lib/masks';
import StatusBadge from './StatusBadge';

interface UsersTableProps {
  items: AdminUserListItem[];
  emptyMessage?: string;
  /**
   * Colunas "Promotor" (quem indicou, se for promotor, com a % dele) e "Indicado por" (quem indicou, jogador
   * ou promotor). Desligadas na lista de indicados do próprio promotor.
   */
  showPromoter?: boolean;
}

const none = (label: string) => (
  <span className="text-admin-muted" aria-label={label}>
    —
  </span>
);

/**
 * Tabela de unidades (usuários) no formato do painel: Data/ID, unidade com telefone (WhatsApp), promotor com a
 * comissão, indicação, login (CPF), status e Editar. CPF e telefone chegam só com dígitos e são formatados aqui.
 */
export default function UsersTable({
  items,
  emptyMessage = 'Nenhuma unidade encontrada.',
  showPromoter = true,
}: UsersTableProps) {
  const HEADERS = [
    'Data/Id',
    'Unidade',
    ...(showPromoter ? ['Promotor', 'Indicado por'] : []),
    'Login',
    'Status',
    'Ações',
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[12.5px]">
        <caption className="sr-only">Unidades da banca</caption>
        <thead>
          <tr className="border-b-2 border-admin-border text-[12.5px] text-admin-text">
            {HEADERS.map((header) => (
              <th key={header} scope="col" className="px-3 py-2.5 font-bold">
                {header === 'Ações' ? <span className="sr-only">{header}</span> : header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={HEADERS.length} className="px-3 py-8 text-center text-admin-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
          {items.map((user) => (
            <tr key={user.id} className="border-b border-admin-border align-top last:border-0 odd:bg-[#f9f9f9]">
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                <span className="block">{user.displayId}</span>
                <span className="block text-admin-muted">{formatShortDate(user.createdAt)}</span>
              </td>
              <td className="px-3 py-2.5">
                <Link href={ADMIN_ROUTES.user(user.id)} className="font-semibold uppercase hover:underline">
                  {user.name}
                </Link>
                <a
                  href={`https://wa.me/55${user.phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp ${maskPhoneInput(user.phone)}`}
                  className="mt-0.5 flex w-fit items-center gap-1 whitespace-nowrap tabular-nums text-admin-accent hover:underline"
                >
                  {maskPhoneInput(user.phone)}
                  <WhatsAppIcon className="h-3 w-3" aria-hidden />
                </a>
              </td>
              {showPromoter && (
                <td className="px-3 py-2.5">
                  {!user.promoter ? (
                    none('Sem promotor')
                  ) : (
                    <>
                      <span className="uppercase text-admin-muted">{user.promoter.name}</span>
                      <span className="block tabular-nums">{formatCommission(user.promoter.commissionBps)}</span>
                    </>
                  )}
                </td>
              )}
              {showPromoter && (
                <td className="px-3 py-2.5">
                  {user.referredBy ? (
                    <Link href={ADMIN_ROUTES.user(user.referredBy.id)} className="uppercase hover:underline">
                      {user.referredBy.name}
                    </Link>
                  ) : (
                    none('Sem indicação')
                  )}
                </td>
              )}
              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-admin-accent">
                {maskCpfInput(user.document)}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={user.status} />
              </td>
              <td className="px-3 py-2.5 text-right print:hidden">
                <Link
                  href={ADMIN_ROUTES.user(user.id)}
                  aria-label={`Editar ${user.name}`}
                  className="inline-flex h-7 items-center rounded-sm bg-[#111] px-3 text-[12px] font-semibold text-white hover:bg-black"
                >
                  Editar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
