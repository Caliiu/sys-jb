import type {
  AdminPrizeList,
  AdminPrizeListItem,
  AdminPrizeReview,
  AdminPromoterOption,
  AdminTicketDrawOption,
  AdminTicketGame,
} from '@sysjb/contracts';
import { Info, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { PlayerOption } from '@/app/admin/actions';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import { controlClass, labelClass } from '@/components/admin/filter-styles';
import Pagination from '@/components/admin/Pagination';
import PeriodField from '@/components/admin/PeriodField';
import PlayerCombobox from '@/components/admin/PlayerCombobox';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { DEFAULT_PAGE_SIZE } from '@/lib/admin/page-size';
import { type PrizesQuery, prizesHref, reaisText } from '@/lib/admin/prizes-query';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate } from '@/lib/datetime';

interface PrizesPageProps {
  query: PrizesQuery;
  /** Hoje (YYYY-MM-DD, Brasília): maior data do filtro e base dos atalhos. */
  today: string;
  promoters: AdminPromoterOption[] | null;
  draws: AdminTicketDrawOption[] | null;
  /** Apostador escolhido no filtro (nome para o campo). */
  player: PlayerOption | null;
  /** null = ainda não pesquisou (a tela só mostra os filtros). */
  result: AdminPrizeList | null;
}

const GAME_LABELS: Record<AdminTicketGame, string> = { lotteries: 'Loterias', fazendinha: 'Fazendinha' };

/** Filtro de um cadastro que ainda não existe: igual aos outros, mas sem nome (não vai para a URL). */
const UNAVAILABLE = 'Cadastro ainda não disponível.';

const COLUMNS = ['Pule', 'Data do Jogo', 'Apostador', 'Extração', 'Apostado', 'Prêmio'];
const RIGHT = new Set(['Apostado', 'Prêmio']);

function PlayerLink({ prize }: { prize: Pick<AdminPrizeListItem, 'player'> }) {
  return (
    <Link href={ADMIN_ROUTES.user(prize.player.id)} className="font-medium hover:underline">
      <span className="font-normal tabular-nums text-admin-muted">{prize.player.displayId}</span> · {prize.player.name}
    </Link>
  );
}

/** Diferença do resultado corrigido para o pago: positiva = o apostador deveria ter recebido mais. */
function Difference({ review }: { review: AdminPrizeReview }) {
  const diff = review.correctedCents - review.paidCents;
  return (
    <span className={`tabular-nums ${diff > 0 ? 'text-admin-success' : 'text-admin-danger'}`}>
      {diff > 0 ? '+' : '−'}
      {formatBrl(Math.abs(diff))}
    </span>
  );
}

/**
 * Aviso: o provedor corrigiu o resultado destas pules depois que a apuração pagou. O pago não muda sozinho; o operador
 * confere e ajusta a carteira do apostador se for o caso.
 */
