import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComingSoon } from '@/admin/components/coming-soon';
import { canSee, findNavLink } from '@/admin/components/layout/data/sidebar-data';
import { Main } from '@/admin/components/layout/main';
import { ForbiddenError } from '@/admin/features/errors/forbidden';
import { Unavailable } from '@/admin/features/errors/unavailable';
import { requireAdmin } from '@/lib/admin/admin-context';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string[] }> };

const linkOf = async ({ params }: Props) => findNavLink(`/${(await params).slug.join('/')}`);

export async function generateMetadata(props: Props): Promise<Metadata> {
  return { title: (await linkOf(props))?.title };
}

/**
 * Itens do menu que ainda não foram refeitos no novo painel: "Em breve" (com sessão e a mesma permissão que mostra o
 * item). Rota fora do menu = 404. Quando a página for portada, a rota própria dela passa na frente desta.
 */
export default async function Page(props: Props) {
  const link = await linkOf(props);
  if (!link) notFound();
  const gate = await requireAdmin();
  if (!gate.ok) return <Unavailable message={gate.message} />;

  return (
    <Main>{canSee(gate.session.operator.permissions, link.permission) ? <ComingSoon /> : <ForbiddenError />}</Main>
  );
}
