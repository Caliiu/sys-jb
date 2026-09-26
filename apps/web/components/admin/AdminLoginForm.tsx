'use client';

import { LockKeyhole, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { adminLoginAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

const inputClass =
  'h-11 w-full rounded-lg border border-admin-border bg-admin-surface pl-3 pr-10 text-[13.5px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';

export default function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim()) return setError('Informe o e-mail.');
    if (!password) return setError('Informe a senha.');

    setError(null);
    setSubmitting(true);
    try {
      const result = await adminLoginAction({ email, password });
      if (result.ok) {
        router.replace(ADMIN_ROUTES.users);
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError('Não foi possível entrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor="admin-email" className="sr-only">
          E-mail
        </label>
        <input
          id="admin-email"
          type="email"
          placeholder="E-mail"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
        />
        <UserRound
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted"
          aria-hidden
        />
      </div>

      <div className="relative">
        <label htmlFor="admin-password" className="sr-only">
          Senha
        </label>
        <input
          id="admin-password"
          type="password"
          placeholder="Senha"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
        <LockKeyhole
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted"
          aria-hidden
        />
      </div>

      {error && (
        <p role="alert" className="text-[12.5px] font-semibold text-admin-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 h-11 w-full rounded-lg bg-admin-accent text-[13.5px] font-semibold text-white disabled:opacity-60"
      >
        {submitting ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
