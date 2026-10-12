'use client';

import type { AdminPromoterOption, AdminTicketDrawOption } from '@sysjb/contracts';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import type { PlayerOption } from '@/app/admin/actions';
import { DayPicker } from '@/admin/components/day-picker';
import { PlayerCombobox } from '@/admin/components/player-combobox';
import { Button } from '@/admin/components/ui/button';
import { Label } from '@/admin/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/admin/components/ui/select';
import { ADMIN_ROUTES } from '@/lib/admin/admin-routes';
import { type TicketsQuery, ticketsHref } from '@/lib/admin/tickets-query';

/** Radix Select não aceita item com valor vazio: "todos" usa este. */
const ALL = 'all';

type TicketsFiltersProps = {
  query: TicketsQuery;
  /** Hoje (YYYY-MM-DD, Brasília), do servidor. */
  today: string;
  /** null = não deu para carregar (o filtro fica só com "todos"). */
  promoters: AdminPromoterOption[] | null;
  draws: AdminTicketDrawOption[] | null;
  /** Apostador da URL (nome para o campo). */
  player: PlayerOption | null;
};

/** "LT PT RIO 09:00" */
export const drawOptionLabel = (draw: AdminTicketDrawOption) => `${draw.name} ${draw.drawTime}`;

/** Filtros da tela (na URL): Pesquisar navega para a lista com eles, desde a primeira página. */
export function TicketsFilters({ query, today, promoters, draws, player: initialPlayer }: TicketsFiltersProps) {
  const router = useRouter();
  // Pesquisa por número (?ticket=): a lista é de todas as datas; escolher um dia volta à lista do dia.
  const [date, setDate] = useState(query.ticket !== null ? '' : query.date);
  const [drawId, setDrawId] = useState(query.drawId || ALL);
  const [promoterId, setPromoterId] = useState(query.promoterId || ALL);
  // Apostador da URL sem o nome (falha ao carregar): continua filtrado.
  const [player, setPlayer] = useState<PlayerOption | null>(
    initialPlayer ?? (query.userId ? { id: query.userId, displayId: 0, name: 'Apostador filtrado' } : null),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    router.push(
      ticketsHref({
        date: date || today,
        drawId: drawId === ALL ? '' : drawId,
        promoterId: promoterId === ALL ? '' : promoterId,
        userId: player?.id ?? '',
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
        <Label htmlFor="tickets-date">Data</Label>
        <DayPicker id="tickets-date" value={date} today={today} onChange={setDate} placeholder="Todas as datas" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tickets-draw">Loterias</Label>
        <Select value={drawId} onValueChange={setDrawId}>
          <SelectTrigger id="tickets-draw" className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as loterias</SelectItem>
            {(draws ?? []).map((draw) => (
              <SelectItem key={draw.id} value={draw.id}>
                {drawOptionLabel(draw)}
              </SelectItem>
            ))}
            {drawId !== ALL && !draws?.some((d) => d.id === drawId) && (
              <SelectItem value={drawId}>Loteria filtrada</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tickets-promoter">Promotor</Label>
        <Select value={promoterId} onValueChange={setPromoterId}>
          <SelectTrigger id="tickets-promoter" className="w-full sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os promotores</SelectItem>
            {(promoters ?? []).map((promoter) => (
              <SelectItem key={promoter.id} value={promoter.id}>
                {promoter.displayId} · {promoter.name}
              </SelectItem>
            ))}
            {promoterId !== ALL && !promoters?.some((p) => p.id === promoterId) && (
              <SelectItem value={promoterId}>Promotor filtrado</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tickets-player">Apostador</Label>
        <PlayerCombobox id="tickets-player" value={player} onChange={setPlayer} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">
          <Search /> Pesquisar
        </Button>
        <Button variant="outline" asChild>
          <Link href={ADMIN_ROUTES.tickets}>Limpar</Link>
        </Button>
      </div>
    </form>
  );
}
