'use client';

import type { PublicUser, UpdateUserRequest } from '@sysjb/contracts';
import { type FormEvent, useState, useTransition } from 'react';
import { Card, WalletView } from '@/components/dev/WalletView';
import type { ApiResult } from '@/lib/api-result';
import { getUserAction, updateUserAction } from './actions';

const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';
const buttonClass =
  'rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

function Field({
  label,
  name,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {hint && <span className="ml-1 text-xs text-slate-500">{hint}</span>}
      <input name={name} defaultValue={defaultValue} className={inputClass} autoComplete="off" />
    </label>
  );
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

/** Ferramentas de desenvolvimento: consulta e edição por UUID, exibindo o contrato retornado. */
export function Demo() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ApiResult<PublicUser> | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(action: () => Promise<ApiResult<PublicUser>>) {
    setNotice(null);
    startTransition(async () => {
      const res = await action();
      setResult(res);
      if (res.ok) setUser(res.data);
    });
  }

  function onLookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = text(new FormData(e.currentTarget), 'id');
    run(() => getUserAction(id));
  }

  function onUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const form = new FormData(e.currentTarget);
    // Envia apenas o que mudou. Email/avatar vazios viram null (limpar).
    const patch: UpdateUserRequest = {};
    for (const key of ['name', 'phone', 'document'] as const) {
      if (text(form, key) !== user[key]) patch[key] = text(form, key);
    }
    for (const key of ['email', 'avatar'] as const) {
      const value = text(form, key) || null;
      if (value !== user[key]) patch[key] = value;
    }
    if (Object.keys(patch).length === 0) {
      setNotice('Nenhum campo alterado.');
      return;
    }
    run(() => updateUserAction(user.id, patch));
  }

  return (
    <section className="mx-auto max-w-5xl px-4 pb-10">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Ferramentas de desenvolvimento (somente *.localhost)
      </h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Consulta por UUID">
            <form onSubmit={onLookup} className="flex gap-2">
              <input name="id" placeholder="00000000-0000-0000-0000-000000000000" className={inputClass} />
              <button type="submit" disabled={pending} className={`${buttonClass} mt-1 shrink-0`}>
                Buscar
              </button>
            </form>
          </Card>

          {user && (
            <Card title={`Edição · #${user.displayId}`}>
              <form key={JSON.stringify(user)} onSubmit={onUpdate} className="space-y-3">
                <Field label="Nome" name="name" defaultValue={user.name} />
                <Field label="Telefone" name="phone" defaultValue={user.phone} />
                <Field label="CPF" name="document" defaultValue={user.document} />
                <Field label="Email" name="email" defaultValue={user.email ?? ''} hint="vazio = limpar" />
                <Field label="Avatar (URL)" name="avatar" defaultValue={user.avatar ?? ''} hint="vazio = limpar" />
                <button type="submit" disabled={pending} className={buttonClass}>
                  Salvar alterações
                </button>
                {notice && <p className="text-sm text-slate-500">{notice}</p>}
              </form>
              <h3 className="mt-6 mb-2 text-sm font-semibold">Carteira (somente leitura)</h3>
              <WalletView wallet={user.wallet} />
            </Card>
          )}
        </div>

        <Card title="Resposta da API">
          {result ? (
            <>
              <p className={`mb-2 text-sm font-medium ${result.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                HTTP {result.status}
              </p>
              <pre className="overflow-x-auto rounded-md bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
                {JSON.stringify(result.ok ? result.data : result.error, null, 2)}
              </pre>
            </>
          ) : (
            <p className="text-sm text-slate-500">Consulte um usuário para ver o contrato retornado.</p>
          )}
          <p className="mt-4 text-xs text-slate-500">Valores monetários em centavos (inteiros).</p>
        </Card>
      </div>
    </section>
  );
}
