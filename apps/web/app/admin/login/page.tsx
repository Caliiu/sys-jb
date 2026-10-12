import { redirect } from 'next/navigation';
import { SignIn } from '@/admin/features/auth/sign-in';
import { Unavailable } from '@/admin/features/errors/unavailable';
import { resolveAdminRequest } from '@/lib/admin/admin-context';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar' };

export default async function Page() {
  const ctx = await resolveAdminRequest();
  if (!ctx.ok) return <Unavailable message={ctx.message} />;
  if (ctx.me) redirect(ADMIN_ROUTES.home);

  return <SignIn />;
}
