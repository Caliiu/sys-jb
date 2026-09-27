'use client';

import type { AdminUserListItem } from '@sysjb/contracts';
import { Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState, useTransition } from 'react';
import { searchUsersAction, setPromoterAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { COMMISSION_HELP, parseCommission } from '@/lib/admin/commission';
import { maskCpfInput } from '@/lib/masks';
import StatusBadge from './StatusBadge';

const fieldClass =
  'h-10 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text outline-none focus:ring-2 focus:ring-admin-accent';

/**
 * "Novo promotor": busca o jogador (nome, CPF, telefone ou ID), escolhe e define a comissão. O usuário
 * continua sendo um jogador comum; só ganha a comissão e o link de convite passa a vinculá-lo como promotor.
 */
export default function AddPromoterPanel() {
  const router = useRouter();
  const searchId = useId();
  const commissionId = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<AdminUserListItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AdminUserListItem | null>(null);
  const [commission, setCommission] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();

  function reset() {
    setTerm('');
    setResults(null);
    setSelected(null);
    setCommission('');
    setError(null);
  }

  function toggle() {
    if (open) reset();
    setOpen(!open);
  }

  function handleFailure(result: { code: string; message: string }) {
    if (result.code === 'SESSION_INVALID') router.replace(ADMIN_ROUTES.login);
    else setError(result.message);
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (searching) return;
    if (term.trim().length < 2) return setError('Digite ao menos 2 caracteres.');

    setError(null);
    setSelected(null);
    setSearching(true);
    try {
      const result = await searchUsersAction(term);
      if (result.ok) setResults(result.data);
      else handleFailure(result);
    } catch {
      setError('Não foi possível buscar. Tente novamente.');
    } finally {
      setSearching(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!selected || saving || refreshing) return;
    const bps = parseCommission(commission);
    if (bps === null) return setError(COMMISSION_HELP);

    setError(null);
    setSaving(true);
    try {
      const result = await setPromoterAction(selected.id, bps);
      if (result.ok) {
        startTransition(() => {
          reset();
          setOpen(false);
          router.refresh();
        });
      } else {
        handleFailure(result);
      }
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Novo promotor" className="mb-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-10 items-center gap-1.5 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {open ? 'Fechar' : 'Novo promotor'}
      </button>

      {open && (
        <div className="mt-3 rounded-xl bg-admin-surface p-5 shadow-admin">
          <p className="text-[13px] text-admin-muted">
            Escolha um jogador já cadastrado e defina a comissão sobre as apostas dos jogadores que ele trouxer.
          </p>

          <form
            onSubmit={handleSearch}
            role="search"
            aria-label="Buscar jogador para promover"
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <div className="relative flex-1">
              <label htmlFor={searchId} className="sr-only">
                Buscar jogador
              </label>
              <input
                id={searchId}
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                maxLength={100}
                placeholder="Buscar por nome, CPF, telefone ou ID"
                className={`${fieldClass} w-full pl-9`}
              />
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted"
                aria-hidden
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="h-10 rounded-lg border border-admin-border px-4 text-[13px] font-semibold text-admin-text disabled:opacity-60"
            >
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </form>

          {results && results.length === 0 && (
            <p role="status" className="mt-3 text-[13px] text-admin-muted">
              Nenhum jogador encontrado.
            </p>
          )}

          {results && results.length > 0 && !selected && (
            <ul
              aria-label="Jogadores encontrados"
              className="mt-3 divide-y divide-admin-border rounded-lg border border-admin-border"
            >
              {results.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-admin-text">{user.name}</p>
                    <p className="text-[12px] tabular-nums text-admin-muted">
                      ID {user.displayId} · {maskCpfInput(user.document)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={user.status} />
                    <button
                      type="button"
                      onClick={() => setSelected(user)}
                      className="text-[12.5px] font-semibold text-admin-accent"
                    >
                      Selecionar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <form onSubmit={handleSave} noValidate className="mt-4 flex flex-wrap items-end gap-3">
              <p className="w-full text-[13px] text-admin-text">
                Promotor: <strong>{selected.name}</strong> (ID {selected.displayId}){' '}
                <button type="button" onClick={() => setSelected(null)} className="font-semibold text-admin-accent">
                  Trocar
                </button>
              </p>
              <div>
                <label
                  htmlFor={commissionId}
                  className="text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted"
                >
                  Comissão (%)
                </label>
                <input
                  id={commissionId}
                  value={commission}
                  onChange={(event) => {
                    setCommission(event.target.value);
                    setError(null);
                  }}
                  inputMode="decimal"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="Ex.: 10"
                  className={`${fieldClass} mt-1 block w-32`}
                />
              </div>
              <button
                type="submit"
                disabled={saving || refreshing}
                className="h-10 rounded-lg bg-admin-accent px-4 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {saving || refreshing ? 'Salvando…' : 'Tornar promotor'}
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-3 text-[12.5px] font-semibold text-admin-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
