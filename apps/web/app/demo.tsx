'use client';

import type { PublicUser, PublicWallet, UpdateUserRequest } from '@sysjb/contracts';
import { type FormEvent, useState, useTransition } from 'react';
import type { ApiResult } from '@/lib/api-result';
import { createUserAction, getUserAction, updateUserAction } from './actions';

const inputClass =
  'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30';
const buttonClass =
  'rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

function Field({ label, name, defaultValue, hint }: { label: string; name: string; defaultValue?: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {hint && <span className="ml-1 text-xs text-slate-500">{hint}</span>}
      <input name={name} defaultValue={defaultValue} className={inputClass} autoComplete="off" />
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const WALLET_LABELS: Array<[keyof PublicWallet, string]> = [
  ['balanceJb', 'Saldo JB'],
  ['bonusJb', 'Bônus JB'],
  ['prizesJb', 'Prêmios JB'],
  ['totalAvailableJb', 'Total disponível JB'],
  ['balanceGames', 'Saldo Games'],
  ['bonusGames', 'Bônus Games'],
  ['prizesGames', 'Prêmios Games'],
  ['totalAvailableGames', 'Total disponível Games'],
  ['withdrawable', 'Sacável'],
];

function WalletView({ wallet }: { wallet: PublicWallet }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {WALLET_LABELS.map(([key, label]) => (
        <div key={key} className="flex justify-between border-b border-slate-100 py-1">
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-mono tabular-nums" title={`${wallet[key]} centavos`}>
            {brl(wallet[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

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

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(() =>
      createUserAction({
        name: text(form, 'name'),
        phone: text(form, 'phone'),
        document: text(form, 'document'),
        email: text(form, 'email') || null,
        avatar: text(form, 'avatar') || null,
      }),
    );
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
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-2">
      <div className="space-y-6">
        <Card title="Cadastro">
          <form onSubmit={onCreate} className="space-y-3">
            <Field label="Nome" name="name" />
            <Field label="Telefone" name="phone" hint="DDD + número" />
            <Field label="Documento" name="document" hint="11 dígitos (só formato)" />
            <Field label="Email" name="email" hint="opcional" />
            <Field label="Avatar (URL)" name="avatar" hint="opcional, http(s)" />
            <button type="submit" disabled={pending} className={buttonClass}>
              Cadastrar
            </button>
          </form>
        </Card>

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
              <Field label="Documento" name="document" defaultValue={user.document} />
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
          <p className="text-sm text-slate-500">Cadastre ou consulte um usuário para ver o contrato retornado.</p>
        )}
        <p className="mt-4 text-xs text-slate-500">Valores monetários em centavos (inteiros).</p>
      </Card>
    </main>
  );
}
