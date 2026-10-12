import type {
  AdminPromoterOption,
  AdminTicketDrawOption,
  AdminTicketGame,
  AdminTicketListItem,
  Page,
} from '@sysjb/contracts';
import { Search } from 'lucide-react';
import Link from 'next/link';
import type { PlayerOption } from '@/app/admin/actions';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import DateField from '@/components/admin/DateField';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import { controlBaseClass, labelClass, primaryButtonClass } from '@/components/admin/filter-styles';
import Pagination from '@/components/admin/Pagination';
import PlayerCombobox from '@/components/admin/PlayerCombobox';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { DEFAULT_PAGE_SIZE } from '@/lib/admin/page-size';
import { type TicketsQuery, ticketsHref } from '@/lib/admin/tickets-query';
import { formatBrl } from '@/lib/currency';
import { formatCalendarDate, formatDateTime, formatShortDateTime } from '@/lib/datetime';

/** O que a pesquisa trouxe: a lista do dia (paginada) ou os pules de um número. */
export type TicketsResult =
  | { kind: 'list'; page: Page<AdminTicketListItem> & { totalCents: number } }
  | { kind: 'ticket'; items: AdminTicketListItem[] };

interface TicketsPageProps {
  query: TicketsQuery;
  /** Hoje (YYYY-MM-DD, Brasília): maior data do filtro. */
  today: string;
  promoters: AdminPromoterOption[] | null;
  draws: AdminTicketDrawOption[] | null;
  /** Apostador escolhido no filtro (nome para o campo). */
  player: PlayerOption | null;
  /** null = ainda não pesquisou (a tela só mostra os filtros). */
  result: TicketsResult | null;
}

const GAME_LABELS: Record<AdminTicketGame, string> = { lotteries: 'Loterias', fazendinha: 'Fazendinha' };

/** Filtro de um cadastro que ainda não existe: igual aos outros, mas sem nome (não vai para a URL). */
const UNAVAILABLE = 'Cadastro ainda não disponível.';

const COLUMNS = ['Pule', 'Data/Hora', 'Apostador', 'Extração', 'Sorteio', 'Valor'];

function PlayerLink({ ticket }: { ticket: AdminTicketListItem }) {
  return (
    <Link href={ADMIN_ROUTES.user(ticket.player.id)} className="font-medium hover:underline">
      <span className="font-normal tabular-nums text-admin-muted">{ticket.player.displayId}</span> ·{' '}
      {ticket.player.name}
    </Link>
  );
}

/** Tabela (e, no celular, cartões) dos pules. */
/** Pule cancelada pelo jogador: etiqueta vermelha (o valor voltou para a carteira e não entra no total). */
function CanceledBadge({ ticket }: { ticket: AdminTicketListItem }) {
  if (!ticket.canceledAt) return null;
  return (
    <span
      title={`Cancelada em ${formatDateTime(ticket.canceledAt)}`}
      className="mt-1 inline-flex items-center rounded-md border border-admin-danger/25 bg-admin-danger/10 px-2 py-0.5 text-[12px] font-medium text-admin-danger"
    >
      Cancelada
    </span>
  );
}

