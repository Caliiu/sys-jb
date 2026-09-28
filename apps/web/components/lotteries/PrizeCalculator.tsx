'use client';

import {
  LOTTERY_LIMITS,
  LOTTERY_MODALITIES,
  type LotteryModality,
  type LotteryPlacement,
  type PublicQuotes,
  distinctPermutations,
  lotteryPossiblePrizeCents,
  lotteryQuoteCents,
  placementsFor,
} from '@sysjb/contracts';
import { Calculator, ChevronRight, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { formatBrl, formatCents, parseCurrencyInput } from '@/lib/currency';
import { ROUTES } from '@/lib/routes';
import SectionBar from '../section/SectionBar';
import BottomSheet from '../ui/BottomSheet';
import LotteryToolsNav from './LotteryToolsNav';

const cardClass = 'rounded-xl bg-white shadow-card';

/**
 * Palpite usado na conta: só importa nas invertidas, em que o valor é dividido entre as combinações do
 * palpite; o simulador considera dígitos todos diferentes (1234 = 24 combinações), o caso mais comum.
 */
const simulatedGuess = (modality: LotteryModality) => '1234'.slice(0, modality.digits);

/** Possível prêmio (centavos) de um palpite com o valor informado, pela cotação da banca. */
export function simulatePrize(
  modality: LotteryModality,
  placement: LotteryPlacement,
  amountCents: number,
  quotes: Pick<PublicQuotes, 'traditional'>,
): number {
  return lotteryPossiblePrizeCents(
    modality,
    placement,
    [simulatedGuess(modality)],
    amountCents,
    'total',
    lotteryQuoteCents(modality, quotes),
  );
}

type Picker = 'quote' | 'modality' | 'placement' | null;

function StepBadge({ n, state }: { n: number; state: 'done' | 'pending' | 'disabled' }) {
  const tone =
    state === 'done'
      ? 'bg-brand-primary text-white'
      : state === 'pending'
        ? 'bg-brand-primary/10 text-brand-primary'
        : 'bg-gray-100 text-gray-300';
  return (
    <span
      aria-hidden
      className={`flex w-9 h-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${tone}`}
    >
      {n}
    </span>
  );
}

function StepButton({
  n,
  label,
  value,
  disabled = false,
  onClick,
}: {
  n: number;
  label: string;
  /** null = ainda não escolhido ("Selecionar"). */
  value: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${value ?? 'Selecionar'}`}
      className={`${cardClass} flex w-full items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99] transition-transform disabled:opacity-50 disabled:active:scale-100`}
    >
      <StepBadge n={n} state={disabled ? 'disabled' : value ? 'done' : 'pending'} />
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
        <span className={`block truncate text-[16px] ${value ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
          {value ?? 'Selecionar'}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
    </button>
  );
}

/** Lista de opções numa folha inferior ("Escolha a modalidade" etc.), com X para fechar. */
function OptionsSheet<T>({
  open,
  title,
  options,
  selected,
  label,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  options: T[];
  selected: T | null;
  label: (option: T) => string;
  onPick: (option: T) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  return (
    <BottomSheet open={open} onClose={onClose} titleId={titleId}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[17px] font-bold text-gray-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="flex w-8 h-8 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      </div>
      <ul aria-label={title} className="-mx-2 mt-3 max-h-[60vh] space-y-2 overflow-y-auto px-2 pb-1">
        {options.map((option) => {
          const current = option === selected;
          return (
            <li key={label(option)}>
              <button
                type="button"
                aria-pressed={current}
                onClick={() => onPick(option)}
                className={`w-full rounded-xl px-4 py-3.5 text-left text-[15px] font-semibold active:scale-[0.99] transition-transform ${
                  current
                    ? 'bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {label(option)}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}

/**
 * Simulador "Calcular prêmio": cotação da banca → modalidade → posição → valor. O resultado usa as mesmas
 * regras e a mesma tabela da compra de Loterias (@sysjb/contracts), então bate com o "Possível prêmio" do pule.
 */
export default function PrizeCalculator({ quotes }: { quotes: PublicQuotes }) {
  const modalities = LOTTERY_MODALITIES.filter((m) => lotteryQuoteCents(m, quotes) > 0);
  const [modality, setModality] = useState<LotteryModality | null>(null);
  const [placement, setPlacement] = useState<LotteryPlacement | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [picker, setPicker] = useState<Picker>(null);
  const [showResult, setShowResult] = useState(false);
  const resultTitleId = useId();

  const ready = modality !== null && placement !== null && amountCents > 0;
  const prizeCents = ready ? simulatePrize(modality, placement, amountCents, quotes) : 0;
  const inverted = modality?.kind === 'inverted';

  function pickModality(next: LotteryModality) {
    setModality(next);
    // Combos têm posição fixa; nas outras, a posição anterior continua se ainda valer.
    const allowed = placementsFor(next);
    setPlacement((cur) => (allowed.length === 1 ? allowed[0]! : cur && allowed.includes(cur) ? cur : null));
    setPicker(null);
  }

  return (
    <>
      <SectionBar title="Calcular prêmio" back={{ href: ROUTES.lotteries, label: 'Fechar' }} />
      <main className="px-3 py-3 pb-28 space-y-3">
        <section className={`${cardClass} flex items-center gap-3 px-4 py-4`}>
          <span className="flex w-12 h-12 shrink-0 items-center justify-center rounded-full bg-brand-primary shadow-card">
            <Calculator className="w-6 h-6 text-white" aria-hidden />
          </span>
          <span>
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
              <Calculator className="w-3 h-3 text-brand-primary" aria-hidden />
              Simulador
            </span>
            <span className="block text-[19px] font-bold leading-tight text-gray-900">Quanto você pode ganhar?</span>
          </span>
        </section>

        <StepButton n={1} label="Cotação" value={quotes.tableLabel} onClick={() => setPicker('quote')} />
        <StepButton n={2} label="Modalidade" value={modality?.label ?? null} onClick={() => setPicker('modality')} />
        <StepButton
          n={3}
          label="Posição"
          value={placement?.label ?? null}
          disabled={!modality}
          onClick={() => setPicker('placement')}
        />

        <label className={`${cardClass} flex items-center gap-3 px-4 py-3.5`}>
          <StepBadge n={4} state={amountCents > 0 ? 'done' : 'pending'} />
          <span className="flex-1 min-w-0">
            <span className="block text-[12px] font-bold uppercase tracking-wide text-gray-500">Valor da aposta</span>
            <input
              inputMode="numeric"
              aria-label="Valor da aposta"
              value={`R$ ${formatCents(amountCents)}`}
              onChange={(event) => {
                const cents = parseCurrencyInput(event.target.value, LOTTERY_LIMITS.maxAmountCents);
                if (cents !== null) setAmountCents(cents);
              }}
              className="w-full bg-transparent text-[16px] font-bold text-gray-900 outline-none tabular-nums"
            />
          </span>
        </label>

        <button
          type="button"
          disabled={!ready}
          onClick={() => setShowResult(true)}
          className="h-14 w-full rounded-xl bg-brand-primary text-[17px] font-bold text-white shadow-card active:scale-[0.99] transition-transform disabled:opacity-50 disabled:shadow-none disabled:active:scale-100"
        >
          Calcular prêmio
        </button>
      </main>

      <LotteryToolsNav active="prize" />

      <OptionsSheet
        open={picker === 'quote'}
        title="Escolha a cotação"
        options={[quotes.tableLabel]}
        selected={quotes.tableLabel}
        label={(table) => table}
        onPick={() => setPicker(null)}
        onClose={() => setPicker(null)}
      />
      <OptionsSheet
        open={picker === 'modality'}
        title="Escolha a modalidade"
        options={modalities}
        selected={modality}
        label={(m) => m.label}
        onPick={pickModality}
        onClose={() => setPicker(null)}
      />
      <OptionsSheet
        open={picker === 'placement' && modality !== null}
        title="Escolha a posição"
        options={modality ? placementsFor(modality) : []}
        selected={placement}
        label={(p) => p.label}
        onPick={(p) => {
          setPlacement(p);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />

      <BottomSheet open={showResult && ready} onClose={() => setShowResult(false)} titleId={resultTitleId}>
        <p
          id={resultTitleId}
          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-500"
        >
          <Star className="w-3.5 h-3.5 fill-brand-primary text-brand-primary" aria-hidden />
          Possível prêmio
        </p>
        <p className="mt-1 text-brand-primary">
          <span className="text-[18px] font-bold text-gray-500">R$ </span>
          <span className="text-[30px] font-extrabold tabular-nums">{formatCents(prizeCents)}</span>
        </p>
        {inverted && modality && (
          <p className="mt-1 text-[12px] text-gray-500">
            Invertida: palpite com {modality.digits} dígitos diferentes (
            {distinctPermutations(simulatedGuess(modality))} combinações).
          </p>
        )}
        <dl className="mt-4 divide-y divide-gray-100 rounded-xl bg-gray-50 text-[15px]">
          {[
            ['Cotação', quotes.tableLabel],
            ['Modalidade', modality?.label ?? ''],
            ['Posição', placement?.label ?? ''],
          ].map(([term, detail]) => (
            <div key={term} className="flex items-center justify-between px-4 py-3">
              <dt className="text-gray-500">{term}</dt>
              <dd className="font-semibold text-gray-900">{detail}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3">
            <dt className="text-gray-500">Aposta</dt>
            <dd className="font-semibold text-brand-primary tabular-nums">{formatBrl(amountCents)}</dd>
          </div>
        </dl>
        <Link
          href={ROUTES.lotteries}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-brand-primary text-[17px] font-bold text-white shadow-card"
        >
          Apostar agora
        </Link>
      </BottomSheet>
    </>
  );
}
