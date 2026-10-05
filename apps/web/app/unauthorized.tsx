import type { Metadata } from 'next';
import AdminErrorScreen from '@/components/admin/AdminErrorScreen';
import ErrorScreen from '@/components/errors/ErrorScreen';
import Notice from '@/components/ui/Notice';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { errorAudience } from '@/lib/error-pages';

export const metadata: Metadata = { title: 'Acesso não autorizado' };

/**
 * 401 (unauthorized()): página que exige login aberta sem sessão, ou com a sessão expirada. A entrada do app e do
 * painel (/) vai direto ao login; aqui é para quem abriu um link interno. Versão do painel ou da banca, pelo endereço.
 */
export default async function Unauthorized() {
  const audience = await errorAudience();
  if (audience.kind === 'admin') {
    return (
      <AdminErrorScreen
        code="401"
        title="Acesso não autorizado"
        primary={{ label: 'Entrar no painel', href: ADMIN_ROUTES.login }}
      >
        Sua sessão terminou ou você ainda não entrou. Entre com seu e-mail e senha de operador para continuar.
      </AdminErrorScreen>
    );
  }
  if (audience.kind === 'tenant') {
    return (
      <ErrorScreen
        tenant={audience.tenant}
        code="401"
        title="Entre para continuar"
        primary={{ label: 'Entrar', href: '/login' }}
        secondary={{ label: 'Criar conta', href: '/cadastro' }}
      >
        <p>Esta página é só para quem está logado. Sua sessão pode ter terminado: entre de novo para continuar.</p>
      </ErrorScreen>
    );
  }
  return (
    <Notice title="Acesso não autorizado">
      <p>Entre na sua conta para continuar.</p>
    </Notice>
  );
}