function TicketsList({ items, empty }: { items: AdminTicketListItem[]; empty: string }) {
  if (items.length === 0) return <p className="py-10 text-center text-[14px] text-admin-muted">{empty}</p>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block print:block">
        <table className="w-full min-w-[760px] text-left text-[14px]">
          <caption className="sr-only">Pules</caption>
          <thead>
            <tr className="border-b border-admin-border text-[13px] text-admin-muted">
              {COLUMNS.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className={`px-4 py-3 font-medium first:pl-0 last:pr-0 ${header === 'Valor' ? 'text-right' : ''}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((ticket) => (
              <tr
                key={`${ticket.game}:${ticket.puleNumber}`}
                className="border-b border-admin-border align-top hover:bg-admin-hover/60"
              >
                <td className="whitespace-nowrap py-3 pr-4">
                  <span className="block font-medium tabular-nums">#{ticket.puleNumber}</span>
                  <span className="block text-[13px] text-admin-muted">{GAME_LABELS[ticket.game]}</span>
                  <CanceledBadge ticket={ticket} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatShortDateTime(ticket.createdAt)}</td>
                <td className="px-4 py-3">
                  <PlayerLink ticket={ticket} />
                </td>
                <td className="px-4 py-3">
                  <span className="block">{ticket.lottery}</span>
                  <span className="block font-mono text-[12px] text-admin-muted">{ticket.drawCode}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatCalendarDate(ticket.drawDate)}</td>
                <td
                  className={`whitespace-nowrap py-3 pl-4 text-right tabular-nums ${
                    ticket.canceledAt ? 'text-admin-muted line-through' : ''
                  }`}
                >
                  {formatBrl(ticket.totalCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label="Pules" className="divide-y divide-admin-border md:hidden print:hidden">
        {items.map((ticket) => (
          <li key={`${ticket.game}:${ticket.puleNumber}`} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium tabular-nums">
                #{ticket.puleNumber} <span className="font-normal text-admin-muted">· {GAME_LABELS[ticket.game]}</span>
              </span>
              <span className={`tabular-nums ${ticket.canceledAt ? 'text-admin-muted line-through' : ''}`}>
                {formatBrl(ticket.totalCents)}
              </span>
            </div>
            <CanceledBadge ticket={ticket} />
            <p className="mt-1 text-[14px]">
              <PlayerLink ticket={ticket} />
            </p>
            <p className="mt-0.5 text-[13px]">
              {ticket.lottery} · sorteio {formatCalendarDate(ticket.drawDate)}
            </p>
            <p className="mt-0.5 text-[12.5px] tabular-nums text-admin-muted">
              Venda {formatShortDateTime(ticket.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Operação > Pules: filtros (data da venda, promotor, apostador, extração) e a pesquisa por número. Os
 * resultados só aparecem depois de pesquisar. Componente de servidor.
 */
export default function TicketsPage({ query, today, promoters, draws, player, result }: TicketsPageProps) {
  return (
    <div className="space-y-6">
      <AdminPageTitle title="Pules" />
      <FiltersCard>
        <FilterForm action={ADMIN_ROUTES.tickets} aria-label="Filtrar pules">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DateField id="tickets-date" label="Data" name="data" defaultValue={query.date} max={today} />
            <FilterSelect id="tickets-promoter" label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
            <PlayerCombobox id="tickets-player" label="Apostador" name="apostador" initial={player} />
            <FilterSelect id="tickets-section" label="Seção" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id="tickets-route" label="Rota" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id="tickets-billing-group" label="Grupo de Cobrança" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todos</option>
            </FilterSelect>
            <FilterSelect id="tickets-draw" label="Horário (Extração)" name="extracao" defaultValue={query.drawId}>
              <option value="">Todas</option>
              {draws?.map((draw) => (
                <option key={draw.id} value={draw.id}>
                  {draw.drawTime} - {draw.name}
                </option>
              ))}
            </FilterSelect>
          </div>
          {query.pageSize !== DEFAULT_PAGE_SIZE && <input type="hidden" name="pageSize" value={query.pageSize} />}
          <FilterActions clearHref={ADMIN_ROUTES.tickets} />
        </FilterForm>

        <hr className="my-4 border-admin-border" />

        <FilterForm action={ADMIN_ROUTES.tickets} aria-label="Pesquisar ticket">
          <h3 className="text-[14px] font-semibold text-admin-text">Pesquisa por Ticket</h3>
          <label htmlFor="tickets-number" className={`${labelClass} mt-4`}>
            Número do Ticket
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              id="tickets-number"
              name="ticket"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              required
              defaultValue={query.ticket ?? ''}
              placeholder="Ex: 10001"
              className={`h-9 w-48 ${controlBaseClass}`}
            />
            <button type="submit" className={primaryButtonClass}>
              <Search className="h-4 w-4" aria-hidden />
              Pesquisar Ticket
            </button>
          </div>
        </FilterForm>
      </FiltersCard>

      {result && (
        <section
          aria-label="Resultados"
          className="rounded-lg border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <div className="flex flex-wrap items-center gap-2 px-4 pt-5">
            {result.kind === 'ticket' ? (
              <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
                Ticket: <strong className="font-semibold text-admin-text">{query.ticket}</strong>
              </span>
            ) : (
              <>
                <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
                  Data: <strong className="font-semibold text-admin-text">{formatCalendarDate(query.date)}</strong>
                </span>
                <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
                  Total: <strong className="font-semibold text-admin-text">{formatBrl(result.page.totalCents)}</strong>
                </span>
              </>
            )}
          </div>
          <div className="mx-4 mt-4 border-t border-admin-border">
            {result.kind === 'ticket' ? (
              <TicketsList items={result.items} empty="Nenhum pule com esse número." />
            ) : (
              <TicketsList items={result.page.items} empty="Nenhum resultado encontrado" />
            )}
          </div>
          {result.kind === 'list' && (
            <Pagination
              hrefFor={(page) => ticketsHref({ ...query, page })}
              page={result.page.page}
              totalPages={result.page.totalPages}
              total={result.page.total}
              pageSize={result.page.pageSize}
            />
          )}
        </section>
      )}
    </div>
  );
}
