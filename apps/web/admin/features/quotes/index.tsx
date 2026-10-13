'use client';

import type { AdminQuoteTable, AdminQuoteTableSummary } from '@sysjb/contracts';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Main } from '@/admin/components/layout/main';
import { Alert, AlertDescription, AlertTitle } from '@/admin/components/ui/alert';
import { Badge } from '@/admin/components/ui/badge';
import { Button } from '@/admin/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/admin/components/ui/card';
import { Label } from '@/admin/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/admin/components/ui/select';
import { quotesHref } from '@/lib/admin/quotes';
import { formatDateTime } from '@/lib/datetime';
import {
  DeleteQuoteTableDialog,
  QuoteTableNameDialog,
  SetDefaultQuoteTableDialog,
} from './components/quote-table-dialogs';
import { QuoteValuesTable } from './components/quote-values-table';

/** Tabela aberta, carregada pelo servidor, ou a falha ao carregar. */
export type QuoteTableState = { status: 'ok'; table: AdminQuoteTable } | { status: 'error'; message: string };

export type QuotesProps = {
  /** Tabelas da banca (a padrão primeiro, depois por nome). */
  tables: AdminQuoteTableSummary[];
  /** Tabela aberta: a da URL (?tabela=) ou a padrão; null = a banca não tem tabela. */
  selectedId: string | null;
  detail: QuoteTableState | null;
  /** ?tabela= apontava para uma tabela que não existe (mais): a tela abriu a padrão. */
  requestedMissing: boolean;
  /** `quotes.manage`: cria, renomeia, edita valores, escolhe a padrão e exclui; sem ela, só consulta. */
  canManage: boolean;
};

type DialogKind = 'create' | 'rename' | 'default' | 'delete';

const unitsText = (count: number) =>
  count === 0
    ? 'Nenhuma unidade com esta tabela'
    : count === 1
      ? '1 unidade com esta tabela'
      : `${count} unidades com esta tabela`;

/** Cotações: as tabelas de pagamento da banca e os valores de cada modalidade. */
export function Quotes({ tables, selectedId, detail, requestedMissing, canManage }: QuotesProps) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // O tipo fica ao fechar: o conteúdo não troca durante a animação de saída.
  const [dialog, setDialog] = useState<{ kind: DialogKind; open: boolean }>({ kind: 'create', open: false });
  const [editing, setEditing] = useState(false);

  const selected = tables.find((table) => table.id === selectedId) ?? null;
  const table = detail?.status === 'ok' && detail.table.id === selectedId ? detail.table : null;
  // Sem a tabela na tela (ex.: falhou ao recarregar), não há edição aberta.
  const editingValues = editing && table !== null;
  const locked = editingValues || navigating;

  const select = (id: string) => {
    if (id === selectedId) return;
    setPendingId(id);
    startNavigation(() => router.push(quotesHref(id), { scroll: false }));
  };

  const openDialog = (kind: DialogKind) => setDialog({ kind, open: true });
  const closeDialog = (open: boolean) => {
    if (!open) setDialog((current) => ({ ...current, open: false }));
  };
  const isOpen = (kind: DialogKind) => dialog.open && dialog.kind === kind;

  return (
    <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cotações</h1>
          <p className="text-muted-foreground">
            Tabelas de premiação da banca: quanto paga cada modalidade. A tabela padrão vale para toda unidade sem
            tabela própria (escolhida em Unidades).
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={() => openDialog('create')} disabled={locked}>
            <Plus /> Nova tabela
          </Button>
        )}
      </div>

      {requestedMissing && (
        <Alert>
          <AlertDescription>
            A tabela do endereço não foi encontrada. Mostrando a tabela padrão da banca.
          </AlertDescription>
        </Alert>
      )}

      <Card aria-label="Tabelas cadastradas">
        <CardHeader>
          <CardTitle>Tabelas cadastradas</CardTitle>
          <CardDescription>
            {tables.length === 1 ? '1 tabela' : `${tables.length} tabelas`} na banca. Escolha a tabela para ver os
            valores de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tables.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              Nenhuma tabela cadastrada.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex w-full flex-col gap-2 sm:w-80">
                <Label htmlFor="quote-table">Tabela de pagamento</Label>
                <Select
                  value={(navigating && pendingId) || selectedId || undefined}
                  onValueChange={select}
                  disabled={editingValues}
                >
                  <SelectTrigger id="quote-table" className="w-full">
                    <SelectValue placeholder="Escolha a tabela" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                        {option.isDefault && <Badge variant="secondary">Padrão</Badge>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canManage && selected && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => openDialog('rename')} disabled={locked}>
                    <Pencil /> Renomear
                  </Button>
                  {!selected.isDefault && (
                    <Button type="button" variant="outline" onClick={() => openDialog('default')} disabled={locked}>
                      <Star /> Tornar padrão
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => openDialog('delete')}
                    disabled={locked || selected.isDefault}
                    title={
                      selected.isDefault
                        ? 'A tabela padrão não pode ser excluída: escolha outra padrão antes.'
                        : undefined
                    }
                  >
                    <Trash2 /> Excluir
                  </Button>
                </div>
              )}
            </div>
          )}
          {editingValues && (
            <p className="text-xs text-muted-foreground">Salve ou cancele a edição para trocar de tabela.</p>
          )}
          {selected && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {selected.isDefault && (
                <div>
                  <dt className="sr-only">Situação</dt>
                  <dd>
                    <Badge>Padrão da banca</Badge>
                  </dd>
                </div>
              )}
              {table && (
                <div className="flex gap-1">
                  <dt>Valores:</dt>
                  <dd className="font-medium text-foreground tabular-nums">{table.tableLabel}</dd>
                </div>
              )}
              <div>
                <dt className="sr-only">Unidades</dt>
                <dd>{unitsText(selected.usersCount)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Atualizada em</dt>
                <dd className="tabular-nums">{formatDateTime(selected.updatedAt)}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {detail?.status === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar a tabela</AlertTitle>
          <AlertDescription>{detail.message}</AlertDescription>
        </Alert>
      )}

      {table && (
        <div className={navigating ? 'pointer-events-none opacity-60 transition-opacity' : undefined}>
          <QuoteValuesTable key={table.id} table={table} canManage={canManage} onEditingChange={setEditing} />
        </div>
      )}

      {canManage && (
        <QuoteTableNameDialog
          open={isOpen('create') || isOpen('rename')}
          onOpenChange={closeDialog}
          mode={dialog.kind === 'rename' ? 'rename' : 'create'}
          tables={tables}
          table={selected}
        />
      )}
      {canManage && selected && (
        <>
          <SetDefaultQuoteTableDialog open={isOpen('default')} onOpenChange={closeDialog} table={selected} />
          <DeleteQuoteTableDialog open={isOpen('delete')} onOpenChange={closeDialog} table={selected} />
        </>
      )}
    </Main>
  );
}
