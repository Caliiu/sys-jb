'use client';

import type { DrawSchedule, FazendinhaQuote, PublicFazendinhaBet, PublicWallet } from '@sysjb/contracts';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Search, Ticket } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { fazendinhaSoldAction } from '@/app/fazendinha-actions';
import { useServerNow } from '@/hooks/useServerNow';
import { formatBrl } from '@/lib/currency';
import {
  FAZENDINHA_MAX_DAY_OFFSET,
  FAZENDINHA_MODES,
  type FazendinhaLottery,
  type FazendinhaMode,
  type FazendinhaModeId,
  type FazendinhaTicket,
  type SoldMap,
  dayLabel,
  drawDateOf,
  lotteryLabel,
  openLotteries,
  offeredStakes,
  soldKey,
  toSoldMap,
} from '@/lib/fazendinha';
import SectionBar from '../section/SectionBar';
import BalancePill from './BalancePill';
import BetReceipt from './BetReceipt';
import PalpitesScreen from './PalpitesScreen';
import { MODE_STYLE } from './mode-style';

const arrowClass =
  'w-7 h-7 rounded bg-brand-primary flex items-center justify-center text-white active:scale-95 transition-transform disabled:opacity-40';

interface FazendinhaScreenProps {
  /** Instante de referência vindo do servidor (evita divergência de hidratação). */
  nowIso: string;
  wallet: PublicWallet;
  /** Números já vendidos hoje (vindos do servidor com a página). */
  initialSold: SoldMap;
  /** Cotação da banca: valores oferecidos e prêmio de cada um. */
  quotes: FazendinhaQuote[];
  /** Cadastro de sorteios da banca (dias, exceções e horário máximo de venda). */
  schedule: DrawSchedule;
}

/**
 * Fazendinha em três etapas na mesma rota: lista de extrações/cotações, palpites da aposta escolhida e
 * comprovante da compra. A lista mantém dia, modalidade e busca ao voltar.
 */
