'use client';

import type { AdminTicketListItem } from '@sysjb/contracts';
import Link from 'next/link';
import { type ReportColumn } from '@/admin/components/report-table';
import { cn } from '@/admin/lib/utils';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { GAME_LABELS, orDash } from '@/lib/admin/prizes-format';
import { puleKey } from '@/lib/admin/tickets-format';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate, formatShortDateTime } from '@/lib/datetime';
import { TicketStatusBadge } from './ticket-status-badge';

const right = (text: string) => <div className="text-end tabular-nums">{text}</div>;

/** Colunas da lista (mais recentes primeiro, paginada no servidor). O número da pule abre o detalhe. */
export function ticketsColumns(
  /** Endereço da tela com o detalhe do pule aberto. */
  detailHref: (key: string) => string,
  /** Abre o detalhe já (antes de a navegação terminar). */
  onOpen: (key: string) => void,
): ReportColumn<AdminTicketListItem>[] {
  return [
    {
      id: 'pule',
      header: 'Pule #',
      cell: (item) => {
        const key = puleKey(item);
        return (
          <Link
            href={detailHref(key)}
            scroll={false}
            onClick={(event) => {
              // Ctrl/Cmd/clique do meio abrem em outra aba, sem abrir aqui.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              onOpen(key);
            }}
            aria-label={`Ver a pule ${item.puleNumber}${item.game === 'fazendinha' ? ' da Fazendinha' : ''}`}
            className="font-medium whitespace-nowrap tabular-nums text-primary hover:underline"
          >
            #{item.puleNumber}
            {item.game === 'fazendinha' && (
              <span className="ms-1.5 text-xs font-normal text-muted-foreground">{GAME_LABELS.fazendinha}</span>
            )}
          </Link>
        );
      },
    },
    {
      id: 'createdAt',
      header: 'Data/Hora',
      cell: (item) => <span className="whitespace-nowrap tabular-nums">{formatShortDateTime(item.createdAt)}</span>,
    },
    {
      id: 'player',
      header: 'Apostador',
      cell: (item) => (
        <Link href={ADMIN_ROUTES.user(item.player.id)} className="hover:underline">
          <span className="text-muted-foreground tabular-nums">{item.player.displayId}</span> |{' '}
          <span className="font-medium uppercase">{item.player.name}</span>
        </Link>
      ),
    },
    {
      id: 'lottery',
      header: 'Loteria',
      cell: (item) => (
        <div className="flex flex-col">
          <span>{item.lottery}</span>
          <span className="text-xs text-muted-foreground">{item.drawCode}</span>
        </div>
      ),
    },
    {
      id: 'drawDate',
      header: 'Data Valendo',
      cell: (item) => <span className="tabular-nums">{formatCalendarDate(item.drawDate)}</span>,
    },
    {
      id: 'quote',
      header: 'Cotação',
      cell: (item) => <span className="tabular-nums">{orDash(item.quoteTable)}</span>,
    },
    {
      id: 'total',
      header: right('Valor'),
      cell: (item) => (
        <div
          className={cn('text-end tabular-nums', item.canceledAt && 'text-muted-foreground line-through')}
          title={item.canceledAt ? 'Cancelada: não entra no total vendido' : undefined}
        >
          {formatBrl(item.totalCents)}
        </div>
      ),
    },
    {
      id: 'prize',
      header: right('Valor Prêmio'),
      cell: (item) => right(formatBrl(item.prizeCents)),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (item) => <TicketStatusBadge status={item.status} />,
    },
  ];
}
