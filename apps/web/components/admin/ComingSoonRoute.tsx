import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/admin-context';
import AdminMessage from './AdminMessage';
import { AdminUnavailable } from './AdminUnavailable';
import ComingSoon from './ComingSoon';
import { canSeeNavLink, findNavItem } from './admin-nav';

/** Título da aba da página "Em breve" (o nome do item no menu). */
export function comingSoonMetadata(href: string): Metadata {
  return { title: findNavItem(href)?.item.label };
}

/**
 * Página "Em breve" de um item do menu: confere a sessão e a mesma permissão que mostra o item (digitar o endereço
 * não passa por cima do menu). Rota fora do menu = 404.
 */
export default async function ComingSoonRoute({ href }: { href: string }) {
  const found = findNavItem(href);
  if (!found?.item.soon) notFound();
  const gate = await requireAdmin();
  if (!gate.ok) return <AdminUnavailable message={gate.message} />;
  if (!canSeeNavLink(gate.session.operator.permissions, found.item)) {
    return <AdminMessage title="Sem permissão">Seu perfil não pode acessar esta página.</AdminMessage>;
  }
  return <ComingSoon title={found.item.label} icon={found.item.icon} />;
}
