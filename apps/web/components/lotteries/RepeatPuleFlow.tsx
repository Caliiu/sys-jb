'use client';

import {
  type DrawSchedule,
  LOTTERY_GAME_DRAWS,
  type LotteryGame,
  type PlaceLotteryTicketsResponse,
  type PublicDraw,
  type PublicWallet,
  isDrawOpenOn,
  lotteryGameType,
} from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { repeatLotteryTicketAction } from '@/app/lottery-actions';
import { type LotteryDay, drawKey } from '@/lib/lotteries';
import ErrorDialog from '../fazendinha/ErrorDialog';
import { useToast } from '../ui/Toast';
import DrawsStep from './DrawsStep';
import { FooterButton } from './EntrySteps';
import LotteryBar from './LotteryBar';
import LotteryReceipt from './LotteryReceipt';
import { SummaryCard } from './PickSteps';
import { RepeatCodeStep, RepeatDateStep, RepeatModalityStep, onlyPuleDigits, parsePuleCode } from './RepeatSteps';
import RepeatSuccessDialog from './RepeatSuccessDialog';

type Step = 'modality' | 'date' | 'draws' | 'code' | 'receipt';

/** Etapas com a barra de progresso (como nos prints: 7 segmentos; o recibo é a última). */
export const REPEAT_STEP_COUNT = 7;
const STEPS: Record<Exclude<Step, 'receipt'>, { n: number; title: string }> = {
  modality: { n: 2, title: 'Repetir pule' },
  date: { n: 3, title: 'Data' },
  draws: { n: 4, title: 'Loterias' },
  code: { n: 6, title: 'Código da pule' },
};

interface RepeatPuleFlowProps {
  /** Horário do servidor avançando com a página (lista de loterias abertas). */
  now: string;
  /** Leitura na hora do relógio do servidor (confere o fechamento antes de enviar). */
  clock: () => string;
  refresh: () => void;
  /** Hoje e os próximos dias (as datas são as mesmas nos dois jogos). */
  days: LotteryDay[];
  schedule: DrawSchedule;
  wallet: PublicWallet;
  /** Saldo atualizado depois da compra (vale também para as Loterias ao voltar). */
  onWallet: (wallet: PublicWallet) => void;
  userName: string;
  sellerId: number;
  /** Volta ao menu das Loterias ("Nova aposta"). */
  onExit: () => void;
}

/**
 * Repetir pule: jogo → data → loterias (do jogo) → código da pule → recibo. As apostas vêm da pule (a API só aceita
 * pule do próprio jogador, do jogo escolhido, e usa a cotação de agora); a compra passa pelas mesmas travas da venda.
 */
