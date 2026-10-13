'use client';

import { type AdminQuoteTable, MAX_QUOTE_PRIZE_CENTS } from '@sysjb/contracts';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { saveQuoteValuesAction } from '@/app/admin/actions';
import { MoneyInput } from '@/admin/components/money-input';
import { Alert, AlertDescription } from '@/admin/components/ui/alert';
import { Badge } from '@/admin/components/ui/badge';
import { Button } from '@/admin/components/ui/button';
import { Input } from '@/admin/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/admin/components/ui/table';
import { FieldError } from '@/admin/components/field-error';
import { cn } from '@/admin/lib/utils';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import {
  filterQuoteRows,
  QUOTE_PRIZE_HELP,
  type QuoteGameId,
  type QuoteRow,
  quoteRows,
  quoteValuesDiff,
} from '@/lib/admin/quotes';
import { formatCents } from '@/lib/currency';

const GAMES: ReadonlyArray<{ id: QuoteGameId; title: string; hint: string }> = [
  { id: 'tradicional', title: 'Tradicional', hint: 'prêmio para cada R$ 1,00 apostado' },
  { id: 'fazendinha', title: 'Fazendinha', hint: 'prêmio de cada número, pelo valor da aposta' },
];

const FILTER_MAX = 60;

type QuoteValuesTableProps = {
  table: AdminQuoteTable;
  /** `quotes.manage`: pode editar os valores; sem ela, só consulta. */
  canManage: boolean;
  /** Avisa a tela quando entra/sai da edição (para travar a troca de tabela com alterações abertas). */
  onEditingChange?: (editing: boolean) => void;
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Valores de pagamento da tabela (Código, Descrição, Valor), com filtro na tela. Com `quotes.manage`, os valores são
 * editados na própria tabela e salvar envia só os alterados. Montada por tabela (key = id): trocar de tabela zera a
 * edição.
 */
export function QuoteValuesTable({ table, canManage, onEditingChange }: QuoteValuesTableProps) {
  const router = useRouter();
  // A tabela salva: a do servidor ou a devolvida pelo último salvar (até o refresh trazer a nova do servidor).
  const [synced, setSynced] = useState({ source: table, current: table });
  if (synced.source !== table) setSynced({ source: table, current: table });
  const current = synced.source === table ? synced.current : table;

  const rows = useMemo(() => quoteRows(current), [current]);
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => filterQuoteRows(rows, filter), [rows, filter]);

  const [editing, setEditingState] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changedCount = useMemo(
    () => rows.filter((row) => draft[row.key] !== undefined && draft[row.key] !== row.prizeCents).length,
    [rows, draft],
  );

  const setEditing = (value: boolean) => {
    setEditingState(value);
    onEditingChange?.(value);
  };

  const stopEditing = () => {
    setDraft({});
    setErrors({});
    setMessage(null);
    setEditing(false);
  };

  const change = (row: QuoteRow, cents: number) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (cents === row.prizeCents) delete next[row.key];
      else next[row.key] = cents;
      return next;
    });
    setErrors((prev) => {
      if (!(row.key in prev)) return prev;
      const next = { ...prev };
      delete next[row.key];
      return next;
    });
    setMessage(null);
  };

  const save = () => {
    const diff = quoteValuesDiff(rows, draft);
    if (!diff.ok) {
      setErrors(diff.fieldErrors);
      setMessage('Corrija os valores destacados.');
      return;
    }
    if (diff.count === 0) {
      stopEditing();
      return;
    }
    startTransition(async () => {
      const result = await saveQuoteValuesAction(current.id, diff.changes);
      if (!result.ok) {
        if (result.code === 'SESSION_INVALID') {
          router.replace(ADMIN_ROUTES.login);
          return;
        }
        const rowKeys = new Set(rows.map((row) => row.key));
        const fieldErrors = result.fieldErrors ?? {};
        const general = Object.entries(fieldErrors)
          .filter(([field]) => !rowKeys.has(field))
          .map(([, text]) => text);
        setErrors(Object.fromEntries(Object.entries(fieldErrors).filter(([field]) => rowKeys.has(field))));
        setMessage([result.message, ...general].join(' '));
        // Parte pode ter sido salva (o Tradicional antes da Fazendinha) ou a tabela pode ter mudado: recarrega.
        router.refresh();
        return;
      }
      setSynced((prev) => ({ ...prev, current: result.data }));
      stopEditing();
      toast.success(`${diff.count} ${plural(diff.count, 'valor salvo', 'valores salvos')}.`);
      router.refresh();
    });
  };

  const groups = GAMES.map((game) => ({ ...game, rows: visible.filter((row) => row.game === game.id) })).filter(
    (group) => group.rows.length > 0,
  );

  return (
    <section aria-label="Valores de pagamento" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          type="search"
          aria-label="Filtrar por código ou descrição"
          placeholder="Filtrar por código ou descrição..."
          value={filter}
          maxLength={FILTER_MAX}
          onChange={(event) => setFilter(event.target.value)}
          className="h-9 w-full sm:w-72"
        />
        {canManage && !editing && (
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <Pencil /> Editar valores
          </Button>
        )}
      </div>

      {editing && (
        <p className="text-sm text-muted-foreground">
          Edite os valores na tabela. {QUOTE_PRIZE_HELP} Salvar envia só o que mudou.
        </p>
      )}

      <div className="overflow-hidden rounded-md border">
        <Table aria-label={`Tabela de pagamento ${current.name}`} aria-busy={pending || undefined}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-48 text-right">Valor do pagamento (R$)</TableHead>
            </TableRow>
          </TableHeader>
          {groups.length > 0 && (
            <TableBody>
              {groups.map((group) => (
                <Fragment key={group.id}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead colSpan={3} scope="colgroup" className="h-9 text-xs">
                      {group.title} <span className="font-normal text-muted-foreground">· {group.hint}</span>
                    </TableHead>
                  </TableRow>
                  {group.rows.map((row) => {
                    const value = draft[row.key] ?? row.prizeCents;
                    const error = errors[row.key];
                    const changed = value !== row.prizeCents;
                    const errorId = `quote-${row.key.replace(/:/g, '-')}-error`;
                    return (
                      <TableRow
                        key={row.key}
                        data-changed={changed || undefined}
                        className={cn(changed && 'bg-accent/50')}
                      >
                        <TableCell className="font-mono text-xs font-medium">{row.code}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {editing ? (
                            <div className="ms-auto flex w-44 flex-col gap-1">
                              <MoneyInput
                                aria-label={`Valor do pagamento ${row.code} (${row.description})`}
                                value={value}
                                allowZero
                                maxCents={MAX_QUOTE_PRIZE_CENTS}
                                onValueChange={(cents) => change(row, cents ?? 0)}
                                disabled={pending}
                                aria-invalid={!!error}
                                aria-describedby={error ? errorId : undefined}
                                className="h-8 text-right"
                              />
                              <FieldError id={errorId} message={error} />
                            </div>
                          ) : row.prizeCents === 0 ? (
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <Badge variant="outline">Desligada</Badge>
                              {formatCents(0)}
                            </span>
                          ) : (
                            formatCents(row.prizeCents)
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          )}
        </Table>
        {groups.length === 0 && (
          <p role="status" className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
            {filter.trim() ? 'Nenhuma modalidade encontrada para esse filtro.' : 'Tabela sem modalidades.'}
          </p>
        )}
      </div>

      {editing && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-4 py-3 shadow-sm">
          <span role="status" className="text-sm text-muted-foreground">
            {changedCount === 0
              ? 'Nenhuma alteração.'
              : `${changedCount} ${plural(changedCount, 'valor alterado', 'valores alterados')}.`}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={stopEditing} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={pending || changedCount === 0}>
              {pending ? 'Salvando…' : 'Salvar valores'}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
