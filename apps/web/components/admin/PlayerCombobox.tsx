'use client';

import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { type PlayerOption, searchPlayersAction } from '@/app/admin/actions';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { controlClass, labelClass } from './filter-styles';

interface PlayerComboboxProps {
  id: string;
  label: string;
  /** Nome do campo no formulário (o id do apostador; vazio = todos). */
  name: string;
  /** Apostador já escolhido (vindo da URL). */
  initial: PlayerOption | null;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

const optionLabel = (player: PlayerOption) => `${player.displayId} - ${player.name}`;

/**
 * Escolha do apostador nos filtros: parece um select, mas busca no servidor (nome, CPF, telefone ou ID) conforme
 * se digita. Com milhares de apostadores, uma lista completa seria pesada. Esc ou clique fora fecham.
 */
export default function PlayerCombobox({ id, label, name, initial }: PlayerComboboxProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<PlayerOption | null>(initial);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PlayerOption[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const listId = useId();

  const close = (focusButton: boolean) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  // Busca com espera curta entre teclas; só a resposta da última busca vale.
  useEffect(() => {
    const query = term.trim();
    if (!open || query.length < MIN_CHARS) return;
    const current = ++request.current;
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const result = await searchPlayersAction(query);
        if (current !== request.current) return;
        if (result.ok) {
          setResults(result.data);
          setStatus('done');
        } else if (result.code === 'SESSION_INVALID') {
          router.replace(ADMIN_ROUTES.login);
        } else {
          setStatus('error');
        }
      } catch {
        if (current === request.current) setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term, open, router]);

  const choose = (player: PlayerOption | null) => {
    setSelected(player);
    close(true);
  };

  const short = term.trim().length < MIN_CHARS;

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input type="hidden" name={name} value={selected?.id ?? ''} />
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`${controlClass} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{selected ? optionLabel(selected) : 'Todos'}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-admin-muted" aria-hidden />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-admin-border bg-admin-surface shadow-lg"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close(true);
            }
          }}
        >
          <div className="flex items-center gap-2 border-b border-admin-border px-3">
            <Search className="h-4 w-4 shrink-0 text-admin-muted" aria-hidden />
            <input
              type="search"
              autoFocus
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                if (event.target.value.trim().length < MIN_CHARS) {
                  request.current += 1;
                  setResults([]);
                  setStatus('idle');
                }
              }}
              maxLength={100}
              placeholder="Nome, CPF, telefone ou ID"
              aria-label={`Buscar ${label.toLowerCase()}`}
              className="h-10 w-full bg-transparent text-[14px] text-admin-text outline-none placeholder:text-admin-muted"
            />
          </div>
          <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1">
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={selected === null}
                onClick={() => choose(null)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[14px] hover:bg-admin-hover"
              >
                <Check className={`h-4 w-4 ${selected === null ? '' : 'invisible'}`} aria-hidden />
                Todos
              </button>
            </li>
            {!short &&
              results.map((player) => (
                <li key={player.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected?.id === player.id}
                    onClick={() => choose(player)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[14px] hover:bg-admin-hover"
                  >
                    <Check className={`h-4 w-4 ${selected?.id === player.id ? '' : 'invisible'}`} aria-hidden />
                    <span className="truncate">{optionLabel(player)}</span>
                  </button>
                </li>
              ))}
          </ul>
          <p aria-live="polite" className="px-3 pb-2 text-[12.5px] text-admin-muted empty:hidden">
            {short
              ? `Digite ao menos ${MIN_CHARS} caracteres para buscar.`
              : status === 'loading'
                ? 'Buscando…'
                : status === 'error'
                  ? 'Não foi possível buscar. Tente novamente.'
                  : status === 'done' && results.length === 0
                    ? 'Nenhum apostador encontrado.'
                    : ''}
          </p>
        </div>
      )}
    </div>
  );
}
