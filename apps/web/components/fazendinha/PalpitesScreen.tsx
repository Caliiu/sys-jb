'use client';

import type { PlaceFazendinhaBetResponse } from '@sysjb/contracts';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { placeFazendinhaBetAction } from '@/app/fazendinha-actions';
import { formatBrl } from '@/lib/currency';
import {
  BICHOS,
  type FazendinhaTicket,
  bichoImage,
  groupOf,
  lotteryLabel,
  palpiteLabel,
  palpiteValues,
} from '@/lib/fazendinha';
import ConfirmPurchaseDialog from './ConfirmPurchaseDialog';
import ErrorDialog from './ErrorDialog';
import { MODE_STYLE } from './mode-style';
import { randomUuid } from '@/lib/uuid';

const HUNDREDS = Array.from({ length: 10 }, (_, i) => i);

interface PalpitesScreenProps {
  ticket: FazendinhaTicket;
  /** Números desta cartela já vendidos (a ninguém mais podem ser vendidos). */
  sold: number[];
  onPurchased: (result: PlaceFazendinhaBetResponse) => void;
  /** Outra pessoa comprou estes números primeiro: a tela os marca como indisponíveis. */
  onSoldOut: (numbers: number[]) => void;
  /** A extração fechou enquanto o jogador escolhia. */
  onDrawClosed: () => void;
}

/**
 * Escolha dos palpites de uma aposta da Fazendinha: cada palpite custa o valor da aposta. O saldo não é
 * conferido aqui: quem decide é a API na compra, e a recusa (ex.: saldo indisponível) aparece no aviso de erro.
 */
