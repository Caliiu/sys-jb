import { unauthorized } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { APP_VERSION } from '@/lib/app-version';
import { resolveRequest } from '@/lib/request-context';
import SettingsPage from '@/views/SettingsPage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!ctx.me) unauthorized();

  return (
    <TenantProvider tenant={ctx.tenant}>
      <SettingsPage tenant={ctx.tenant} user={ctx.me} version={APP_VERSION} />
    </TenantProvider>
  );
}
