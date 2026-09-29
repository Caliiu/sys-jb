'use client';

import {
  LOTTERY_LIMITS,
  type LotteryModality,
  type LotteryPlacement,
  type LotterySplit,
  type DrawSchedule,
  type PlaceLotteryTicketsResponse,
  type PublicDraw,
  type PublicQuotes,
  type PublicWallet,
  formatGuess,
  isDrawOpenOn,
  lotteryQuoteCents,
  placementsFor,
} from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { placeLotteryTicketsAction } from '@/app/lottery-actions';
import { formatBrl } from '@/lib/currency';
import { splitLabel } from '@/lib/report-receipts';
import {
  type CartItem,
  type LotteryDay,
  cartTotal,
  drawKey,
  itemPossiblePrize,
  itemTotal,
  lotteryDays,
  weekdayOf,
} from '@/lib/lotteries';
import { useServerNow } from '@/hooks/useServerNow';
import { ROUTES } from '@/lib/routes';
import BalancePill from '../fazendinha/BalancePill';
import ErrorDialog from '../fazendinha/ErrorDialog';
import SectionBar from '../section/SectionBar';
import { useToast } from '../ui/Toast';
import CartStep from './CartStep';
import DrawsStep from './DrawsStep';
import { AmountStep, GuessesStep } from './EntrySteps';
import LotteryBar from './LotteryBar';
import LotteryReceipt from './LotteryReceipt';
import { DateStep, ModalityStep, PlacementStep, SummaryCard, TypeStep } from './PickSteps';
import RepeatPuleFlow from './RepeatPuleFlow';
import SuccessDialog from './SuccessDialog';
import TicketCard from './TicketCard';

type Step =
  | 'type'
  | 'date'
  | 'modality'
  | 'placement'
  | 'guesses'
  | 'amount'
  | 'draws'
  | 'cart'
  | 'review'
  | 'receipt'
  | 'repeat';

const STEPS: Record<Exclude<Step, 'review' | 'receipt' | 'repeat'>, { n: number; title: string }> = {
  type: { n: 1, title: 'Nova aposta' },
  date: { n: 2, title: 'Data' },
  modality: { n: 3, title: 'Modalidade' },
  placement: { n: 4, title: 'Colocação' },
  guesses: { n: 5, title: 'Palpites' },
  amount: { n: 6, title: 'Valor' },
  draws: { n: 7, title: 'Loterias' },
  cart: { n: 8, title: 'Carrinho' },
};

interface Draft {
  modality: LotteryModality | null;
  placement: LotteryPlacement | null;
  guesses: string[];
  amountCents: number;
  split: LotterySplit;
}

const EMPTY_DRAFT: Draft = { modality: null, placement: null, guesses: [], amountCents: 0, split: 'total' };

interface LotteriesScreenProps {
  nowIso: string;
  wallet: PublicWallet;
  quotes: PublicQuotes;
  /** Cadastro de sorteios da banca. */
  schedule: DrawSchedule;
  /** Vendedor = o próprio jogador (displayId), no resumo e no cabeçalho. */
  sellerId: number;
  /** Nome do jogador, no cabeçalho ("Olá, …"). */
  userName: string;
}

/**
 * Loterias (Tradicional) numa rota só: Nova aposta → Data → Modalidade → Colocação → Palpites → Valor →
 * Loterias → Carrinho → Finalizar, e o recibo. "Mais apostas" volta à Modalidade mantendo data e loterias.
 * "Repetir pule" (primeira tela) abre o próprio fluxo (RepeatPuleFlow) na mesma rota.
 */