export default function FazendinhaScreen({
  nowIso,
  wallet: initialWallet,
  initialSold,
  quotes,
  schedule,
}: FazendinhaScreenProps) {
  // Horário do servidor, avançando com a página aberta: extrações que fecham saem da lista e, depois da
  // meia-noite, "Hoje" passa a ser o novo dia.
  const { now, refresh } = useServerNow(nowIso);
  const [dayOffset, setDayOffset] = useState(0);
  const drawDate = drawDateOf(now, dayOffset);
  const [query, setQuery] = useState('');
  const [modeId, setModeId] = useState<FazendinhaModeId>('grupo');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ticket, setTicket] = useState<FazendinhaTicket | null>(null);
  const [receipt, setReceipt] = useState<PublicFazendinhaBet | null>(null);
  const [wallet, setWallet] = useState(initialWallet);
  // Números vendidos por data: o de hoje vem com a página; os outros, ao navegar.
  const [soldByDay, setSoldByDay] = useState<Record<string, SoldMap>>(() => ({
    [drawDateOf(nowIso, 0)]: initialSold,
  }));
  const mode = FAZENDINHA_MODES.find((m) => m.id === modeId) ?? FAZENDINHA_MODES[0]!;
  const lotteries = openLotteries(schedule, now, drawDate, query);
  const sold = soldByDay[drawDate] ?? {};
  const balance = <BalancePill wallet={wallet} />;

  useEffect(() => {
    if (soldByDay[drawDate]) return;
    let active = true;
    // Falha na consulta: a lista segue sem marcar vendidos; a API recusa número já vendido na compra.
    void fazendinhaSoldAction(drawDate).then((entries) => {
      if (active && entries) setSoldByDay((cur) => ({ ...cur, [drawDate]: toSoldMap(entries) }));
    });
    return () => {
      active = false;
    };
  }, [drawDate, soldByDay]);

  function changeDay(delta: number) {
    setDayOffset((d) => d + delta);
    setExpanded(null);
    refresh();
  }

  function goTo(next: { ticket?: FazendinhaTicket | null; receipt?: PublicFazendinhaBet | null }) {
    setTicket(next.ticket ?? null);
    setReceipt(next.receipt ?? null);
    // Voltando para a lista (ex.: extração encerrada), ela já aparece com o horário atual.
    refresh();
    window.scrollTo(0, 0);
  }

  /** Marca números como vendidos na cartela (compra própria ou de outra pessoa). */
  function markSold(t: FazendinhaTicket, numbers: number[]) {
    const key = soldKey(t.lottery, t.mode.id, t.stakeCents);
    setSoldByDay((cur) => {
      const day = cur[t.drawDate] ?? {};
      return { ...cur, [t.drawDate]: { ...day, [key]: [...new Set([...(day[key] ?? []), ...numbers])] } };
    });
  }

  if (receipt) {
    return (
      <>
        <SectionBar
          title="Sucesso"
          tone="success"
          back={{ onClick: () => goTo({}), label: 'Voltar à Fazendinha' }}
          trailing={balance}
        />
        <BetReceipt bet={receipt} onNewBet={() => goTo({})} />
      </>
    );
  }

  if (ticket) {
    return (
      <>
        <SectionBar
          title="Palpites"
          back={{ onClick: () => goTo({}), label: 'Voltar à Fazendinha' }}
          trailing={balance}
        />
        <PalpitesScreen
          ticket={ticket}
          sold={sold[soldKey(ticket.lottery, ticket.mode.id, ticket.stakeCents)] ?? []}
          onPurchased={({ bet, wallet: next }) => {
            setWallet(next);
            markSold(ticket, bet.numbers);
            goTo({ receipt: bet });
          }}
          onSoldOut={(numbers) => markSold(ticket, numbers)}
          onDrawClosed={() => goTo({})}
        />
      </>
    );
  }

  return (
    <>
      <SectionBar title="Fazendinha" trailing={balance} />
      <div className="relative aspect-[960/568] w-full">
        <Image
          src="/banners/fazendinha.webp"
          alt="Fazendinha da Sorte"
          fill
          priority
          sizes="(max-width: 480px) 100vw, 480px"
          className="object-cover"
        />
      </div>

      <nav aria-label="Dia da extração" className="flex items-center justify-between px-3 py-3 bg-white">
        <button
          type="button"
          onClick={() => changeDay(-1)}
          disabled={dayOffset === 0}
          aria-label="Dia anterior"
          className={arrowClass}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
        </button>
        <span aria-live="polite" className="text-[16px] text-gray-900">
          {dayLabel(now, dayOffset)}
        </span>
        <button
          type="button"
          onClick={() => changeDay(1)}
          disabled={dayOffset === FAZENDINHA_MAX_DAY_OFFSET}
          aria-label="Próximo dia"
          className={arrowClass}
        >
          <ArrowRight className="w-4 h-4" aria-hidden />
        </button>
      </nav>

      <div className="px-3 pt-4 pb-4 bg-white border-y border-gray-200">
        <label className="flex items-center gap-2 h-11 rounded-md border border-gray-200 px-3 focus-within:border-brand-primary">
          <Search className="w-4 h-4 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar loteria"
            aria-label="Pesquisar loteria"
            className="flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none"
          />
        </label>

        <div role="group" aria-label="Modalidade" className="grid grid-cols-3 gap-2 mt-3">
          {FAZENDINHA_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModeId(m.id)}
              aria-pressed={m.id === modeId}
              className={`h-9 rounded-md border border-dashed text-[14px] font-medium transition-colors ${
                m.id === modeId ? MODE_STYLE[m.id].active : MODE_STYLE[m.id].idle
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <main className="px-3 py-3 space-y-2">
        {lotteries.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-gray-500">
            {query ? 'Nenhuma loteria encontrada.' : 'Não há mais extrações abertas neste dia.'}
          </p>
        ) : (
          lotteries.map((lottery) => {
            const label = lotteryLabel(lottery);
            return (
              <LotteryItem
                key={label}
                lottery={lottery}
                mode={mode}
                sold={sold}
                open={expanded === label}
                onToggle={() => setExpanded((cur) => (cur === label ? null : label))}
                stakes={offeredStakes(quotes, mode.id)}
                onSelect={(stakeCents, prizeCents) =>
                  goTo({
                    ticket: { drawDate, dayLabel: dayLabel(now, dayOffset), lottery, mode, stakeCents, prizeCents },
                  })
                }
              />
            );
          })
        )}
      </main>
    </>
  );
}

interface LotteryItemProps {
  lottery: FazendinhaLottery;
  mode: FazendinhaMode;
  sold: SoldMap;
  open: boolean;
  onToggle: () => void;
  /** Valores oferecidos na modalidade, com o prêmio de cada um. */
  stakes: Array<{ stakeCents: number; prizeCents: number }>;
  onSelect: (stakeCents: number, prizeCents: number) => void;
}

function LotteryItem({ lottery, mode, sold, open, onToggle, stakes, onSelect }: LotteryItemProps) {
  const label = lotteryLabel(lottery);
  const panelId = `fazendinha-${label.replace(/\W+/g, '-')}`;

  return (
    <section className="rounded-md bg-white shadow-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 px-3 py-3 text-left"
      >
        <span className="relative w-7 h-7 rounded bg-sky-100 flex items-center justify-center shrink-0">
          <Ticket className="w-4 h-4 text-sky-500" aria-hidden />
          <span className="absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full bg-brand-gold" aria-hidden />
        </span>
        <span className="flex-1 text-[14px] text-gray-900 uppercase">{label}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden />
        )}
      </button>

      {open && (
        <ul
          id={panelId}
          aria-label={`Cotações ${label}`}
          className="bg-[#F4F6F6] border-t border-gray-200 p-2 space-y-2"
        >
          {stakes.map(({ stakeCents: stake, prizeCents: prize }) => {
            const soldCount = sold[soldKey(lottery, mode.id, stake)]?.length ?? 0;
            // Vendidos / total; com pelo menos 1 vendido a barra aparece (1 de 1000 seria invisível).
            const progress = soldCount === 0 ? 0 : Math.max(2, (soldCount / mode.numbers) * 100);
            return (
              <li key={stake}>
                <button
                  type="button"
                  onClick={() => onSelect(stake, prize)}
                  className="block w-full rounded-md bg-white shadow-card px-3 py-3 text-left active:scale-[0.99] transition-transform"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-[16px] text-gray-700 tabular-nums">{formatBrl(stake)}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400" aria-label="paga" />
                    <span className="flex-1 text-[16px] font-bold text-gray-800 tabular-nums">{formatBrl(prize)}</span>
                    <span
                      className={`rounded border border-dashed px-2 py-0.5 text-[13px] font-medium ${MODE_STYLE[mode.id].badge}`}
                    >
                      {mode.label}
                    </span>
                  </span>
                  <span
                    role="progressbar"
                    aria-label="Números vendidos"
                    aria-valuemin={0}
                    aria-valuemax={mode.numbers}
                    aria-valuenow={soldCount}
                    className="block h-1 rounded-full bg-gray-200 my-3 overflow-hidden"
                  >
                    <span
                      className="block h-full rounded-full bg-brand-primary transition-[width]"
                      style={{ width: `${progress}%` }}
                    />
                  </span>
                  <span className="flex items-center justify-between">
                    <span className="rounded bg-gray-100 px-2 py-1 text-[12px] text-gray-500 uppercase">{label}</span>
                    <span className="text-[14px] text-gray-500">{mode.numbers - soldCount} números restantes</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
