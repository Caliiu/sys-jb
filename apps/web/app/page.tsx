import type { PublicTenant } from '@sysjb/contracts';
import { headers } from 'next/headers';
import type { CSSProperties } from 'react';
import { apiRequest } from '@/lib/api-client';
import { demoAllowed, hostnameOnly } from '@/lib/server-env';
import { Demo } from './demo';

export const dynamic = 'force-dynamic';

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="mt-3 space-y-2 text-sm text-slate-600">{children}</div>
    </main>
  );
}

export default async function Page() {
  const hostname = hostnameOnly((await headers()).get('host'));

  if (!demoAllowed(hostname)) {
    return (
      <Notice title="Demonstração indisponível">
        <p>Esta interface roda apenas em desenvolvimento, em hostnames *.localhost, enquanto não há autenticação real.</p>
      </Notice>
    );
  }

  const tenant = await apiRequest<PublicTenant>(hostname!, 'GET', '/v1/tenant');
  if (!tenant.ok) {
    return (
      <Notice title="Banca não disponível neste endereço">
        <p>
          <code>{hostname}</code>: {tenant.error.message} ({tenant.status})
        </p>
        <p>
          Acesse <code>http://aurora.localhost:3000</code> ou <code>http://boreal.localhost:3000</code> com a API em
          execução.
        </p>
      </Notice>
    );
  }

  const style = {
    '--brand-primary': tenant.data.primaryColor,
    '--brand-secondary': tenant.data.secondaryColor,
  } as CSSProperties;

  return (
    <div style={style} className="min-h-screen">
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between px-4 py-5">
          <h1 className="text-2xl font-semibold">{tenant.data.name}</h1>
          <span className="text-xs opacity-80">demonstração local · {hostname}</span>
        </div>
      </header>
      <Demo />
    </div>
  );
}
