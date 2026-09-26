import type { AdminUserDetail } from '@sysjb/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import StatusBadge from '@/components/admin/StatusBadge';
import UserProfileCard from '@/components/admin/UserProfileCard';
import UserStatusActions from '@/components/admin/UserStatusActions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { formatBirthDate, formatDateTime } from '@/lib/datetime';
import { formatCents } from '@/lib/currency';
import { balanceAmounts } from '@/lib/wallet';

interface UserDetailPageProps {
  user: AdminUserDetail;
  canEdit: boolean;
  canChangeStatus: boolean;
}

const labelClass = 'text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';

/** Detalhe de um usuário: cadastro (editável conforme o perfil), conta e carteira. Componente de servidor. */
export default function UserDetailPage({ user, canEdit, canChangeStatus }: UserDetailPageProps) {
  const wallet = balanceAmounts(user.wallet);
  const account: Array<{ label: string; value: string }> = [
    { label: 'ID', value: String(user.displayId) },
    { label: 'Data de nascimento', value: formatBirthDate(user.birthDate) },
    { label: 'Cadastrado em', value: formatDateTime(user.createdAt) },
    { label: 'Último acesso', value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca' },
  ];
  const balances: Array<{ label: string; value: string }> = [
    { label: 'Saldo', value: `R$ ${formatCents(wallet.main)}` },
    { label: 'Bônus', value: `R$ ${formatCents(wallet.bonus)}` },
    { label: 'Disponível em Games', value: `R$ ${formatCents(wallet.games)}` },
  ];

  return (
    <div>
      <Link
        href={ADMIN_ROUTES.users}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-admin-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar para usuários
      </Link>

      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-admin-surface p-5 shadow-admin">
          <div>
            <h1 className="break-words text-[16px] font-bold text-admin-text">{user.name}</h1>
            <div className="mt-1">
              <StatusBadge status={user.status} />
            </div>
          </div>
          {canChangeStatus && <UserStatusActions userId={user.id} status={user.status} />}
        </header>

        {user.status === 'BLOCKED' && (
          <p
            role="status"
            className="rounded-xl border border-admin-danger/30 bg-admin-danger/10 px-4 py-3 text-[13px] text-admin-danger"
          >
            Usuário bloqueado: não consegue entrar na plataforma.
          </p>
        )}

        <UserProfileCard user={user} canEdit={canEdit} />

        <section aria-labelledby="account-title" className="rounded-xl bg-admin-surface p-5 shadow-admin">
          <h2 id="account-title" className="mb-4 text-[14px] font-bold text-admin-text">
            Conta
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {account.map(({ label, value }) => (
              <div key={label}>
                <dt className={labelClass}>{label}</dt>
                <dd className="mt-0.5 text-[13.5px] text-admin-text">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="wallet-title" className="rounded-xl bg-admin-surface p-5 shadow-admin">
          <h2 id="wallet-title" className="mb-4 text-[14px] font-bold text-admin-text">
            Carteira
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            {balances.map(({ label, value }) => (
              <div key={label}>
                <dt className={labelClass}>{label}</dt>
                <dd className="mt-0.5 text-[13.5px] tabular-nums text-admin-text">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
