'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { type PlayerOption, searchPlayersAction } from '@/app/admin/actions';
import { Button } from '@/admin/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/admin/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/admin/components/ui/popover';
import { cn } from '@/admin/lib/utils';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';

type PlayerComboboxProps = {
  id?: string;
  /** Apostador escolhido; null = todos. */
  value: PlayerOption | null;
  onChange: (player: PlayerOption | null) => void;
  /** Texto da opção "todos". */
  allLabel?: string;
};

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

/** "1020 | José Ávila" (sem o número quando não se sabe, ex.: "Apostador filtrado"). */
export const playerOptionLabel = (player: PlayerOption) =>
  player.displayId ? `${player.displayId} | ${player.name}` : player.name;

/**
 * Apostador nos filtros: parece um select, mas busca no servidor (nome, CPF, telefone ou ID) conforme se digita. Com
 * milhares de apostadores, uma lista completa seria pesada.
 */
export function PlayerCombobox({ id, value, onChange, allLabel = 'Todos os apostadores' }: PlayerComboboxProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PlayerOption[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const request = useRef(0);
  const short = term.trim().length < MIN_CHARS;

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
    onChange(player);
    setOpen(false);
  };

  const message = short
    ? `Digite ao menos ${MIN_CHARS} caracteres para buscar.`
    : status === 'loading'
      ? 'Buscando…'
      : status === 'error'
        ? 'Não foi possível buscar. Tente novamente.'
        : status === 'done' && results.length === 0
          ? 'Nenhum apostador encontrado.'
          : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal sm:w-60"
        >
          <span className="truncate">{value ? playerOptionLabel(value) : allLabel}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        {/* A lista já vem filtrada do servidor: o cmdk não filtra de novo. */}
        <Command shouldFilter={false} label="Buscar apostador">
          <CommandInput
            value={term}
            onValueChange={(text) => {
              setTerm(text);
              if (text.trim().length < MIN_CHARS) {
                request.current += 1;
                setResults([]);
                setStatus('idle');
              }
            }}
            maxLength={100}
            placeholder="Nome, CPF, telefone ou ID"
          />
          <CommandList>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={() => choose(null)}>
                <Check className={cn(value === null ? 'opacity-100' : 'opacity-0')} />
                {allLabel}
              </CommandItem>
              {!short &&
                results.map((player) => (
                  <CommandItem key={player.id} value={player.id} onSelect={() => choose(player)}>
                    <Check className={cn(value?.id === player.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{playerOptionLabel(player)}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
          <p aria-live="polite" className="px-3 pb-2 text-xs text-muted-foreground empty:hidden">
            {message}
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
