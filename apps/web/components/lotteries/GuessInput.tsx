'use client';

import { LOTTERY_LIMITS, type LotteryModality, formatGuess, guessLength, isValidLotteryGuess } from '@sysjb/contracts';
import { useId, useState } from 'react';

/** Palpites de um texto colado: números do tamanho certo; nos combos, pedaços de 2 dígitos agrupados. */
export function parseGuesses(modality: LotteryModality, text: string): string[] {
  const length = guessLength(modality);
  const tokens = text.split(/\D+/).filter(Boolean);
  const guesses: string[] = [];
  let pending: string[] = [];
  for (const token of tokens) {
    if (token.length === length) guesses.push(token);
    else if (modality.parts > 1 && token.length === modality.digits) {
      pending.push(token);
      if (pending.length === modality.parts) {
        guesses.push(pending.join(''));
        pending = [];
      }
    }
  }
  return guesses.filter((g) => isValidLotteryGuess(modality, g));
}

const KIND_BY_LENGTH: Record<number, string> = { 2: 'dezenas', 3: 'centenas', 4: 'milhares' };

/**
 * Aviso de um texto colado sem palpites válidos. Se todos os números têm o mesmo tamanho e não é o da modalidade
 * (ex.: milhares do Horóscopo colados na Centena), diz o que foi colado e o que a modalidade pede.
 */
export function pasteMismatchMessage(modality: LotteryModality, text: string): string {
  const lengths = new Set(
    text
      .split(/\D+/)
      .filter(Boolean)
      .map((token) => token.length),
  );
  const [only] = lengths;
  const kind = lengths.size === 1 && only !== undefined ? KIND_BY_LENGTH[only] : undefined;
  if (modality.parts === 1 && kind && only !== guessLength(modality)) {
    return `Os números copiados são ${kind} (${only} dígitos); ${modality.label} pede ${guessLength(modality)}.`;
  }
  return 'Nenhum palpite válido no texto copiado.';
}

/** Junta palpites novos aos atuais, sem repetir e respeitando o limite. */
export function mergeGuesses(current: string[], incoming: string[]): string[] {
  const merged = [...current];
  for (const guess of incoming) {
    if (merged.length >= LOTTERY_LIMITS.maxGuessesPerItem) break;
    if (!merged.includes(guess)) merged.push(guess);
  }
  return merged;
}

interface GuessInputProps {
  modality: LotteryModality;
  guesses: string[];
  onChange: (guesses: string[]) => void;
  /** Rótulo do campo (acessível); o placeholder é sempre "Digite seu palpite". */
  label?: string;
  inputClassName?: string;
}

/** Campo que adiciona o palpite sozinho quando ele fica completo (e válido). */
export default function GuessInput({
  modality,
  guesses,
  onChange,
  label = 'Digite seu palpite',
  inputClassName = '',
}: GuessInputProps) {
  const hintId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const length = guessLength(modality);
  const full = guesses.length >= LOTTERY_LIMITS.maxGuessesPerItem;

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, length);
    setError(null);
    if (digits.length < length) return setValue(digits);
    if (!isValidLotteryGuess(modality, digits)) {
      setValue(digits);
      return setError(modality.groups ? 'Palpite inválido: grupos de 01 a 25, sem repetir.' : 'Palpite inválido.');
    }
    if (guesses.includes(digits)) {
      setValue('');
      return setError(`Você já tem o palpite ${formatGuess(modality, digits)}.`);
    }
    onChange([...guesses, digits]);
    setValue('');
  }

  return (
    <div>
      <input
        inputMode="numeric"
        autoComplete="off"
        value={value}
        disabled={full}
        onChange={(event) => handle(event.target.value)}
        placeholder="Digite seu palpite"
        aria-label={label}
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-xl bg-white px-4 text-[18px] tracking-widest tabular-nums outline-none placeholder:tracking-normal placeholder:text-gray-300 focus:ring-2 focus:ring-brand-primary/40 ${inputClassName}`}
      />
      <p id={hintId} className={`mt-2 text-[13px] ${error ? 'text-brand-primary' : 'text-gray-500'}`}>
        {error ??
          (full
            ? `Limite de ${LOTTERY_LIMITS.maxGuessesPerItem} palpites.`
            : modality.parts > 1
              ? `Digite os ${modality.parts} ${modality.groups ? 'grupos' : 'números'} do palpite (${length} dígitos)`
              : 'Digite os números do seu palpite')}
      </p>
    </div>
  );
}
