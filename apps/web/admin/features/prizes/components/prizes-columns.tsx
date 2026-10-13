'use client';

import { type AdminPrizeListItem, type AdminPrizeStatus, GIFT_MILHAR_LABEL } from '@sysjb/contracts';
import Link from 'next/link';
import { type ReportColumn } from '@/admin/components/report-table';
import { Badge } from '@/admin/components/ui/badge';
import { cn } from '@/admin/lib/utils';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { PRIZE_STATUS_LABELS, orDash } from '@/lib/admin/prizes-format';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate } from '@/lib/datetime';

const STATUS_CLASSES: Record<AdminPrizeStatus, string> = {
  PAID: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  PENDING: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
};

export function PrizeStatusBadge({ status }: { status: AdminPrizeStatus }) {
  return (
    <Badge variant="outline" className={cn(STATUS_CLASSES[status])}>
      {PRIZE_STATUS_LABELS[status]}
    </Badge>
  );
}

const GIFT_BADGE_CLASS = 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';

const right = (text: string) => <div className="text-end tabular-nums">{text}</div>;

/** Colunas da lista (paginada no servidor, maiores prêmios primeiro). */
export const prizesColumns: ReportColumn<AdminPrizeListItem>[] = [
  {
    id: 'drawDate',
    header: 'Data',
    cell: (item) => <span className="tabular-nums">{formatCalendarDate(item.drawDate)}</span>,
  },
  {
    id: 'player',
    header: 'Apostador',
    cell: (item) => (
      <Link href={ADMIN_ROUTES.user(item.player.id)} className="hover:underline">
        <span className="text-muted-foreground tabular-nums">{item.player.displayId}</span> ·{' '}
        <span className="font-medium">{item.player.name}</span>
      </Link>
    ),
  },
  {
    id: 'pule',
    header: 'Pule',
    cell: (item) => <span className="font-medium tabular-nums">#{item.puleNumber}</span>,
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
    id: 'modality',
    header: 'Modalidade',
    cell: (item) =>
      item.isGift ? (
        <Badge className={GIFT_BADGE_CLASS} title="Aposta grátis da banca: o valor é o do brinde, não cobrado.">
          {GIFT_MILHAR_LABEL}
        </Badge>
      ) : (
        orDash(item.modalityLabel)
      ),
  },
  {
    id: 'guess',
    header: 'Número',
    cell: (item) => <span className="tabular-nums">{orDash(item.guess)}</span>,
  },
  { id: 'placement', header: 'Colocação', cell: (item) => orDash(item.placementLabel) },
  {
    id: 'stake',
    header: right('Valor'),
    cell: (item) => right(formatBrl(item.stakeCents)),
  },
  {
    id: 'prize',
    header: right('Valor Prêmio'),
    cell: (item) => <div className="text-end font-medium tabular-nums">{formatBrl(item.prizeCents)}</div>,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (item) => <PrizeStatusBadge status={item.status} />,
  },
];
