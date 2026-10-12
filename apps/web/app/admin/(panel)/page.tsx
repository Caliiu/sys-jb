import { Dashboard } from '@/admin/features/dashboard';
import { Unavailable } from '@/admin/features/errors/unavailable';
import { requireAdmin } from '@/lib/admin/admin-context';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Início' };

export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <Unavailable message={gate.message} />;
  return <Dashboard />;
}
