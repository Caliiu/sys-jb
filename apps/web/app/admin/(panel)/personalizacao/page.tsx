import { redirect } from 'next/navigation';
import AdminMessage from '@/components/admin/AdminMessage';
import { AdminUnavailable } from '@/components/admin/AdminUnavailable';
import BrandingEditor from '@/components/admin/BrandingEditor';
import { adminApi } from '@/lib/admin/admin-api';
import { can, requireAdmin } from '@/lib/admin/admin-context';
import { toAdminFailure } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Identidade visual' };

export default async function Page() {
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  const { session } = gate;
  if (!can(session.operator, 'branding.read')) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode consultar a identidade visual.</AdminMessage>;
  }

  const res = await adminApi.getBranding(session);
  if (!res.ok) {
    const failure = toAdminFailure(res.status, res.error);
    if (failure.code === 'SESSION_INVALID') redirect(ADMIN_ROUTES.login);
    return <AdminMessage title="Não foi possível carregar a identidade visual">{failure.message}</AdminMessage>;
  }

  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-admin-muted">Personalização</p>
      <h1 className="mb-4 text-[18px] font-bold text-admin-text">Identidade visual</h1>
      <BrandingEditor initial={res.data} canManage={can(session.operator, 'branding.manage')} />
    </div>
  );
}
