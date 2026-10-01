import type { AdminPromoterOption } from '@sysjb/contracts';
import { Info } from 'lucide-react';
import type { PlayerOption } from '@/app/admin/actions';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import PeriodField from '@/components/admin/PeriodField';
import PlayerCombobox from '@/components/admin/PlayerCombobox';
import {
  WALLET_MOVEMENTS,
  type WalletMovementKind,
  type WalletMovementsQuery,
} from '@/lib/admin/wallet-movements-query';
import { formatCalendarDate } from '@/lib/datetime';

interface WalletMovementsPageProps {
  kind: WalletMovementKind;
  query: WalletMovementsQuery;
  /** Hoje (YYYY-MM-DD, Brasília): maior data do filtro e base dos atalhos. */
  today: string;
  promoters: AdminPromoterOption[] | null;
  /** Apostador escolhido no filtro (nome para o campo). */
  player: PlayerOption | null;
}

/** Filtro de um cadastro que ainda não existe: igual aos outros, mas sem nome (não vai para a URL). */
const UNAVAILABLE = 'Cadastro ainda não disponível.';

/**
 * Carteira > Depósitos / Saques: filtros (apostador, status, período, promotor) e, depois de pesquisar, a lista. Os
 * registros dependem da integração de pagamento, que ainda não existe: a lista vem vazia, com o aviso. Componente de
 * servidor.
 */
export default function WalletMovementsPage({ kind, query, today, promoters, player }: WalletMovementsPageProps) {
  const config = WALLET_MOVEMENTS[kind];
  const idPrefix = `movements-${kind}`;

  return (
    <div className="space-y-6">
      <AdminPageTitle title={config.title} />
      <FiltersCard>
        <FilterForm action={config.href} aria-label={`Filtrar ${config.title.toLowerCase()}`}>
          <div className="grid items-end gap-4 md:grid-cols-2">
            <PlayerCombobox
              id={`${idPrefix}-player`}
              label="Apostador"
              name="apostador"
              initial={player}
              placeholder="Selecione um apostador"
            />
            <FilterSelect id={`${idPrefix}-status`} label="Status" name="status" defaultValue={query.status}>
              <option value="">Todos</option>
              {config.statuses.map((status) => (
                <option key={status.param} value={status.param}>
                  {status.label}
                </option>
              ))}
            </FilterSelect>
          </div>
          <div className="mt-4">
            <PeriodField
              label="Período (Data Início / Data Fim)"
              fromName="de"
              toName="ate"
              from={query.from}
              to={query.to}
              today={today}
            />
          </div>
          <div className="mt-4 grid items-end gap-4 md:grid-cols-2">
            <FilterSelect id={`${idPrefix}-promoter`} label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect id={`${idPrefix}-section`} label="Seção" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect id={`${idPrefix}-route`} label="Rota" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todas</option>
            </FilterSelect>
            <FilterSelect
              id={`${idPrefix}-billing-group`}
              label="Grupo de Cobrança"
              defaultValue=""
              title={UNAVAILABLE}
            >
              <option value="">Todos</option>
            </FilterSelect>
          </div>
          <FilterActions clearHref={config.href} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-label="Resultados"
        className="rounded-lg border border-admin-border bg-admin-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        {!query.searched ? (
          <p className="px-4 py-14 text-center text-[15px] text-admin-muted">
            Para visualizar os dados, por favor, aplique um filtro no painel acima.
          </p>
        ) : (
          <>
            <div className="px-4 pt-5">
              <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
                Período:{' '}
                <strong className="font-semibold text-admin-text">
                  {query.from === query.to
                    ? formatCalendarDate(query.from)
                    : `${formatCalendarDate(query.from)} – ${formatCalendarDate(query.to)}`}
                </strong>
              </span>
            </div>
            <div className="mx-4 mt-4 overflow-x-auto border-t border-admin-border">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <caption className="sr-only">{config.title}</caption>
                <thead>
                  <tr className="border-b border-admin-border text-[13px] text-admin-muted">
                    {config.columns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className={`px-3 py-3 font-medium first:pl-0 last:pr-0 ${column === 'Valor' ? 'text-right' : ''}`}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
              </table>
              <p className="py-10 text-center text-[14px] text-admin-muted">Nenhum resultado encontrado</p>
            </div>
            <p className="flex items-start gap-2 px-6 pb-5 text-[12.5px] text-admin-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Os pedidos de {config.noun} ainda não são registrados no sistema: dependem da integração de pagamento.
              </span>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
