import type { ReactNode } from 'react';

export default function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="mt-3 space-y-2 text-sm text-slate-600">{children}</div>
    </main>
  );
}

export function TenantUnavailable({ hostname, message }: { hostname: string | null; message: string }) {
  return (
    <Notice title="Banca não disponível neste endereço">
      <p>
        <code>{hostname ?? '(sem hostname)'}</code>: {message}
      </p>
      <p>
        Em desenvolvimento, acesse <code>http://aurora.localhost:3000</code> ou{' '}
        <code>http://boreal.localhost:3000</code> com a API em execução.
      </p>
    </Notice>
  );
}