export default function RepeatPuleFlow({
  now,
  clock,
  refresh,
  days,
  schedule,
  wallet,
  onWallet,
  userName,
  sellerId,
  onExit,
}: RepeatPuleFlowProps) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>('modality');
  const [game, setGame] = useState<LotteryGame>('tradicional');
  const gameType = lotteryGameType(game);
  const [day, setDay] = useState<LotteryDay | null>(null);
  const [draws, setDraws] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<PlaceLotteryTicketsResponse | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<{ message: string; afterClose?: () => void } | null>(null);
  // Uma chave por pedido (pule + data + loterias): reenviar o mesmo nunca compra duas vezes; mudar algo gera outra.
  const purchaseKey = useRef<string | null>(null);

  const selectedDraws = draws
    .map((key) => schedule.draws.find((d) => drawKey(d) === key))
    .filter((d): d is PublicDraw => d !== undefined);
  const puleNumber = parsePuleCode(code);

  /** Das loterias `keys`, as que ainda aceitam aposta agora para a data `date`. */
  const openKeys = (keys: string[], date: string) => {
    const current = clock();
    return keys.filter((key) => {
      const draw = schedule.draws.find((d) => drawKey(d) === key);
      return draw !== undefined && isDrawOpenOn(current, date, draw.closesAt);
    });
  };

  const show = (next: Step) => {
    setStep(next);
    window.scrollTo(0, 0);
  };

  /** Lista de loterias da data `date`: as escolhidas que fecharam saem da seleção. */
  const showDraws = (date: string, keys: string[]) => {
    refresh();
    const stillOpen = openKeys(keys, date);
    if (stillOpen.length !== draws.length || stillOpen.some((key, i) => key !== draws[i])) changeDraws(stillOpen);
    show('draws');
  };

  function changeDraws(next: string[]) {
    purchaseKey.current = null;
    setDraws(next);
  }

  function changeCode(next: string) {
    purchaseKey.current = null;
    setCode(next);
  }

  async function paste() {
    try {
      const digits = onlyPuleDigits(await navigator.clipboard.readText());
      if (digits) changeCode(digits);
      else toast.show('Nada para colar. Digite o código da pule.');
    } catch {
      toast.show('Não foi possível colar. Digite o código da pule.');
    }
  }

  async function submit() {
    if (!day || puleNumber === null || pending || selectedDraws.length === 0) return;
    // Loterias que fecharam enquanto o jogador digitava saem antes de enviar.
    const stillOpen = openKeys(draws, day.date);
    if (stillOpen.length !== draws.length) {
      changeDraws(stillOpen);
      return setError({
        message: 'Uma das loterias escolhidas já encerrou. Escolha outra.',
        afterClose: () => show('draws'),
      });
    }

    purchaseKey.current ??= crypto.randomUUID();
    setPending(true);
    try {
      const result = await repeatLotteryTicketAction({
        idempotencyKey: purchaseKey.current,
        puleNumber,
        game,
        drawDate: day.date,
        draws: selectedDraws.map((d) => ({ name: d.name, hour: d.hour })),
      });
      if (result.ok) {
        setReceipt(result.data);
        onWallet(result.data.wallet);
        setRedirecting(true);
        return;
      }
      if (result.code === 'SESSION_INVALID') return router.replace('/login');
      setError({
        message: result.message,
        afterClose: result.code === 'DRAW_CLOSED' ? () => showDraws(day.date, draws) : undefined,
      });
    } catch {
      setError({ message: 'Não foi possível repetir a pule. Tente novamente.' });
    } finally {
      setPending(false);
    }
  }

  // ---------------- Recibo ----------------
  if (step === 'receipt' && receipt) {
    return <LotteryReceipt receipt={receipt} wallet={wallet} exitLabel="Menu" onExit={onExit} />;
  }

  // ---------------- Etapas ----------------
  const current = STEPS[step === 'receipt' ? 'code' : step];
  const back = () => {
    switch (step) {
      case 'date':
        return show('modality');
      case 'draws':
        return show('date');
      case 'code':
        return day ? showDraws(day.date, draws) : show('date');
      default:
        return onExit();
    }
  };
  const summary = (
    <SummaryCard title="Repetir Pule" subtitle={gameType.description} step={current.n} total={REPEAT_STEP_COUNT} />
  );

  return (
    <>
      <LotteryBar
        title={current.title}
        back={{ onClick: back, label: step === 'modality' ? 'Voltar às loterias' : 'Voltar' }}
        wallet={wallet}
        userName={userName}
        displayId={sellerId}
        step={current.n}
        stepCount={REPEAT_STEP_COUNT}
      />
      {step === 'modality' && (
        <RepeatModalityStep
          onPick={(picked) => {
            // Outro jogo: as loterias escolhidas eram do outro (a lista muda).
            if (picked !== game) {
              setGame(picked);
              changeDraws([]);
            }
            show('date');
          }}
          onComingSoon={(label) => toast.comingSoon(label)}
        />
      )}
      {step === 'date' && (
        <RepeatDateStep
          days={days}
          footer={summary}
          onPick={(picked) => {
            setDay(picked);
            // Outra data: a seleção recomeça. A mesma: mantém as que ainda estão abertas.
            showDraws(picked.date, picked.date === day?.date ? draws : []);
          }}
        />
      )}
      {step === 'draws' && day && (
        <DrawsStep
          nowIso={now}
          schedule={schedule}
          drawDate={day.date}
          game={LOTTERY_GAME_DRAWS[game]}
          selected={draws}
          onChange={changeDraws}
          onNext={() => show('code')}
        />
      )}
      {step === 'code' && day && (
        <RepeatCodeStep
          gameLabel={gameType.label}
          draws={selectedDraws}
          day={day}
          code={code}
          onCode={changeCode}
          onPaste={paste}
          onSubmit={submit}
          footer={
            <FooterButton
              label={pending ? 'Aguarde…' : 'Avançar'}
              onClick={submit}
              disabled={puleNumber === null || pending || redirecting}
            />
          }
        />
      )}
      <ErrorDialog
        title="Não foi possível repetir"
        actionLabel="Tentar novamente"
        variant="soft"
        message={error?.message ?? null}
        onClose={() => {
          error?.afterClose?.();
          setError(null);
        }}
      />
      <RepeatSuccessDialog
        open={redirecting}
        onDone={() => {
          setRedirecting(false);
          setStep('receipt');
          window.scrollTo(0, 0);
        }}
      />
    </>
  );
}
