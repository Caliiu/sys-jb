import { redirect } from 'next/navigation';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

export const dynamic = 'force-dynamic';

/**
 * Endereço antigo (Carteira > Comissões): o percentual do "Indique e ganhe" virou Personalização > Valores. A sessão e a
 * permissão são conferidas na página nova.
 */
export default function Page() {
  redirect(ADMIN_ROUTES.values);
}
