import type { AdminPromoterListItem } from '@sysjb/contracts';
import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatCommission } from '@/lib/admin/commission';
import { maskPhoneInput } from '@/lib/masks';
import StatusBadge from './StatusBadge';

const HEADERS = ['ID', 'Nome', 'Telefone', 'Comissão', 'Jogadores', 'Status'];

/** Tabela de promotores: comissão e quantos jogadores vieram pelo link de cada um. */
export default function PromotersTable({ items }: { items: AdminPromoterListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13px]">
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
                Nenhum promotor encontrado.
              </td>
            </tr>
          )}
          {items.map((promoter) => (
            <tr key={promoter.id} className="border-b border-admin-border last:border-0 hover:bg-admin-bg">
              <td className="px-4 py-3 tabular-nums text-admin-muted">{promoter.displayId}</td>
              <td className="px-4 py-3">
                <Link
                  href={ADMIN_ROUTES.promoter(promoter.id)}
                  className="font-semibold text-admin-accent hover:underline"
                >
                  {promoter.name}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums">{maskPhoneInput(promoter.phone)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">
                {formatCommission(promoter.commissionBps)}
              </td>
              <td className="px-4 py-3 tabular-nums">{promoter.referralsCount}</td>
              <td className="px-4 py-3">
                <StatusBadge status={promoter.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
