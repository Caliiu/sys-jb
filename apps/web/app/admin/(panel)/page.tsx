import { redirect } from 'next/navigation';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

/** Raiz do painel (admin.<domínio>/): por enquanto o painel só tem a lista de usuários. */
export default function Page() {
  redirect(ADMIN_ROUTES.users);
}
