import { Card, CardContent, CardHeader, CardTitle } from '@/admin/components/ui/card';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate } from '@/lib/datetime';

type TicketsSummaryProps =
  /** Lista do dia: totais do filtro inteiro (não só da página). */
  | { kind: 'list'; date: string; total: number; totalCents: number }
  /** Pesquisa por número: os pules achados (um por jogo). */
  | { kind: 'ticket'; ticket: number; total: number; totalCents: number };

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 text-xl font-bold tabular-nums">{value}</CardContent>
    </Card>
  );
}

/** Resumo: data (ou o número pesquisado), quantidade de pules e total vendido (sem as canceladas). */
export function TicketsSummary(props: TicketsSummaryProps) {
  return (
    <section aria-label="Resumo" className="grid gap-4 sm:grid-cols-3">
      {props.kind === 'list' ? (
        <Stat title="Data" value={formatCalendarDate(props.date)} />
      ) : (
        <Stat title="Pule pesquisada" value={`Nº ${props.ticket}`} />
      )}
      <Stat title="Quantidade de pules" value={String(props.total)} />
      <Stat title="Total vendido" value={formatBrl(props.totalCents)} />
    </section>
  );
}
