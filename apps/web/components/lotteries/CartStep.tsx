'use client';

import { LOTTERY_LIMITS, formatGuess } from '@sysjb/contracts';
import { CalendarDays, Info, Pencil, Plus, Ticket, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { formatBrl, formatCents, parseCurrencyInput } from '@/lib/currency';
import { type CartItem, itemTotal } from '@/lib/lotteries';
import BottomSheet from '../ui/BottomSheet';
import GuessInput from './GuessInput';

interface CartStepProps {
  items: CartItem[];
  /** Quantidade de loterias escolhidas (o total é por loteria). */
  draws: number;
  /** "Terça 29/09/2026". */
  dayLabel: string;
  total: number;
  onUpdate: (index: number, item: CartItem) => void;
  onRemove: (index: number) => void;
  onMore: () => void;
  onNext: () => void;
}

const splitLabel = (item: CartItem) => (item.split === 'total' ? 'TODOS' : 'CADA');

/** Etapa 8: carrinho — revisar, editar ou remover apostas, adicionar mais. */
export default function CartStep({ items, draws, dayLabel, total, onUpdate, onRemove, onMore, onNext }: CartStepProps) {
  const [editing, setEditing] = useState<number | null>(null);
  const canAddMore = items.length < LOTTERY_LIMITS.maxItems;

  return (
    <>
      <main className="px-3 py-3 pb-44 space-y-3">
        <section aria-label="Total da aposta" className="rounded-xl bg-white p-4 text-center shadow-card">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Total da aposta</p>
          <p className="mt-1 text-[30px] font-extrabold text-gray-900 tabular-nums">{formatBrl(total)}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 text-[13px] font-semibold text-gray-600">
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
              <Ticket className="w-3.5 h-3.5" aria-hidden />
              Vale
            </span>
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1">
              <CalendarDays className="w-3.5 h-3.5" aria-hidden />
              {dayLabel}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1">
              {draws} loteria{draws === 1 ? '' : 's'}
            </span>
          </div>
        </section>

        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900">Suas Apostas</h2>
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-semibold text-brand-primary">
            {items.length} aposta{items.length === 1 ? '' : 's'}
          </span>
        </div>

        <ul aria-label="Suas apostas" className="space-y-3">
          {items.map((item, index) => (
            <li
              key={`${item.modality.id}-${item.placement.id}-${index}`}
              className="rounded-xl border-l-4 border-brand-primary bg-white p-4 shadow-card"
            >
              <div className="flex items-start gap-2">
                <h3 className="flex-1 text-[15px] font-bold text-gray-900">
                  {item.modality.label} · {item.placement.label}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditing(index)}
                  aria-label={`Editar aposta ${index + 1}`}
                  className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"
                >
                  <Pencil className="w-4 h-4 text-gray-600" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={`Remover aposta ${index + 1}`}
                  className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4 text-brand-primary" aria-hidden />
                </button>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {item.guesses.map((guess) => (
                  <li key={guess} className="rounded-lg bg-gray-100 px-3 py-1 text-[14px] font-bold tabular-nums">
                    {formatGuess(item.modality, guess)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[16px] font-bold text-gray-900 tabular-nums">
                {formatBrl(item.amountCents)}{' '}
                <span className="text-[12px] font-medium text-gray-400">/ {splitLabel(item)}</span>
              </p>
            </li>
          ))}
        </ul>

        {canAddMore && (
          <button
            type="button"
            onClick={onMore}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 text-[15px] font-semibold text-gray-500"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Mais apostas
          </button>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px] space-y-2 bg-gradient-to-t from-[#F4F6F6] via-[#F4F6F6] px-3 pt-4 pb-3">
        {canAddMore && (
          <button
            type="button"
            onClick={onMore}
            className="h-12 w-full rounded-xl border border-brand-primary bg-white text-[15px] font-semibold text-brand-primary"
          >
            Mais apostas
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={items.length === 0}
          className="h-14 w-full rounded-xl bg-gradient-to-r from-brand-primary to-brand-primaryLight text-[17px] font-bold text-white disabled:opacity-40"
        >
          Avançar
        </button>
      </div>

      {editing !== null && items[editing] && (
        <EditItemSheet
          item={items[editing]}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            onUpdate(editing, next);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

/** "Editar aposta": palpites (tocar remove) e valor. */
function EditItemSheet({
  item,
  onClose,
  onSave,
}: {
  item: CartItem;
  onClose: () => void;
  onSave: (item: CartItem) => void;
}) {
  const titleId = useId();
  const amountId = useId();
  const [guesses, setGuesses] = useState(item.guesses);
  const [amount, setAmount] = useState(item.amountCents);
  const invalid = guesses.length === 0 || amount === 0 || (item.split === 'total' && amount < guesses.length);

  return (
    <BottomSheet open onClose={onClose} titleId={titleId}>
      <p className="text-[12px] font-bold uppercase text-brand-primary">Editar aposta</p>
      <h2 id={titleId} className="text-[17px] font-bold text-gray-900">
        {item.modality.label} · {item.placement.label}
      </h2>
      <p className="mt-4 text-[13px] font-semibold text-gray-600">Palpites</p>
      <div className="mt-1">
        <GuessInput modality={item.modality} guesses={guesses} onChange={setGuesses} inputClassName="h-12 bg-gray-50" />
      </div>
      <ul aria-label="Palpites da aposta" className="mt-1 flex flex-wrap gap-2">
        {guesses.map((guess) => (
          <li key={guess}>
            <button
              type="button"
              onClick={() => setGuesses(guesses.filter((g) => g !== guess))}
              aria-label={`Remover palpite ${formatGuess(item.modality, guess)}`}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-[14px] font-bold tabular-nums"
            >
              {formatGuess(item.modality, guess)}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-center gap-1 text-[12px] text-gray-500">
        <Info className="w-3.5 h-3.5" aria-hidden />
        Clique sobre um palpite para removê-lo.
      </p>
      <label htmlFor={amountId} className="mt-4 block text-[13px] font-semibold text-gray-600">
        Valor
      </label>
      <input
        id={amountId}
        inputMode="numeric"
        value={amount === 0 ? '' : `R$ ${formatCents(amount)}`}
        placeholder="R$ 0,00"
        onChange={(event) => {
          const cents = parseCurrencyInput(event.target.value, LOTTERY_LIMITS.maxAmountCents);
          if (cents !== null) setAmount(cents);
        }}
        className="mt-1 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[16px] tabular-nums outline-none"
      />
      <p className="mt-1 text-[12px] text-gray-500">
        {item.split === 'total' ? 'Distribuído entre os palpites (total)' : 'Valor de cada palpite'}
        {' · '}total {formatBrl(itemTotal({ ...item, guesses, amountCents: amount }))}
      </p>
      <button
        type="button"
        disabled={invalid}
        onClick={() => onSave({ ...item, guesses, amountCents: amount })}
        className="mt-5 h-14 w-full rounded-xl bg-gradient-to-r from-brand-primary to-brand-primaryLight text-[17px] font-bold text-white disabled:opacity-40"
      >
        Concluir
      </button>
    </BottomSheet>
  );
}
