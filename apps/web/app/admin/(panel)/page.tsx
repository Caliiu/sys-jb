import { redirect } from 'next/navigation';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

/** /admin: por enquanto o painel só tem a lista de usuários. */
export default function Page() {
  redirect(ADMIN_ROUTES.users);
}
