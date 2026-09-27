import type { AdminPromoterListItem, AdminUserListItem, Page } from '@sysjb/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Pagination from '@/components/admin/Pagination';
import PromoterControls from '@/components/admin/PromoterControls';
import StatusBadge from '@/components/admin/StatusBadge';
import UsersTable from '@/components/admin/UsersTable';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatCommission } from '@/lib/admin/commission';
import { pageHref } from '@/lib/admin/promoters-query';
import { formatDateTime } from '@/lib/datetime';
import { maskPhoneInput } from '@/lib/masks';

interface PromoterDetailPageProps {
  promoter: AdminPromoterListItem;
  referrals: Page<AdminUserListItem>;
  canManage: boolean;
}

const labelClass = 'text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';

/** Um promotor: comissão, código de convite e os jogadores que vieram por ele. Componente de servidor. */
export default function PromoterDetailPage({ promoter, referrals, canManage }: PromoterDetailPageProps) {
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Comissão', value: formatCommission(promoter.commissionBps) },
    { label: 'Jogadores indicados', value: String(promoter.referralsCount) },
    { label: 'Código de convite', value: String(promoter.displayId) },
    { label: 'Telefone', value: maskPhoneInput(promoter.phone) },
    { label: 'Cadastrado em', value: formatDateTime(promoter.createdAt) },
  ];

  return (
    <div>
      <Link
        href={ADMIN_ROUTES.promoters}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-admin-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar para promotores
      </Link>

      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-admin-surface p-5 shadow-admin">
          <div>
            <h1 className="break-words text-[16px] font-bold text-admin-text">{promoter.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={promoter.status} />
              <Link
                href={ADMIN_ROUTES.user(promoter.id)}
                className="text-[12.5px] font-semibold text-admin-accent hover:underline"
              >
                Ver cadastro do usuário
              </Link>
            </div>
          </div>
        </header>

        <section aria-labelledby="promoter-title" className="rounded-xl bg-admin-surface p-5 shadow-admin">
          <h2 id="promoter-title" className="mb-4 text-[14px] font-bold text-admin-text">
            Promotor
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            {facts.map(({ label, value }) => (
              <div key={label}>
                <dt className={labelClass}>{label}</dt>
                <dd className="mt-0.5 text-[13.5px] tabular-nums text-admin-text">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[12.5px] text-admin-muted">
            A comissão incide sobre as apostas dos jogadores indicados. Os ganhos aparecem aqui quando o registro de
            apostas estiver disponível. Quem se cadastra pelo link de convite com o código acima fica vinculado a este
            promotor.
          </p>
          {canManage && (
            <div className="mt-5 border-t border-admin-border pt-5">
              <PromoterControls userId={promoter.id} commissionBps={promoter.commissionBps} afterRemove="list" />
            </div>
          )}
        </section>

        <section aria-labelledby="referrals-title" className="overflow-hidden rounded-xl bg-admin-surface shadow-admin">
          <h2 id="referrals-title" className="px-5 pt-5 text-[14px] font-bold text-admin-text">
            Jogadores indicados
          </h2>
          <UsersTable
            items={referrals.items}
            emptyMessage="Nenhum jogador se cadastrou pelo link deste promotor ainda."
          />
          <Pagination
            hrefFor={(page) => pageHref(ADMIN_ROUTES.promoter(promoter.id), { page })}
            page={referrals.page}
            totalPages={referrals.totalPages}
            total={referrals.total}
          />
        </section>
      </div>
    </div>
  );
}