export default function PalpitesScreen({ ticket, sold, onPurchased, onSoldOut, onDrawClosed }: PalpitesScreenProps) {
  const router = useRouter();
  const { mode, lottery, stakeCents, drawDate } = ticket;
  const [selected, setSelected] = useState<number[]>([]);
  const [hundred, setHundred] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  // Erro da compra; afterClose roda ao fechar o aviso (ex.: extração encerrada volta à lista).
  const [error, setError] = useState<{ message: string; afterClose?: () => void } | null>(null);
  // Uma chave por seleção: reenviar a mesma seleção (ex.: após falha de rede) nunca cobra duas vezes.
  const idempotencyKey = useRef<string | null>(null);
  const values = palpiteValues(mode.id, hundred);
  const total = selected.length * stakeCents;

  const describe = (value: number) => `${palpiteLabel(mode.id, value)} ${BICHOS[groupOf(mode.id, value) - 1]}`;

  function toggle(value: number) {
    idempotencyKey.current = null;
    setSelected((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));
  }

  async function confirmPurchase() {
    idempotencyKey.current ??= randomUuid();
    setPending(true);
    try {
      const result = await placeFazendinhaBetAction({
        idempotencyKey: idempotencyKey.current,
        drawDate,
        lottery: lottery.name,
        hour: lottery.hour,
        mode: mode.id,
        stakeCents,
        prizeCents: ticket.prizeCents,
        numbers: selected,
      });
      if (result.ok) {
        onPurchased(result.data);
        return;
      }
      setConfirming(false);
      if (result.code === 'SESSION_INVALID') {
        router.replace('/login');
        return;
      }
      // Extração encerrada ou cotação alterada: ao fechar o aviso, volta à lista (recarregada, com os prêmios atuais).
      const backToList =
        result.code === 'DRAW_CLOSED' || result.code === 'QUOTE_CHANGED'
          ? () => {
              if (result.code === 'QUOTE_CHANGED') router.refresh();
              onDrawClosed();
            }
          : undefined;
      setError({ message: result.message, afterClose: backToList });
      if (result.code === 'NUMBERS_UNAVAILABLE' && result.unavailable?.length) {
        const taken = result.unavailable;
        idempotencyKey.current = null;
        setSelected((cur) => cur.filter((v) => !taken.includes(v)));
        onSoldOut(taken);
      }
    } catch {
      setConfirming(false);
      setError({ message: 'Não foi possível concluir a compra. Tente novamente.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section aria-label="Aposta" className="bg-white px-3 py-4 border-b border-gray-200">
        <p className="text-[16px] text-gray-800">
          {formatBrl(stakeCents)} <span className="px-1">pra</span> {formatBrl(ticket.prizeCents)}
        </p>
        <div className="flex items-center gap-2 mt-3">
          <span className="flex-1 text-[16px] text-gray-900">{ticket.dayLabel}</span>
          <span className="rounded bg-gray-100 px-2 py-1 text-[13px] text-gray-500 uppercase">
            {lotteryLabel(lottery)}
          </span>
          <span
            className={`rounded border border-dashed px-2 py-0.5 text-[13px] font-medium ${MODE_STYLE[mode.id].badge}`}
          >
            {mode.label}
          </span>
        </div>
      </section>

      <main className="bg-white px-3 pt-4 pb-4">
        {mode.id === 'centena' && (
          <div role="group" aria-label="Faixa de centenas" className="flex gap-1.5 overflow-x-auto pb-3 -mx-3 px-3">
            {HUNDREDS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHundred(h)}
                aria-pressed={h === hundred}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-[13px] font-medium tabular-nums ${
                  h === hundred
                    ? 'border-brand-primary bg-brand-primary text-white'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                {h}00–{h}99
              </button>
            ))}
          </div>
        )}

        <ul aria-label="Palpites disponíveis" className="grid grid-cols-5 gap-2">
          {values.map((value) => {
            const isSelected = selected.includes(value);
            const isSold = sold.includes(value);
            return (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => toggle(value)}
                  disabled={isSold}
                  aria-pressed={isSelected}
                  aria-label={isSold ? `${describe(value)} (indisponível)` : describe(value)}
                  className={`relative block w-full aspect-square rounded-lg border active:scale-95 transition disabled:active:scale-100 ${
                    isSold
                      ? 'border-gray-300 bg-gray-300 opacity-60 grayscale'
                      : isSelected
                        ? 'border-brand-primary bg-brand-primary'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  <Image
                    src={bichoImage(groupOf(mode.id, value))}
                    alt=""
                    width={80}
                    height={80}
                    className="absolute left-[10%] top-[8%] w-[80%] h-[80%] object-contain"
                  />
                  <span
                    className={`absolute right-1 bottom-1 min-w-6 h-6 rounded-full px-1 flex items-center justify-center text-[11px] font-bold tabular-nums ${
                      isSelected ? 'bg-white text-brand-primary' : 'bg-brand-primary text-white'
                    }`}
                  >
                    {palpiteLabel(mode.id, value)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>

      <section
        aria-label="Resumo"
        className="sticky bottom-0 z-20 bg-white border-t border-gray-200 px-3 pt-3 pb-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
      >
        <ul aria-label="Legenda" className="flex items-center justify-between text-[13px] text-gray-400">
          <li className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded border border-gray-300 bg-white" aria-hidden />
            Disponível
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-brand-primary" aria-hidden />
            Selecionado
          </li>
          <li className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded bg-gray-300" aria-hidden />
            Indisponível
          </li>
        </ul>

        <h2 className="text-[14px] text-gray-600 mt-4">Seus palpites</h2>
        {selected.length > 0 && (
          <ul aria-label="Seus palpites" className="flex flex-wrap gap-2 mt-2 max-h-24 overflow-y-auto">
            {selected.map((value) => (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => toggle(value)}
                  aria-label={`Remover ${describe(value)}`}
                  className="min-w-10 h-10 rounded-md border border-brand-primary px-2 text-[15px] text-gray-800 tabular-nums active:scale-95 transition-transform"
                >
                  {palpiteLabel(mode.id, value)}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between mt-4">
          <span className="text-[14px] text-gray-600">Total</span>
          <span className="text-[18px] font-bold text-gray-900 tabular-nums" aria-live="polite">
            {formatBrl(total)}
          </span>
        </div>

        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => setConfirming(true)}
          className="w-full h-12 mt-4 rounded-lg bg-brand-orange text-white text-[16px] font-bold active:scale-[0.99] transition-transform disabled:opacity-50"
        >
          Finalizar
        </button>
      </section>

      <ConfirmPurchaseDialog
        open={confirming}
        count={selected.length}
        pending={pending}
        onConfirm={confirmPurchase}
        onCancel={() => !pending && setConfirming(false)}
      />

      <ErrorDialog
        message={error?.message ?? null}
        onClose={() => {
          error?.afterClose?.();
          setError(null);
        }}
      />
    </>
  );
}