function ReviewsNotice({ reviews, total }: { reviews: AdminPrizeReview[]; total: number }) {
  return (
    <section
      aria-labelledby="prize-reviews-title"
      className="rounded-lg border border-admin-danger/30 bg-admin-danger/5 px-4 py-4"
    >
      <h2 id="prize-reviews-title" className="flex items-center gap-2 text-[15px] font-semibold text-admin-danger">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
        Resultado corrigido depois do pagamento ({total})
      </h2>
      <p className="mt-1 text-[13px] text-admin-text">
        O provedor corrigiu o resultado destas pules depois que os prêmios foram pagos. O pago não muda sozinho: confira
        e, se for o caso, ajuste a carteira do apostador.
        {total > reviews.length && <> Mostrando as {reviews.length} mais recentes.</>}
      </p>
      <ul aria-label="Pules com resultado corrigido" className="mt-3 divide-y divide-admin-border/70 text-[13.5px]">
        {reviews.map((review) => (
          <li
            key={`${review.game}:${review.puleNumber}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
          >
            <span className="min-w-0">
              <span className="font-medium tabular-nums">#{review.puleNumber}</span>{' '}
              <span className="text-admin-muted">
                · {GAME_LABELS[review.game]} · {review.lottery} · jogo {formatCalendarDate(review.drawDate)}
              </span>
              <span className="block">
                <PlayerLink prize={review} />
              </span>
            </span>
            <span className="whitespace-nowrap text-right tabular-nums">
              Pago {formatBrl(review.paidCents)} · corrigido {formatBrl(review.correctedCents)} ·{' '}
              <Difference review={review} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Campo de valor em reais (texto: aceita "1.500,50"; o servidor converte e ignora o que não for valor). */
function MoneyField({
  id,
  label,
  name,
  value,
  placeholder,
}: Record<'id' | 'label' | 'name' | 'value' | 'placeholder', string>) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        maxLength={16}
        pattern="[0-9.,]*"
        title="Valor em reais, ex.: 1.500,00"
        defaultValue={value}
        placeholder={placeholder}
        className={controlClass}
      />
    </div>
  );
}

/** Tabela (e, no celular, cartões) das pules premiadas. */
function PrizesList({ items }: { items: AdminPrizeListItem[] }) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-[14px] text-admin-muted">Nenhuma pule premiada no período.</p>;
  }
  return (
    <>
      <div className="hidden overflow-x-auto md:block print:block">
        <table className="w-full min-w-[820px] text-left text-[14px]">
          <caption className="sr-only">Pules premiadas</caption>
          <thead>
            <tr className="border-b border-admin-border text-[13px] text-admin-muted">
              {COLUMNS.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className={`px-4 py-3 font-medium first:pl-0 last:pr-0 ${RIGHT.has(header) ? 'text-right' : ''}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((prize) => (
              <tr
                key={`${prize.game}:${prize.puleNumber}`}
                className="border-b border-admin-border align-top hover:bg-admin-hover/60"
              >
                <td className="whitespace-nowrap py-3 pr-4">
                  <span className="block font-medium tabular-nums">#{prize.puleNumber}</span>
                  <span className="block text-[13px] text-admin-muted">{GAME_LABELS[prize.game]}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatCalendarDate(prize.drawDate)}</td>
                <td className="px-4 py-3">
                  <PlayerLink prize={prize} />
                </td>
                <td className="px-4 py-3">
                  <span className="block">{prize.lottery}</span>
                  <span className="block font-mono text-[12px] text-admin-muted">{prize.drawCode}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatBrl(prize.stakeCents)}</td>
                <td className="whitespace-nowrap py-3 pl-4 text-right font-semibold tabular-nums text-admin-success">
                  {formatBrl(prize.prizeCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label="Pules premiadas" className="divide-y divide-admin-border md:hidden print:hidden">
        {items.map((prize) => (
          <li key={`${prize.game}:${prize.puleNumber}`} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium tabular-nums">
                #{prize.puleNumber} <span className="font-normal text-admin-muted">· {GAME_LABELS[prize.game]}</span>
              </span>
              <span className="font-semibold tabular-nums text-admin-success">{formatBrl(prize.prizeCents)}</span>
            </div>
            <p className="mt-1 text-[14px]">
              <PlayerLink prize={prize} />
            </p>
            <p className="mt-0.5 text-[13px]">
              {prize.lottery} · jogo {formatCalendarDate(prize.drawDate)}
            </p>
            <p className="mt-0.5 text-[12.5px] tabular-nums text-admin-muted">Apostado {formatBrl(prize.stakeCents)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Operação > Pules Premiadas: filtros (período pela data do jogo, extração, promotor, apostador e faixa de
 * prêmio). Os resultados só aparecem depois de pesquisar. Componente de servidor.
 */
export default function PrizesPage({ query, today, promoters, draws, player, result }: PrizesPageProps) {
  const period =
    query.from === query.to
      ? formatCalendarDate(query.from)
      : `${formatCalendarDate(query.from)} – ${formatCalendarDate(query.to)}`;

  return (
    <div className="space-y-6">
      <AdminPageTitle title="Pules Premiadas" />
      <FiltersCard>
        <FilterForm action={ADMIN_ROUTES.prizes} aria-label="Filtrar pules premiadas">
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PeriodField
              label="Período (Data do Jogo)"
              fromName="de"
              toName="ate"
              from={query.from}
              to={query.to}
              today={today}
            />
            <FilterSelect id="prizes-draw" label="Extração" name="extracao" defaultValue={query.drawId}>
              <option value="">Todas</option>
              {draws?.map((draw) => (
                <option key={draw.id} value={draw.id}>
                  {draw.drawTime} - {draw.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id="prizes-promoter" label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
            <PlayerCombobox id="prizes-player" label="Apostador" name="apostador" initial={player} />
            <FilterSelect id="prizes-section" label="Seção" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id="prizes-route" label="Rota" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id="prizes-billing-group" label="Grupo de Cobrança" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todos</option>
            </FilterSelect>
            <MoneyField
              id="prizes-min"
              label="Prêmio Mínimo (R$)"
              name="min"
              value={reaisText(query.minPrizeCents)}
              placeholder="Mín."
            />
            <MoneyField
              id="prizes-max"
              label="Prêmio Máximo (R$)"
              name="max"
              value={reaisText(query.maxPrizeCents)}
              placeholder="Máx."
            />
          </div>
          {query.pageSize !== DEFAULT_PAGE_SIZE && <input type="hidden" name="pageSize" value={query.pageSize} />}
          <FilterActions clearHref={ADMIN_ROUTES.prizes} />
        </FilterForm>
      </FiltersCard>

      {result && result.reviewsTotal > 0 && <ReviewsNotice reviews={result.reviews} total={result.reviewsTotal} />}

      {result && (
        <section
          aria-label="Resultados"
          className="rounded-lg border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <div className="flex flex-wrap items-center gap-2 px-4 pt-5">
            <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
              Período: <strong className="font-semibold text-admin-text">{period}</strong>
            </span>
            <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
              Pules: <strong className="font-semibold tabular-nums text-admin-text">{result.total}</strong>
            </span>
            <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
              Total em prêmios:{' '}
              <strong className="font-semibold tabular-nums text-admin-text">
                {formatBrl(result.totalPrizeCents)}
              </strong>
            </span>
            <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
              Aguardando apuração:{' '}
              <strong className="font-semibold tabular-nums text-admin-text">{result.pendingCount}</strong>
            </span>
          </div>
          <div className="mx-4 mt-4 border-t border-admin-border">
            <PrizesList items={result.items} />
          </div>
          <p className="mx-4 mt-3 flex items-start gap-2 text-[12.5px] text-admin-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Os prêmios são pagos alguns minutos depois de o resultado chegar, se ele não for corrigido nesse tempo.
              Aguardando apuração são as pules cujo sorteio já passou e que ainda não foram apuradas: resultado que não
              chegou, sorteio sem resultado ligado em Sorteios ou ainda dentro dessa espera.
            </span>
          </p>
          <Pagination
            hrefFor={(page) => prizesHref({ ...query, page })}
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            pageSize={result.pageSize}
          />
        </section>
      )}
    </div>
  );
}