export default function LotteriesScreen({
  nowIso,
  wallet: initialWallet,
  quotes,
  schedule,
  sellerId,
  userName,
}: LotteriesScreenProps) {
  const router = useRouter();
  const toast = useToast();
  // Horário do servidor, avançando com a página aberta (lista de loterias e o "Hoje" depois da meia-noite).
  const { now, clock, refresh } = useServerNow(nowIso);
  const days = useMemo(() => lotteryDays(now, schedule), [now, schedule]);
  const [step, setStep] = useState<Step>('type');
  const [day, setDay] = useState<LotteryDay | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [items, setItems] = useState<CartItem[]>([]);
  const [draws, setDraws] = useState<string[]>([]);
  const [wallet, setWallet] = useState(initialWallet);
  const [receipt, setReceipt] = useState<PlaceLotteryTicketsResponse | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; afterClose?: () => void } | null>(null);
  // Uma chave por carrinho: reenviar o mesmo (ex.: após falha de rede) nunca compra duas vezes.
  const purchaseKey = useRef<string | null>(null);

  // Cotação recarregada (ex.: mudou no meio da compra): as apostas passam a usar a nova; desligadas saem.
  // Ajuste durante a renderização (padrão do React para "estado derivado de uma prop que mudou").
  const [quotesSeen, setQuotesSeen] = useState(quotes);
  if (quotesSeen !== quotes) {
    setQuotesSeen(quotes);
    setItems((current) =>
      current
        .map((item) => ({ ...item, quoteCents: lotteryQuoteCents(item.modality, quotes) }))
        .filter((item) => item.quoteCents > 0),
    );
  }

  const go = (next: Step) => {
    if (next === 'draws' && day) {
      // Loterias que fecharam desde a última vez saem da lista e da seleção.
      const current = clock();
      const stillOpen = (key: string) => {
        const draw = schedule.draws.find((d) => drawKey(d) === key);
        return draw !== undefined && isDrawOpenOn(current, day.date, draw.closesAt);
      };
      refresh();
      // A chave de compra continua a mesma: se uma tentativa anterior chegou a comprar (resposta perdida), a API
      // recusa a nova seleção como CONFLICT em vez de cobrar duas vezes.
      if (!draws.every(stillOpen)) setDraws(draws.filter(stillOpen));
    }
    setStep(next);
    window.scrollTo(0, 0);
  };
  const changeCart =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      purchaseKey.current = null;
      setter(value);
    };

  const selectedDraws = draws
    .map((key) => schedule.draws.find((d) => drawKey(d) === key))
    .filter((d): d is PublicDraw => d !== undefined);
  const total = cartTotal(items, draws.length);
  const dayLong = day ? `${weekdayOf(day.date)} ${day.label}` : '';

  function reset() {
    setDay(null);
    setDraft(EMPTY_DRAFT);
    setItems([]);
    setDraws([]);
    setReceipt(null);
    purchaseKey.current = null;
    go('type');
  }

  function addDraftToCart() {
    if (!draft.modality || !draft.placement) return;
    purchaseKey.current = null;
    setItems((cur) => [
      ...cur,
      {
        modality: draft.modality!,
        placement: draft.placement!,
        guesses: draft.guesses,
        amountCents: draft.amountCents,
        split: draft.split,
        quoteCents: lotteryQuoteCents(draft.modality!, quotes),
      },
    ]);
    setDraft(EMPTY_DRAFT);
    go(draws.length > 0 ? 'cart' : 'draws');
  }

  async function finalize() {
    if (!day || pending) return;
    // Extrações que fecharam enquanto o jogador revisava saem antes de enviar.
    const current = clock();
    const open = selectedDraws.filter((d) => isDrawOpenOn(current, day.date, d.closesAt));
    if (open.length !== selectedDraws.length) {
      setDraws(open.map(drawKey));
      return setError({
        message: 'Uma das loterias escolhidas já encerrou. Escolha outra.',
        afterClose: () => go('draws'),
      });
    }
    purchaseKey.current ??= crypto.randomUUID();
    setPending(true);
    try {
      const result = await placeLotteryTicketsAction({
        idempotencyKey: purchaseKey.current,
        drawDate: day.date,
        draws: selectedDraws.map((d) => ({ name: d.name, hour: d.hour })),
        items: items.map((item) => ({
          modality: item.modality.id,
          placement: item.placement.id,
          guesses: item.guesses,
          amountCents: item.amountCents,
          split: item.split,
          quoteCents: item.quoteCents,
        })),
      });
      if (result.ok) {
        setReceipt(result.data);
        setWallet(result.data.wallet);
        setShowSuccess(true);
        go('receipt');
        return;
      }
      if (result.code === 'SESSION_INVALID') return router.replace('/login');
      const afterClose =
        result.code === 'QUOTE_CHANGED'
          ? () => {
              purchaseKey.current = null;
              router.refresh();
              go('cart');
            }
          : result.code === 'DRAW_CLOSED'
            ? () => go('draws')
            : undefined;
      setError({ message: result.message, afterClose });
    } catch {
      setError({ message: 'Não foi possível concluir a aposta. Tente novamente.' });
    } finally {
      setPending(false);
    }
  }

  const errorDialog = (
    <ErrorDialog
      message={error?.message ?? null}
      onClose={() => {
        error?.afterClose?.();
        setError(null);
      }}
    />
  );

  // ---------------- Repetir pule ----------------
  if (step === 'repeat') {
    return (
      <RepeatPuleFlow
        now={now}
        clock={clock}
        refresh={refresh}
        days={days}
        schedule={schedule}
        wallet={wallet}
        onWallet={setWallet}
        userName={userName}
        sellerId={sellerId}
        onExit={() => go('type')}
      />
    );
  }

  // ---------------- Recibo ----------------
  if (step === 'receipt' && receipt) {
    return (
      <LotteryReceipt receipt={receipt} wallet={wallet} exitLabel="Nova aposta" onExit={reset}>
        <SuccessDialog open={showSuccess} onClose={() => setShowSuccess(false)} />
      </LotteryReceipt>
    );
  }

  // ---------------- Finalizar (resumo) ----------------
  if (step === 'review' && day) {
    return (
      <>
        <SectionBar
          title="Finalizar"
          back={{ onClick: () => go('cart'), label: 'Voltar ao carrinho' }}
          trailing={<BalancePill wallet={wallet} />}
        />
        <main className="px-2 py-3 pb-44 space-y-3">
          {selectedDraws.map((draw) => (
            <TicketCard
              key={drawKey(draw)}
              heading="RESUMO DA APOSTA"
              sellerId={sellerId}
              stampIso={nowIso}
              drawDate={day.date}
              quoteTable={quotes.tableLabel}
              lottery={draw.name}
              items={items.map((item) => ({
                title: `${item.modality.label} ${item.placement.label}`,
                guesses: item.guesses.map((g) => formatGuess(item.modality, g)),
                amountCents: item.amountCents,
                splitLabel: splitLabel(item.split),
                possiblePrizeCents: itemPossiblePrize(item),
              }))}
              totalCents={items.reduce((sum, item) => sum + itemTotal(item), 0)}
            />
          ))}
          {selectedDraws.length > 1 && (
            <p className="rounded-xl bg-white px-4 py-3 text-[15px] font-bold shadow-card">
              Total a pagar ({selectedDraws.length} loterias): {formatBrl(total)}
            </p>
          )}
        </main>
        <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px] space-y-2 bg-[#F4F6F6] px-2 pt-3 pb-3">
          <button
            type="button"
            onClick={() => go('cart')}
            className="h-14 w-full rounded-xl bg-brand-orange text-[16px] font-bold text-white"
          >
            Voltar as apostas
          </button>
          <button
            type="button"
            onClick={finalize}
            disabled={pending}
            className="h-14 w-full rounded-xl bg-brand-primary text-[16px] font-bold text-white disabled:opacity-60"
          >
            {pending ? 'Aguarde…' : 'Finalizar'}
          </button>
        </div>
        {errorDialog}
      </>
    );
  }

  // ---------------- Etapas com barra de progresso ----------------
  const current = STEPS[step as keyof typeof STEPS] ?? STEPS.type;
  const back = (): (() => void) => {
    switch (step) {
      case 'date':
        return () => go('type');
      case 'modality':
        return () => go(items.length > 0 ? 'cart' : 'date');
      case 'placement':
        return () => go('modality');
      case 'guesses':
        return () => go('placement');
      case 'amount':
        return () => go('guesses');
      case 'draws':
        return () => go(items.length > 0 && draft.modality === null ? 'cart' : 'amount');
      case 'cart':
        return () => go('draws');
      default:
        return () => router.push(ROUTES.home);
    }
  };
  const summary = (
    <SummaryCard
      title={[
        'Tradicional',
        draft.modality && draft.modality.label.charAt(0) + draft.modality.label.slice(1).toLowerCase(),
      ]
        .filter(Boolean)
        .join(' · ')}
      subtitle={
        step === 'guesses' || step === 'amount'
          ? `${draft.placement?.label ?? ''} · ${day ? weekdayOf(day.date) : ''} · ${draft.guesses.length} palpite${draft.guesses.length === 1 ? '' : 's'}`
          : day
            ? `${day.label} · ${weekdayOf(day.date)}`
            : 'Tradicionais 1/7'
      }
      step={current.n}
    />
  );

  return (
    <>
      <LotteryBar
        title={current.title}
        back={step === 'type' ? { href: ROUTES.home, label: 'Voltar ao início' } : { onClick: back(), label: 'Voltar' }}
        wallet={wallet}
        userName={userName}
        displayId={sellerId}
        step={current.n}
      />
      {step === 'type' && (
        <TypeStep
          onPick={() => go('date')}
          onRepeat={() => go('repeat')}
          onComingSoon={(label) => toast.comingSoon(label)}
        />
      )}
      {step === 'date' && (
        <>
          <DateStep
            days={days}
            onPick={(picked) => {
              if (picked.date !== day?.date) setDraws([]);
              setDay(picked);
              go('modality');
            }}
          />
          <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px] px-3 pb-3">
            <SummaryCard title="Tradicional" subtitle="Tradicionais 1/7" step={2} />
          </div>
        </>
      )}
      {step === 'modality' && (
        <ModalityStep
          quotes={quotes}
          footer={summary}
          onPick={(modality) => {
            const placements = placementsFor(modality);
            setDraft({ ...EMPTY_DRAFT, modality, placement: placements.length === 1 ? placements[0]! : null });
            go(placements.length === 1 ? 'guesses' : 'placement');
          }}
        />
      )}
      {step === 'placement' && draft.modality && (
        <PlacementStep
          placements={placementsFor(draft.modality)}
          footer={summary}
          onPick={(placement) => {
            setDraft((d) => ({ ...d, placement }));
            go('guesses');
          }}
        />
      )}
      {step === 'guesses' && draft.modality && (
        <GuessesStep
          modality={draft.modality}
          guesses={draft.guesses}
          onChange={(guesses) => setDraft((d) => ({ ...d, guesses }))}
          onNext={() => go('amount')}
          summary={summary}
        />
      )}
      {step === 'amount' && (
        <AmountStep
          amountCents={draft.amountCents}
          split={draft.split}
          guesses={draft.guesses.length}
          maxCents={LOTTERY_LIMITS.maxAmountCents}
          onAmount={(amountCents) => setDraft((d) => ({ ...d, amountCents }))}
          onSplit={(split) => setDraft((d) => ({ ...d, split }))}
          onNext={addDraftToCart}
          summary={summary}
        />
      )}
      {step === 'draws' && day && (
        <DrawsStep
          nowIso={now}
          schedule={schedule}
          drawDate={day.date}
          selected={draws}
          onChange={changeCart(setDraws)}
          onNext={() => go('cart')}
        />
      )}
      {step === 'cart' && (
        <CartStep
          items={items}
          draws={draws.length}
          dayLabel={dayLong}
          total={total}
          onUpdate={(index, next) => changeCart(setItems)(items.map((it, i) => (i === index ? next : it)))}
          onRemove={(index) => {
            const next = items.filter((_, i) => i !== index);
            changeCart(setItems)(next);
            if (next.length === 0) go('modality');
          }}
          onMore={() => {
            setDraft(EMPTY_DRAFT);
            go('modality');
          }}
          onNext={() => (draws.length === 0 ? go('draws') : go('review'))}
        />
      )}
      {errorDialog}
    </>
  );
}
