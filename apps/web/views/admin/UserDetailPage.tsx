import type { AdminUserDetail } from '@sysjb/contracts';
import { ArrowLeft, ScrollText } from 'lucide-react';
import Link from 'next/link';
import PromoterControls from '@/components/admin/PromoterControls';
import StatusBadge from '@/components/admin/StatusBadge';
import WalletCreditPanel from '@/components/admin/WalletCreditPanel';
import UserProfileCard from '@/components/admin/UserProfileCard';
import UserStatusActions from '@/components/admin/UserStatusActions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { auditHref } from '@/lib/admin/audit-query';
import { formatCommission } from '@/lib/admin/commission';
import { formatBirthDate, formatDateTime } from '@/lib/datetime';
import { formatCents } from '@/lib/currency';
import { balanceAmounts } from '@/lib/wallet';

interface UserDetailPageProps {
  user: AdminUserDetail;
  canEdit: boolean;
  canChangeStatus: boolean;
  /** Pode consultar promotores: a seção Indicação e promotor aparece mesmo sem indicação. */
  canReadPromoters?: boolean;
  /** Pode promover a promotor, alterar a comissão e remover. */
  canManagePromoters?: boolean;
  /** Pode consultar a auditoria (atalho para o histórico deste usuário). */
  canReadAudit?: boolean;
  /** Pode creditar a carteira (Adicionar Saldo, Bônus ou Disponível em Games). */
  canAdjustWallet?: boolean;
}

const labelClass = 'text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted';

/** Detalhe de um usuário: cadastro (editável conforme o perfil), conta e carteira. Componente de servidor. */
export default function UserDetailPage({
  user,
  canEdit,
  canChangeStatus,
  canReadPromoters = false,
  canManagePromoters = false,
  canReadAudit = false,
  canAdjustWallet = false,
}: UserDetailPageProps) {
  const wallet = balanceAmounts(user.wallet);
  const account: Array<{ label: string; value: string }> = [
    { label: 'ID', value: String(user.displayId) },
    { label: 'Código de convite', value: user.inviteCode },
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
            {canReadAudit && (
              <Link
                href={auditHref({ userId: user.id })}
                className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-admin-accent hover:underline"
              >
                <ScrollText className="h-3.5 w-3.5" aria-hidden />
                Ver histórico de alterações
              </Link>
            )}
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

        {(canReadPromoters || canManagePromoters || user.referredBy) && (
          <section aria-labelledby="promoter-title" className="rounded-xl bg-admin-surface p-5 shadow-admin">
            <h2 id="promoter-title" className="mb-4 text-[14px] font-bold text-admin-text">
              Indicação e promotor
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className={labelClass}>Situação</dt>
                <dd className="mt-0.5 text-[13.5px] text-admin-text">
                  {user.promoterCommissionBps === null
                    ? 'Não é promotor'
                    : `Promotor · comissão de ${formatCommission(user.promoterCommissionBps)}`}
                </dd>
              </div>
              <div>
                <dt className={labelClass}>Indicado por</dt>
                <dd className="mt-0.5 text-[13.5px] text-admin-text">
                  {user.referredBy ? (
                    <Link
                      href={ADMIN_ROUTES.user(user.referredBy.id)}
                      className="font-semibold text-admin-accent hover:underline"
                    >
                      {user.referredBy.name} (ID {user.referredBy.displayId})
                    </Link>
                  ) : (
                    'Ninguém (cadastro sem convite)'
                  )}
                </dd>
              </div>
              <div>
                <dt className={labelClass}>Promotor do jogador</dt>
                <dd className="mt-0.5 text-[13.5px] text-admin-text">
                  {user.referredBy?.promoterCommissionBps == null
                    ? 'Nenhum (quem indicou não é promotor)'
                    : `${user.referredBy.name} · comissão de ${formatCommission(user.referredBy.promoterCommissionBps)}`}
                </dd>
              </div>
            </dl>
            {canManagePromoters && (
              <div className="mt-5 border-t border-admin-border pt-5">
                <PromoterControls userId={user.id} commissionBps={user.promoterCommissionBps} />
              </div>
            )}
          </section>
        )}

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
          {canAdjustWallet && (
            <div className="mt-5 border-t border-admin-border pt-5">
              <WalletCreditPanel userId={user.id} userName={user.name} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
