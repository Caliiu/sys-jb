import { PageLoading } from '@/admin/components/page-loading';
import PlayerLoading from '@/components/ui/PlayerLoading';

/**
 * Carregamento da raiz: envolve também o layout do painel (que lê host e cookie do tema). O loading.tsx não vê a
 * requisição, então leva as duas versões e o CSS escolhe: no host do painel o <html> tem a classe admin-ui (posta pelo
 * layout raiz, antes de qualquer carregamento aparecer).
 */
export default function Loading() {
  return (
    <>
      <div className="in-[.admin-ui]:hidden">
        <PlayerLoading />
      </div>
      <PageLoading className="hidden in-[.admin-ui]:flex" />
    </>
  );
}
