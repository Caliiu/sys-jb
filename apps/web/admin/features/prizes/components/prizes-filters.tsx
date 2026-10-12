'use client';

import { type AdminPrizeStatusFilter, type AdminPromoterOption, ADMIN_PRIZES_MAX_DAYS } from '@sysjb/contracts';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/admin/components/ui/button';
import { Label } from '@/admin/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/admin/components/ui/select';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { type PrizesQuery, isPrizesPeriod, prizesHref } from '@/lib/admin/prizes-query';
import { type PeriodValue, PeriodPicker } from './period-picker';

/** Radix Select não aceita item com valor vazio: "todos" usa este. */
const ALL = 'all';
const STATUS_OPTIONS: Array<{ value: string; label: string; filter: AdminPrizeStatusFilter | null }> = [
  { value: ALL, label: 'Todos', filter: null },
  { value: 'paid', label: 'Pagos', filter: 'paid' },
  { value: 'pending', label: 'Aguardando apuração', filter: 'pending' },
];

type PrizesFiltersProps = {
  query: PrizesQuery;
  /** Agora (ISO) e hoje (YYYY-MM-DD, Brasília), do servidor. */
  nowIso: string;
  today: string;
  /** null = não deu para carregar (o filtro fica só com "todos"). */
  promoters: AdminPromoterOption[] | null;
};

/** Filtros da tela (na URL): Pesquisar navega para a lista com eles, desde a primeira página. */
export function PrizesFilters({ query, nowIso, today, promoters }: PrizesFiltersProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodValue>({ from: query.from, to: query.to });
  const [promoterId, setPromoterId] = useState(query.promoterId || ALL);
  const [status, setStatus] = useState(STATUS_OPTIONS.find((o) => o.filter === query.status)?.value ?? ALL);
  const [error, setError] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const from = period.from;
    const to = period.to || period.from;
    if (!isPrizesPeriod(nowIso, from, to)) {
      setError(true);
      return;
    }
    setError(false);
    router.push(
      prizesHref({
        from,
        to,
        promoterId: promoterId === ALL ? '' : promoterId,
        status: STATUS_OPTIONS.find((o) => o.value === status)?.filter ?? null,
        pageSize: query.pageSize,
      }),
    );
  }

  return (
    <form
      aria-label="Filtros"
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:flex-wrap sm:items-end print:hidden"
    >
      <div className="grid gap-2">
        <Label htmlFor="prizes-period">Período</Label>
        <PeriodPicker
          id="prizes-period"
          value={period}
          today={today}
          invalid={error}
          onChange={(value) => {
            setPeriod(value);
            setError(false);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="prizes-promoter">Promotor</Label>
        <Select value={promoterId} onValueChange={setPromoterId}>
          <SelectTrigger id="prizes-promoter" className="w-full sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os promotores</SelectItem>
            {(promoters ?? []).map((promoter) => (
              <SelectItem key={promoter.id} value={promoter.id}>
                {promoter.displayId} · {promoter.name}
              </SelectItem>
            ))}
            {/* Promotor da URL que não veio nas opções (falha ao carregar): continua escolhido. */}
            {promoterId !== ALL && !promoters?.some((p) => p.id === promoterId) && (
              <SelectItem value={promoterId}>Promotor filtrado</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="prizes-status">Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="prizes-status" className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit">
          <Search /> Pesquisar
        </Button>
        <Button variant="outline" asChild>
          <Link href={ADMIN_ROUTES.prizes}>Limpar</Link>
        </Button>
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          Escolha um período de até {ADMIN_PRIZES_MAX_DAYS} dias, sem passar de hoje.
        </p>
      )}
    </form>
  );
}
