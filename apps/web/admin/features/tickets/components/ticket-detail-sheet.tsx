'use client';

import { type AdminTicketDetail, GIFT_MILHAR_LABEL } from '@sysjb/contracts';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/admin/components/ui/alert';
import { Badge } from '@/admin/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/admin/components/ui/sheet';
import { Skeleton } from '@/admin/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/admin/components/ui/table';
import { cn } from '@/admin/lib/utils';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { GAME_LABELS, orDash } from '@/lib/admin/prizes-format';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate, formatDateTime } from '@/lib/datetime';
import { TicketStatusBadge } from './ticket-status-badge';

/** Detalhe do pule aberto pela URL (?pule=...), carregado pelo servidor. */
export type TicketDetailState = { key: string } & (
  { status: 'ok'; ticket: AdminTicketDetail } | { status: 'not-found' } | { status: 'error'; message: string }
);

type TicketDetailSheetProps = {
  /** Pule aberto (null = fechado). */
  openKey: string | null;
  /** Dados do pule aberto; null enquanto carregam. */
  detail: TicketDetailState | null;
  onClose: () => void;
};

function Info({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5', wide && 'sm:col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

const hourText = (hour: number) => `${String(hour).padStart(2, '0')}h`;

/** Prêmio do pule: pago (premiada) ou o que o resultado já dá e a apuração ainda vai pagar. */
function prizeInfo(ticket: AdminTicketDetail): { label: string; value: string } {
  if (ticket.status === 'PENDING' && ticket.expectedPrizeCents > 0) {
    return { label: 'Prêmio esperado (a pagar na apuração)', value: formatBrl(ticket.expectedPrizeCents) };
  }
  return { label: 'Prêmio pago', value: formatBrl(ticket.prizeCents) };
}

function TicketDetailBody({ ticket }: { ticket: AdminTicketDetail }) {
  const prize = prizeInfo(ticket);
  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      {ticket.correctedPrizeCents !== null && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Resultado corrigido depois do pagamento</AlertTitle>
          <AlertDescription>
            Pelo resultado corrigido, o prêmio seria {formatBrl(ticket.correctedPrizeCents)} (pago{' '}
            {formatBrl(ticket.prizeCents)}). O pago não muda sozinho: confira e, se for o caso, ajuste a carteira do
            apostador.
          </AlertDescription>
        </Alert>
      )}

      <dl aria-label="Dados da pule" className="grid gap-4 sm:grid-cols-2">
        <Info label="Apostador" wide>
          <Link href={ADMIN_ROUTES.user(ticket.player.id)} className="hover:underline">
            {ticket.player.displayId} | {ticket.player.name.toUpperCase()}
          </Link>
        </Info>
        <Info label="Venda">{formatDateTime(ticket.createdAt)}</Info>
        <Info label="Loteria / extração">
          {ticket.lottery} <span className="text-muted-foreground">· {ticket.drawCode}</span>
        </Info>
        <Info label="Data valendo">
          {formatCalendarDate(ticket.drawDate)} · {hourText(ticket.drawHour)}
        </Info>
        <Info label="Cotação">{orDash(ticket.quoteTable)}</Info>
        <Info label="Valor">
          <span className={cn(ticket.canceledAt && 'text-muted-foreground line-through')}>
            {formatBrl(ticket.totalCents)}
          </span>
        </Info>
        <Info label={prize.label}>{prize.value}</Info>
        <Info label="Apurada em">{ticket.settledAt ? formatDateTime(ticket.settledAt) : 'Não apurada'}</Info>
        {ticket.canceledAt && <Info label="Cancelada em">{formatDateTime(ticket.canceledAt)}</Info>}
        <Info label="Resultado do sorteio" wide>
          {ticket.result ? (
            <>
              <ol aria-label="Resultado do sorteio" className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                {ticket.result.prizes.map((value, index) => (
                  <li key={index}>
                    <span className="text-muted-foreground">{index + 1}º</span> {value}
                  </li>
                ))}
              </ol>
              <span className="text-xs font-normal text-muted-foreground">
                Recebido em {formatDateTime(ticket.result.receivedAt)}
                {ticket.result.revision > 1 && ` · revisão ${ticket.result.revision}`}
              </span>
            </>
          ) : (
            <span className="font-normal text-muted-foreground">Sem resultado ainda</span>
          )}
        </Info>
      </dl>

      <section aria-label="Apostas" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Apostas</h3>
        <div className="overflow-hidden rounded-md border">
          <Table aria-label="Apostas da pule">
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Modalidade</TableHead>
                <TableHead>Palpites</TableHead>
                <TableHead>Colocação</TableHead>
                <TableHead className="text-end">Valor</TableHead>
                <TableHead className="h-auto py-2 text-end">
                  <span className="block">Cotação</span>
                  <span className="block text-xs font-normal text-muted-foreground">Prêmio possível</span>
                </TableHead>
                <TableHead className="text-end">Prêmio</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            {ticket.items.length > 0 && (
              <TableBody>
                {ticket.items.map((item) => (
                  <TableRow key={item.position}>
                    <TableCell className="tabular-nums">{item.position}</TableCell>
                    <TableCell>
                      {item.isGift ? (
                        <Badge
                          className="border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          title="Aposta grátis da banca: o valor é o do brinde, não cobrado nem somado ao total."
                        >
                          {GIFT_MILHAR_LABEL}
                        </Badge>
                      ) : (
                        item.modalityLabel
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-normal">{item.guesses.join(', ')}</TableCell>
                    <TableCell>{item.placementLabel}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatBrl(item.stakeCents)}
                      {item.isGift && <span className="block text-xs text-muted-foreground">brinde, não cobrado</span>}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {item.quoteCents !== null && <span className="block">{formatBrl(item.quoteCents)}</span>}
                      <span className="block text-xs text-muted-foreground">{formatBrl(item.possiblePrizeCents)}</span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{formatBrl(item.prizeCents)}</TableCell>
                    <TableCell>
                      <TicketStatusBadge status={item.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
          {ticket.items.length === 0 && (
            <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
              Pule antiga, gravada sem as apostas.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/** Detalhe do pule numa gaveta à direita (template Sheet); fechar volta a URL da lista. */
export function TicketDetailSheet({ openKey, detail, onClose }: TicketDetailSheetProps) {
  const ticket = detail?.status === 'ok' ? detail.ticket : null;
  return (
    <Sheet open={openKey !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl xl:max-w-5xl">
        {!detail ? (
          <>
            <SheetHeader>
              <SheetTitle>Carregando pule…</SheetTitle>
              <SheetDescription className="sr-only">Buscando os dados da pule.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4" aria-hidden>
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          </>
        ) : detail.status === 'not-found' ? (
          <SheetHeader>
            <SheetTitle>Pule não encontrada</SheetTitle>
            <SheetDescription>O número pode estar errado ou a pule não é desta banca.</SheetDescription>
          </SheetHeader>
        ) : detail.status === 'error' ? (
          <SheetHeader>
            <SheetTitle>Não foi possível carregar a pule</SheetTitle>
            <SheetDescription>{detail.message}</SheetDescription>
          </SheetHeader>
        ) : (
          ticket && (
            <>
              <SheetHeader className="pe-12">
                <SheetTitle className="flex flex-wrap items-center gap-2 text-lg tabular-nums">
                  Pule Nº {ticket.puleNumber}
                  <Badge variant="secondary">{GAME_LABELS[ticket.game]}</Badge>
                  <TicketStatusBadge status={ticket.status} />
                </SheetTitle>
                <SheetDescription>
                  {ticket.lottery} · jogo de {formatCalendarDate(ticket.drawDate)}
                </SheetDescription>
              </SheetHeader>
              <TicketDetailBody ticket={ticket} />
            </>
          )
        )}
      </SheetContent>
    </Sheet>
  );
}
