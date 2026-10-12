import type { AdminUserListItem } from '@sysjb/contracts';
import Link from 'next/link';
import WhatsAppIcon from '@/components/icons/WhatsAppIcon';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatCommission } from '@/lib/admin/commission';
import { formatShortDate } from '@/lib/datetime';
import { maskCpfInput, maskPhoneInput } from '@/lib/masks';
import { smallButtonClass } from './filter-styles';
import StatusBadge from './StatusBadge';

interface UsersTableProps {
  items: AdminUserListItem[];
  emptyMessage?: string;
}

const HEADERS = ['ID', 'Apostador', 'Promotor', 'Indicado por', 'Login', 'Status', 'Ações'];

const none = (label: string) => (
  <span className="text-admin-muted" aria-label={label}>
    —
  </span>
);

/**
 * Tabela de apostadores (usuários): ID e cadastro, apostador com telefone (WhatsApp), promotor com a comissão (só quando
 * quem indicou é promotor), quem indicou, login (CPF), status e Editar. CPF e telefone chegam só com dígitos.
 */
export default function UsersTable({ items, emptyMessage = 'Nenhum resultado encontrado' }: UsersTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[14px]">
        <caption className="sr-only">Apostadores da banca</caption>
        <thead>
          <tr className="border-b border-admin-border text-[13px] text-admin-muted">
            {HEADERS.map((header) => (
              <th key={header} scope="col" className="px-4 py-3 font-medium first:pl-0 last:pr-0">
                {header === 'Ações' ? <span className="sr-only">{header}</span> : header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={HEADERS.length} className="py-10 text-center text-admin-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
          {items.map((user) => (
            <tr key={user.id} className="border-b border-admin-border align-top hover:bg-admin-hover/60">
              <td className="whitespace-nowrap py-3 pr-4 tabular-nums">
                <span className="block">{user.displayId}</span>
                <span className="block text-[13px] text-admin-muted">{formatShortDate(user.createdAt)}</span>
              </td>
              <td className="px-4 py-3">
                <Link href={ADMIN_ROUTES.user(user.id)} className="font-medium hover:underline">
                  {user.name}
                </Link>
                <a
                  href={`https://wa.me/55${user.phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`WhatsApp ${maskPhoneInput(user.phone)}`}
                  className="mt-0.5 flex w-fit items-center gap-1 whitespace-nowrap text-[13px] tabular-nums text-admin-accent hover:underline"
                >
                  {maskPhoneInput(user.phone)}
                  <WhatsAppIcon className="h-3 w-3" aria-hidden />
                </a>
              </td>
              <td className="px-4 py-3">
                {!user.promoter ? (
                  none('Sem promotor')
                ) : (
                  <>
                    <span className="block">{user.promoter.name}</span>
                    <span className="block text-[13px] tabular-nums text-admin-muted">
                      {formatCommission(user.promoter.commissionBps)}
                    </span>
                  </>
                )}
              </td>
              <td className="px-4 py-3">
                {user.referredBy ? (
                  <Link href={ADMIN_ROUTES.user(user.referredBy.id)} className="hover:underline">
                    {user.referredBy.name}
                  </Link>
                ) : (
                  none('Sem indicação')
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{maskCpfInput(user.document)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={user.status} />
              </td>
              <td className="py-3 pl-4 text-right print:hidden">
                <Link href={ADMIN_ROUTES.user(user.id)} aria-label={`Editar ${user.name}`} className={smallButtonClass}>
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
