import { unauthorized } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { resolveRequest } from '@/lib/request-context';
import { toWithdrawalItem } from '@/lib/withdrawal';
import { loadMyWithdrawals } from '@/lib/withdrawal-api';
import WithdrawalsPage from '@/views/WithdrawalsPage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  const data = await loadMyWithdrawals(ctx.hostname);
  return (
    <TenantProvider tenant={ctx.tenant}>
      <WithdrawalsPage
        tenant={ctx.tenant}
        user={ctx.me}
        items={data?.items.map(toWithdrawalItem) ?? []}
        limits={data?.limits}
        loadFailed={data === null}
      />
    </TenantProvider>
  );
}
