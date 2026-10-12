import type { Metadata } from 'next';
import { NotFoundError } from '@/admin/features/errors/not-found-error';
import ErrorScreen from '@/components/errors/ErrorScreen';
import Notice from '@/components/ui/Notice';
import { errorAudience } from '@/lib/error-pages';
import { ROUTES } from '@/lib/routes';

export const metadata: Metadata = { title: 'Página não encontrada' };

/** 404 de endereço inexistente (e de notFound() sem página própria): versão do painel ou da banca, pelo endereço. */
export default async function NotFound() {
  const audience = await errorAudience();
  if (audience.kind === 'admin') return <NotFoundError />;
  if (audience.kind === 'tenant') {
    return (
      <ErrorScreen
        tenant={audience.tenant}
        code="404"
        title="Página não encontrada"
        primary={{ label: 'Voltar ao início', href: ROUTES.home }}
      >
        <p>O endereço que você abriu não existe ou foi alterado.</p>
      </ErrorScreen>
    );
  }
  return (
    <Notice title="Página não encontrada">
      <p>O endereço que você abriu não existe.</p>
    </Notice>
  );
}
