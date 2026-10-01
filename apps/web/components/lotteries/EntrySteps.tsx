'use client';

import { type LotteryModality, type LotterySplit, formatGuess, randomLotteryGuess } from '@sysjb/contracts';
import { ClipboardPaste, Dices } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatBrl, formatCents, parseCurrencyInput } from '@/lib/currency';
import { useToast } from '../ui/Toast';
import GuessInput, { mergeGuesses, parseGuesses, pasteMismatchMessage } from './GuessInput';

const primaryButton =
  'w-full h-14 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primaryLight text-white text-[17px] font-bold active:scale-[0.99] transition-transform disabled:opacity-40';

/** Botão fixo no rodapé ("Avançar"). */
export function FooterButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px] bg-gradient-to-t from-[#F4F6F6] via-[#F4F6F6] px-3 pt-4 pb-3">
      <button type="button" onClick={onClick} disabled={disabled} className={primaryButton}>
        {label}
      </button>
    </div>
  );
}

/** Chips de palpites; tocar remove. */
export function GuessChips({
  modality,
  guesses,
  onRemove,
}: {
  modality: LotteryModality;
  guesses: string[];
  onRemove: (guess: string) => void;
}) {
  return (
    <ul aria-label="Meus palpites" className="flex flex-wrap gap-2">
      {guesses.map((guess) => (
        <li key={guess}>
          <button
            type="button"
            onClick={() => onRemove(guess)}
            aria-label={`Remover palpite ${formatGuess(modality, guess)}`}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-[14px] font-bold text-gray-900 tabular-nums active:scale-95 transition-transform"
          >
            {formatGuess(modality, guess)}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Etapa 5: palpites. */
export function GuessesStep({
  modality,
  guesses,
  onChange,
  onNext,
  summary,
}: {
  modality: LotteryModality;
  guesses: string[];
  onChange: (guesses: string[]) => void;
  onNext: () => void;
  summary: ReactNode;
}) {
  const toast = useToast();

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      const found = parseGuesses(modality, text);
      if (found.length === 0) return toast.show(pasteMismatchMessage(modality, text));
      onChange(mergeGuesses(guesses, found));
    } catch {
      toast.show('Não foi possível ler a área de transferência.');
    }
  }

  return (
    <>
      <main className="px-3 py-3 pb-28 space-y-3">
        {summary}
        <GuessInput modality={modality} guesses={guesses} onChange={onChange} inputClassName="h-14 shadow-card" />
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[15px] font-semibold text-gray-900">Meus palpites</h2>
          <button
            type="button"
            onClick={() => onChange(mergeGuesses(guesses, [randomLotteryGuess(modality)]))}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-brand-primary bg-white px-3 text-[13px] font-semibold text-brand-primary"
          >
            <Dices className="w-4 h-4" aria-hidden />
            Surpresinha
          </button>
          <button
            type="button"
            onClick={paste}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-[13px] font-semibold text-gray-700"
          >
            <ClipboardPaste className="w-4 h-4" aria-hidden />
            Colar
          </button>
        </div>
        {guesses.length === 0 ? (
          <p className="text-[13px] text-gray-500">Seus palpites aparecerão aqui.</p>
        ) : (
          <GuessChips
            modality={modality}
            guesses={guesses}
            onRemove={(g) => onChange(guesses.filter((x) => x !== g))}
          />
        )}
      </main>
      <FooterButton label="Avançar" onClick={onNext} disabled={guesses.length === 0} />
    </>
  );
}

const QUICK_AMOUNTS = [500, 2000, 5000, 10000];

/** Etapa 6: valor ("Todos" = dividido entre os palpites; "Cada" = por palpite). */
export function AmountStep({
  amountCents,
  split,
  guesses,
  onAmount,
  onSplit,
  onNext,
  summary,
  maxCents,
}: {
  amountCents: number;
  split: LotterySplit;
  guesses: number;
  onAmount: (cents: number) => void;
  onSplit: (split: LotterySplit) => void;
  onNext: () => void;
  summary: ReactNode;
  maxCents: number;
}) {
  // "Todos": cada palpite precisa de pelo menos 1 centavo (a API confere o mesmo).
  const tooSmall = split === 'total' && amountCents > 0 && amountCents < guesses;
  return (
    <>
      <main className="px-3 py-3 pb-28 space-y-3">
        {summary}
        <input
          inputMode="numeric"
          aria-label="Valor da aposta"
          value={amountCents === 0 ? '' : `R$ ${formatCents(amountCents)}`}
          placeholder="R$ 0,00"
          onChange={(event) => {
            const cents = parseCurrencyInput(event.target.value, maxCents);
            if (cents !== null) onAmount(cents);
          }}
          className="h-20 w-full rounded-xl bg-white text-center text-[34px] font-bold tabular-nums text-gray-900 shadow-card outline-none placeholder:text-gray-300"
        />
        <div className="grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => onAmount(Math.min(maxCents, amountCents + cents))}
              className={`relative h-11 rounded-lg border bg-white text-[14px] font-bold text-brand-primary ${
                cents === 2000 ? 'border-brand-primary' : 'border-gray-200'
              }`}
            >
              {cents === 2000 && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-brand-primary px-1.5 text-[9px] font-bold text-white">
                  POPULAR
                </span>
              )}
              +{cents / 100}
            </button>
          ))}
        </div>
        <div
          role="radiogroup"
          aria-label="Como dividir o valor"
          className="grid grid-cols-2 gap-1 rounded-xl border border-gray-200 bg-white p-1"
        >
          {(
            [
              ['total', 'Todos'],
              ['each', 'Cada'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={split === id}
              onClick={() => onSplit(id)}
              className={`h-10 rounded-lg text-[14px] font-semibold ${
                split === id ? 'bg-gradient-to-r from-brand-primary to-brand-primaryLight text-white' : 'text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-gray-500">
          {split === 'total'
            ? `O valor é dividido entre os ${guesses} palpite${guesses === 1 ? '' : 's'}.`
            : `O valor vale para cada palpite: total de ${formatBrl(amountCents * guesses)}.`}
        </p>
        {tooSmall && <p className="text-[13px] text-brand-primary">Valor menor que a quantidade de palpites.</p>}
      </main>
      <FooterButton label="Avançar" onClick={onNext} disabled={amountCents === 0 || tooSmall} />
    </>
  );
}
