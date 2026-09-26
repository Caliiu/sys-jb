'use client';

import { ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatBrl } from '@/lib/currency';
import { formatTime } from '@/lib/datetime';
import { groupWithdrawalsByDay, type WithdrawalItem } from '@/lib/withdrawal';
import WithdrawalDetailsSheet from './WithdrawalDetailsSheet';
import WithdrawalStatusBadge from './WithdrawalStatusBadge';

interface WithdrawalListProps {
  items: readonly WithdrawalItem[];
  /** Titular exibido nos detalhes. */
  holderName: string;
  /** "Agora" vindo do servidor: define "Hoje" e "Ontem" igual no servidor e no navegador. */
  nowIso: string;
  refreshing: boolean;
  onRefresh: () => void;
}

/** Lista "Meus saques": contagem, atualizar, grupos por dia e detalhes ao tocar. Sem saques, o estado vazio. */
export default function WithdrawalList({ items, holderName, nowIso, refreshing, onRefresh }: WithdrawalListProps) {
  const [selected, setSelected] = useState<WithdrawalItem | null>(null);
  const groups = useMemo(() => groupWithdrawalsByDay(items, nowIso), [items, nowIso]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center px-8 pt-28 text-center">
        <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5">
          <Inbox className="h-6 w-6 text-gray-400" />
        </span>
        <h2 className="mt-4 text-[15px] font-bold text-gray-900">Nenhum resgate por aqui</h2>
        <p className="mt-1.5 max-w-[260px] text-[13px] leading-snug text-gray-500">
          Quando você solicitar um saque, ele aparecerá nesta lista.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">
          {items.length} {items.length === 1 ? 'resgate' : 'resgates'}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-primary disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
          Atualizar
        </button>
      </div>

      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="px-3 pt-3">
          <h2 className="px-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-400">{group.label}</h2>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  aria-label={`Resgate de ${formatBrl(item.amountCents)}, ${formatTime(item.createdAt)}`}
                  className="flex w-full items-center gap-2 rounded-xl bg-white px-4 py-3 text-left shadow-sm active:scale-[0.99] transition-transform"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-gray-900">Pix</span>
                    <span className="mt-1.5 block">
                      <WithdrawalStatusBadge status={item.status} />
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[16px] font-extrabold tabular-nums text-gray-900">
                      {formatBrl(item.amountCents)}
                    </span>
                    <span className="mt-1.5 block text-[12px] tabular-nums text-gray-400">
                      {formatTime(item.createdAt)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <WithdrawalDetailsSheet item={selected} holderName={holderName} onClose={() => setSelected(null)} />
    </>
  );
}
