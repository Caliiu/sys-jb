import ComingSoonRoute, { comingSoonMetadata } from '@/components/admin/ComingSoonRoute';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

export const dynamic = 'force-dynamic';
export const metadata = comingSoonMetadata(ADMIN_ROUTES.inactivePlayers);

/** Página ainda não construída: "Em breve" (com sessão e permissão conferidas). */
export default function Page() {
  return <ComingSoonRoute href={ADMIN_ROUTES.inactivePlayers} />;
}
