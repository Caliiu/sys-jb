import Image from 'next/image';
import Link from 'next/link';
import type { ErrorAction } from '@/components/errors/ErrorScreen';

interface AdminErrorScreenProps {
  code: string;
  title: string;
  children: string;
  primary: ErrorAction;
}

/** Página de erro do painel (401, 404), no visual do login do painel: cartão claro com a marca da plataforma. */
export default function AdminErrorScreen({ code, title, children, primary }: AdminErrorScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-admin-bg px-4 font-body text-admin-text">
      <main className="w-full max-w-sm overflow-hidden rounded-xl bg-admin-surface shadow-admin">
        <div className="flex items-center justify-center bg-admin-text px-6 py-6">
          <Image
            src="/brands/fenix-igaming.webp"
            alt="Fenix iGaming"
            width={640}
            height={101}
            className="h-auto w-full max-w-[220px]"
          />
        </div>
        <div className="p-6 text-center">
          <p className="font-display text-[44px] leading-none text-admin-accent">{code}</p>
          <h1 className="mt-3 text-[16px] font-bold">{title}</h1>
          <p className="mt-2 text-[13px] text-admin-muted">{children}</p>
          <Link
            href={primary.href}
            className="mt-6 flex h-10 w-full items-center justify-center rounded-lg bg-admin-accent text-[13.5px] font-semibold text-white hover:bg-admin-accent-dark"
          >
            {primary.label}
          </Link>
        </div>
      </main>
    </div>
  );
}
