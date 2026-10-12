import type { AdminPrizeList, AdminPrizeReview } from '@sysjb/contracts';
import { Clock, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/admin/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/admin/components/ui/card';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { GAME_LABELS, periodText } from '@/lib/admin/prizes-format';
import type { PrizesQuery } from '@/lib/admin/prizes-query';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate } from '@/lib/datetime';

type PrizesSummaryProps = {
  query: Pick<PrizesQuery, 'from' | 'to'>;
  result: Pick<AdminPrizeList, 'total' | 'totalPrizeCents' | 'pendingCount' | 'reviews' | 'reviewsTotal'>;
};

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

/** Diferença do resultado corrigido para o pago: positiva = o apostador deveria ter recebido mais. */
function Difference({ review }: { review: AdminPrizeReview }) {
  const diff = review.correctedCents - review.paidCents;
  return (
    <span className={diff > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}>
      {diff > 0 ? '+' : '−'}
      {formatBrl(Math.abs(diff))}
    </span>
  );
}

/** Totais do filtro inteiro (não só da página) e os avisos de apuração. */
export function PrizesSummary({ query, result }: PrizesSummaryProps) {
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Resumo" className="grid gap-4 sm:grid-cols-3">
        <Stat title="Período" value={periodText(query.from, query.to)} />
        <Stat title="Quantidade de prêmios" value={String(result.total)} />
        <Stat title="Total em prêmios" value={formatBrl(result.totalPrizeCents)} />
      </section>

      {result.pendingCount > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <Clock />
          <AlertTitle>
            {result.pendingCount === 1
              ? '1 pule aguardando apuração'
              : `${result.pendingCount} pules aguardando apuração`}
          </AlertTitle>
          <AlertDescription className="text-current/80">
            A contagem inclui todas as pules com sorteio já passado ainda não apuradas, com ou sem prêmio; a lista
            mostra só as premiadas. Motivos: resultado que não chegou, sorteio sem resultado ligado em Sorteios ou a
            espera de alguns minutos antes do pagamento.
          </AlertDescription>
        </Alert>
      )}

      {result.reviewsTotal > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Resultado corrigido depois do pagamento ({result.reviewsTotal})</AlertTitle>
          <AlertDescription>
            <p>
              O provedor corrigiu o resultado destas pules depois que os prêmios foram pagos. O pago não muda sozinho:
              confira e, se for o caso, ajuste a carteira do apostador.
              {result.reviewsTotal > result.reviews.length && <> Mostrando as {result.reviews.length} mais recentes.</>}
            </p>
            <ul aria-label="Pules com resultado corrigido" className="mt-2 w-full divide-y text-foreground">
              {result.reviews.map((review) => (
                <li
                  key={`${review.game}:${review.puleNumber}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-medium tabular-nums">#{review.puleNumber}</span>{' '}
                    <span className="text-muted-foreground">
                      · {GAME_LABELS[review.game]} · {review.lottery} · jogo {formatCalendarDate(review.drawDate)}{' '}
                      ·{' '}
                    </span>
                    <Link href={ADMIN_ROUTES.user(review.player.id)} className="hover:underline">
                      {review.player.displayId} · {review.player.name}
                    </Link>
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    Pago {formatBrl(review.paidCents)} · corrigido {formatBrl(review.correctedCents)} ·{' '}
                    <Difference review={review} />
                  </span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
