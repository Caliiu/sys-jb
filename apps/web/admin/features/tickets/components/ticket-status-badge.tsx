import type { AdminTicketStatus } from '@sysjb/contracts';
import { Badge } from '@/admin/components/ui/badge';
import { cn } from '@/admin/lib/utils';
import { TICKET_STATUS_LABELS } from '@/lib/admin/tickets-format';

const STATUS_CLASSES: Record<AdminTicketStatus, string> = {
  WON: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  LOST: 'border-transparent bg-muted text-muted-foreground',
  PENDING: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  CANCELED: 'border-transparent bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
};

/** Situação do pule (ou de uma aposta dele): Premiada, Não premiada, Aguardando apuração ou Cancelada. */
export function TicketStatusBadge({ status }: { status: AdminTicketStatus }) {
  return (
    <Badge variant="outline" className={cn(STATUS_CLASSES[status])}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}
