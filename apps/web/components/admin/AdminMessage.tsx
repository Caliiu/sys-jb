import Link from 'next/link';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

interface AdminMessageProps {
  title: string;
  children: string;
  /** Mostra o atalho de volta à lista de usuários. */
  backToUsers?: boolean;
}

/** Aviso de página inteira dentro do painel (sem permissão, falha ao carregar, não encontrado). */
export default function AdminMessage({ title, children, backToUsers = false }: AdminMessageProps) {
  return (
    <section role="alert" className="rounded-xl bg-admin-surface p-6 shadow-admin">
      <h1 className="text-[16px] font-bold text-admin-text">{title}</h1>
      <p className="mt-2 text-[13px] text-admin-muted">{children}</p>
      {backToUsers && (
        <Link href={ADMIN_ROUTES.users} className="mt-4 inline-block text-[13px] font-semibold text-admin-accent">
          Voltar para usuários
        </Link>
      )}
    </section>
  );
}
