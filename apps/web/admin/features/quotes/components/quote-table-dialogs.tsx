'use client';

import { type AdminQuoteTableSummary, QUOTE_TABLE_NAME_MAX } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  createQuoteTableAction,
  deleteQuoteTableAction,
  renameQuoteTableAction,
  setDefaultQuoteTableAction,
} from '@/app/admin/actions';
import { ConfirmDialog } from '@/admin/components/confirm-dialog';
import { Alert, AlertDescription } from '@/admin/components/ui/alert';
import { Button } from '@/admin/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/admin/components/ui/dialog';
import { Input } from '@/admin/components/ui/input';
import { Label } from '@/admin/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/admin/components/ui/select';
import { FieldError } from '@/admin/components/field-error';
import type { AdminActionResult } from '@/lib/admin/admin-result';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { quotesHref, quoteTableNameError } from '@/lib/admin/quotes';

/** Radix Select não aceita item com valor vazio: "copiar dos valores padrão". */
const SYSTEM_DEFAULTS = 'padrao-do-sistema';

const unitsText = (count: number) => (count === 1 ? '1 unidade' : `${count} unidades`);

/** Executa a ação; sessão encerrada vai para o login. Devolve o resultado só quando não redirecionou. */
function useQuoteAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = <T,>(action: () => Promise<AdminActionResult<T>>, onResult: (result: AdminActionResult<T>) => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok && result.code === 'SESSION_INVALID') {
        router.replace(ADMIN_ROUTES.login);
        return;
      }
      onResult(result);
    });
  return { router, pending, run };
}

type NameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nova tabela (com a origem dos prêmios) ou renomear a `table`. */
  mode: 'create' | 'rename';
  tables: readonly AdminQuoteTableSummary[];
  /** Tabela aberta: a renomeada, ou a origem sugerida para copiar os prêmios. */
  table: AdminQuoteTableSummary | null;
};

/** Criar ou renomear tabela: nome (único na banca) e, ao criar, de onde copiar os prêmios. */
export function QuoteTableNameDialog({ open, onOpenChange, mode, tables, table }: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Montado só aberto: cada abertura começa do zero. */}
        <NameForm mode={mode} tables={tables} table={table} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  mode,
  tables,
  table,
  onDone,
}: Omit<NameDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const { router, pending, run } = useQuoteAction();
  const creating = mode === 'create';
  const [name, setName] = useState(creating ? '' : (table?.name ?? ''));
  const [copyFrom, setCopyFrom] = useState(creating && table ? table.id : SYSTEM_DEFAULTS);
  const [nameError, setNameError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const invalid = quoteTableNameError(name);
    setNameError(invalid);
    setMessage(null);
    if (invalid) return;
    const trimmed = name.trim();
    if (!creating && table && trimmed === table.name) {
      onDone();
      return;
    }
    run(
      () =>
        creating
          ? createQuoteTableAction({ name: trimmed, copyFromId: copyFrom === SYSTEM_DEFAULTS ? null : copyFrom })
          : renameQuoteTableAction(table?.id, { name: trimmed }),
      (result) => {
        if (!result.ok) {
          setNameError(result.fieldErrors?.name ?? null);
          setMessage(result.message);
          return;
        }
        toast.success(creating ? `Tabela "${result.data.name}" criada.` : 'Tabela renomeada.');
        onDone();
        if (creating) router.push(quotesHref(result.data.id));
        else router.refresh();
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{creating ? 'Nova tabela de pagamento' : 'Renomear tabela'}</DialogTitle>
        <DialogDescription>
          {creating
            ? 'Dê um nome à tabela e escolha de onde copiar os valores; depois é só ajustar os que mudam.'
            : 'O nome aparece só no painel; o pule continua mostrando os valores (centena/1/milhar).'}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="quote-table-name">Nome</Label>
        <Input
          id="quote-table-name"
          value={name}
          maxLength={QUOTE_TABLE_NAME_MAX}
          autoComplete="off"
          autoFocus
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
          }}
          disabled={pending}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? 'quote-table-name-error' : undefined}
        />
        <FieldError id="quote-table-name-error" message={nameError ?? undefined} />
      </div>
      {creating && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="quote-table-copy">Copiar valores de</Label>
          <Select value={copyFrom} onValueChange={setCopyFrom} disabled={pending}>
            <SelectTrigger id="quote-table-copy" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tables.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                  {option.isDefault ? ' (padrão)' : ''}
                </SelectItem>
              ))}
              <SelectItem value={SYSTEM_DEFAULTS}>Valores padrão do sistema (800/1/8000)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : creating ? 'Criar tabela' : 'Salvar nome'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type TableConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: AdminQuoteTableSummary;
};

/** Tornar a tabela a padrão da banca (vale para toda unidade sem tabela própria). */
export function SetDefaultQuoteTableDialog({ open, onOpenChange, table }: TableConfirmProps) {
  const { router, pending, run } = useQuoteAction();
  const [message, setMessage] = useState<string | null>(null);

  const confirm = () =>
    run(
      () => setDefaultQuoteTableAction(table.id),
      (result) => {
        if (!result.ok) {
          setMessage(result.message);
          router.refresh();
          return;
        }
        toast.success(`"${table.name}" agora é a tabela padrão.`);
        onOpenChange(false);
        router.refresh();
      },
    );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setMessage(null);
        onOpenChange(next);
      }}
      title="Tornar tabela padrão?"
      desc={
        <p>
          <strong>{table.name}</strong> passa a valer para todas as unidades sem tabela própria. As unidades com tabela
          escolhida continuam com a delas.
        </p>
      }
      cancelBtnText="Cancelar"
      confirmText={pending ? 'Salvando…' : 'Tornar padrão'}
      isLoading={pending}
      handleConfirm={confirm}
    >
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </ConfirmDialog>
  );
}

/** Excluir a tabela. A API recusa a padrão e a tabela em uso; a mensagem aparece aqui mesmo. */
export function DeleteQuoteTableDialog({ open, onOpenChange, table }: TableConfirmProps) {
  const { router, pending, run } = useQuoteAction();
  const [message, setMessage] = useState<string | null>(null);

  const confirm = () =>
    run(
      () => deleteQuoteTableAction(table.id),
      (result) => {
        if (!result.ok) {
          const inUse = Number(result.fieldErrors?.usersCount);
          setMessage(
            result.code === 'QUOTE_TABLE_IN_USE' && Number.isInteger(inUse) && inUse > 0
              ? `${result.message} (${unitsText(inUse)} com esta tabela.)`
              : result.message,
          );
          // A contagem de unidades (ou a própria tabela) pode ter mudado.
          router.refresh();
          return;
        }
        toast.success(`Tabela "${table.name}" excluída.`);
        onOpenChange(false);
        router.push(quotesHref(null));
      },
    );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setMessage(null);
        onOpenChange(next);
      }}
      destructive
      title="Excluir tabela?"
      desc={
        <div className="flex flex-col gap-2">
          <p>
            A tabela <strong>{table.name}</strong> e todos os valores dela serão excluídos. Esta ação não pode ser
            desfeita.
          </p>
          {table.usersCount > 0 && (
            <p>
              {unitsText(table.usersCount)} {table.usersCount === 1 ? 'usa' : 'usam'} esta tabela: troque a tabela delas
              em Unidades antes de excluir.
            </p>
          )}
        </div>
      }
      cancelBtnText="Cancelar"
      confirmText={pending ? 'Excluindo…' : 'Excluir tabela'}
      isLoading={pending}
      handleConfirm={confirm}
    >
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </ConfirmDialog>
  );
}
