import type { AdminPromoterOption, AdminSalesByDrawReport } from '@sysjb/contracts';
import { Info } from 'lucide-react';
import type { PlayerOption } from '@/app/admin/actions';
import AdminPageTitle from '@/components/admin/AdminPageTitle';
import FilterActions from '@/components/admin/FilterActions';
import FilterForm from '@/components/admin/FilterForm';
import FilterSelect from '@/components/admin/FilterSelect';
import FiltersCard from '@/components/admin/FiltersCard';
import PeriodField from '@/components/admin/PeriodField';
import PlayerCombobox from '@/components/admin/PlayerCombobox';
import SalesByDrawResults from '@/components/admin/SalesByDrawResults';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import type { SalesByDrawQuery } from '@/lib/admin/sales-by-draw-query';
import { formatCalendarDate } from '@/lib/datetime';

interface SalesByDrawPageProps {
  query: SalesByDrawQuery;
  /** Hoje (YYYY-MM-DD, Brasília): base dos atalhos do período. */
  today: string;
  /** Maior data do jogo aceita (fim da janela de apostas). */
  maxDate: string;
  promoters: AdminPromoterOption[] | null;
  /** Apostador escolhido no filtro (nome para o campo). */
  player: PlayerOption | null;
  /** null = ainda não pesquisou. */
  report: AdminSalesByDrawReport | null;
}

/** Filtro de um cadastro que ainda não existe: igual aos outros, mas sem nome (não vai para a URL). */
const UNAVAILABLE = 'Cadastro ainda não disponível.';

/**
 * Relatórios > Loterias > Vendas por extração: filtros (período pela data do jogo, promotor e apostador) e, depois de
 * pesquisar, as vendas e prêmios de cada extração, com o filtro por nome. Componente de servidor.
 */
export default function SalesByDrawPage({ query, today, maxDate, promoters, player, report }: SalesByDrawPageProps) {
  return (
    <div className="space-y-6">
      <AdminPageTitle title="Vendas por extração" />
      <FiltersCard>
        <FilterForm action={ADMIN_ROUTES.salesByDrawReport} aria-label="Filtrar vendas por extração">
          <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PeriodField
              label="Período"
              fromName="de"
              toName="ate"
              from={query.from}
              to={query.to}
              today={today}
              max={maxDate}
            />
            <FilterSelect id="sales-section" label="Seção" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todos</option>
            </FilterSelect>
            <FilterSelect id="sales-route" label="Rota" defaultValue="" title={UNAVAILABLE}>
              <option value="">Todos</option>
            </FilterSelect>
          </div>
          <div className="mt-4 grid items-end gap-4 md:grid-cols-2">
            <FilterSelect id="sales-promoter" label="Promotor" name="promotor" defaultValue={query.promoterId}>
              <option value="">Todos</option>
              {promoters?.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.displayId} - {promoter.name}
                </option>
              ))}
            </FilterSelect>
            <PlayerCombobox id="sales-player" label="Apostador" name="apostador" initial={player} />
          </div>
          <FilterActions clearHref={ADMIN_ROUTES.salesByDrawReport} />
        </FilterForm>
      </FiltersCard>

      <section
        aria-labelledby="sales-results"
        className="rounded-lg border border-admin-border bg-admin-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="sales-results" className="text-[18px] font-semibold text-admin-text">
            Resultados:
          </h2>
          {report && (
            <span className="rounded-md border border-admin-border px-3 py-1.5 text-[14px] text-admin-muted">
              Data do jogo:{' '}
              <strong className="font-semibold text-admin-text">
                {report.from === report.to
                  ? formatCalendarDate(report.from)
                  : `${formatCalendarDate(report.from)} – ${formatCalendarDate(report.to)}`}
              </strong>
            </span>
          )}
        </div>
        {report ? (
          <>
            <SalesByDrawResults rows={report.rows} />
            <p className="mt-4 flex items-start gap-2 text-[12.5px] text-admin-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Pela data do jogo (inclui as vendas para os próximos dias). Prêmios pela apuração. Líquido = vendas −
                prêmios.
              </span>
            </p>
          </>
        ) : (
          <p className="py-12 text-center text-[15px] text-admin-muted">
            Para visualizar os dados, por favor, aplique um filtro no painel acima.
          </p>
        )}
      </section>
    </div>
  );
}
