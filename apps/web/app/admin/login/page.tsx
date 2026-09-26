import { redirect } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { resolveAdminRequest } from '@/lib/admin/admin-context';
import AdminLoginPage from '@/views/admin/AdminLoginPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Painel administrativo' };

export default async function Page() {
  const ctx = await resolveAdminRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (ctx.operator) redirect(ADMIN_ROUTES.users);

  return <AdminLoginPage tenant={ctx.tenant} />;
}
