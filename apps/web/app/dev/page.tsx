import { notFound } from 'next/navigation';
import { TenantUnavailable } from '@/components/ui/Notice';
import { brandStyle } from '@/lib/brand-style';
import { resolveRequest } from '@/lib/request-context';
import { demoAllowed } from '@/lib/server-env';
import { Demo } from '../demo';

export const dynamic = 'force-dynamic';

/** Ferramentas de desenvolvimento (consulta/edição por UUID). Não existem em produção. */
export default async function Page() {
  const ctx = await resolveRequest();
  if (!ctx.ok) return <TenantUnavailable hostname={ctx.hostname} message={ctx.message} />;
  if (!demoAllowed(ctx.hostname)) notFound();

  return (
    <div style={brandStyle(ctx.tenant)} className="min-h-screen bg-slate-50">
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between px-4 py-5">
          <h1 className="font-display text-2xl">{ctx.tenant.name}</h1>
          <span className="text-xs opacity-80">{ctx.hostname} · desenvolvimento</span>
        </div>
      </header>
      <div className="pt-8">
        <Demo />
      </div>
    </div>
  );
}
