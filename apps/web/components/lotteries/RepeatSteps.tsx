'use client';

import { LOTTERY_GAME_TYPES, MAX_PULE_NUMBER, type PublicDraw } from '@sysjb/contracts';
import { CalendarDays, ChevronRight, ClipboardPaste, Repeat2, Ticket, X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import type { LotteryDay } from '@/lib/lotteries';

const cardClass = 'rounded-xl bg-white shadow-card';

/** Código da pule: só dígitos, até 10 (o maior número aceito tem 10). */
export const PULE_CODE_MAX_LENGTH = String(MAX_PULE_NUMBER).length;

/** Número da pule digitado, ou null se ainda não é um número aceito. */
export function parsePuleCode(code: string): number | null {
  if (!/^\d+$/.test(code) || code.length > PULE_CODE_MAX_LENGTH) return null;
  const n = Number(code);
  return n >= 1 && n <= MAX_PULE_NUMBER ? n : null;
}

/** Só os dígitos de um texto colado ou digitado, no tamanho máximo do código. */
export const onlyPuleDigits = (text: string) => text.replace(/\D/g, '').slice(0, PULE_CODE_MAX_LENGTH);

function ListCard({
  icon,
  title,
  subtitle,
  onClick,
  label,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  label?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`${cardClass} flex w-full items-center gap-3 px-3 py-3.5 text-left transition-transform active:scale-[0.99]`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-gray-900">{title}</span>
          <span className="block text-[13px] text-gray-500">{subtitle}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
      </button>
    </li>
  );
}

/** Modalidade da pule a repetir (só o Tradicional por enquanto; as outras avisam "em breve"). */
export function RepeatModalityStep({
  onPick,
  onComingSoon,
}: {
  onPick: () => void;
  onComingSoon: (label: string) => void;
}) {
  return (
    <main className="px-3 py-3 pb-28">
      <p className="px-1 pb-2 text-[13px] text-gray-400">Escolha a modalidade da pule que deseja repetir</p>
      <ul aria-label="Modalidades" className="space-y-3">
        {LOTTERY_GAME_TYPES.map((type) => (
          <ListCard
            key={type.id}
            icon={<Repeat2 className="h-5 w-5 text-brand-primary" aria-hidden />}
            title={type.label.toUpperCase()}
            subtitle="Repetir pule"
            onClick={() => (type.available ? onPick() : onComingSoon(type.label))}
          />
        ))}
      </ul>
    </main>
  );
}

/** Data da nova aposta: hoje e os próximos dias, em lista. */
export function RepeatDateStep({
  days,
  onPick,
  footer,
}: {
  days: LotteryDay[];
  onPick: (day: LotteryDay) => void;
  footer: ReactNode;
}) {
  return (
    <>
      <main className="px-3 py-3 pb-28">
        <ul aria-label="Datas" className="space-y-3">
          {days.map((day) => (
            <ListCard
              key={day.date}
              icon={<CalendarDays className="h-5 w-5 text-brand-primary" aria-hidden />}
              title={day.label}
              subtitle={day.weekday}
              label={`${day.weekday}, ${day.label}`}
              onClick={() => onPick(day)}
            />
          ))}
        </ul>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-[480px] px-3 pb-3">{footer}</div>
    </>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <li className="rounded-full bg-gray-100 px-3 py-1 text-[13px] font-bold text-gray-800">{children}</li>;
}

/** Resumo do que foi escolhido (tipo, loterias e data) e o código da pule a repetir. */
export function RepeatCodeStep({
  gameLabel,
  draws,
  day,
  code,
  onCode,
  onPaste,
  onSubmit,
  footer,
}: {
  gameLabel: string;
  draws: PublicDraw[];
  day: LotteryDay;
  code: string;
  onCode: (code: string) => void;
  onPaste: () => void;
  /** Enter no campo (teclado "Ir" do celular). */
  onSubmit: () => void;
  footer: ReactNode;
}) {
  const inputId = useId();
  const hintId = useId();
  return (
    <>
      <main className="space-y-4 px-3 py-3 pb-28">
        <section aria-label="Resumo da pule" className={`${cardClass} p-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Resumo da pule</h2>
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-bold uppercase text-brand-primary">
              {gameLabel}
            </span>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-gray-500">
            <Ticket className="h-3.5 w-3.5" aria-hidden />
            Loterias · {draws.length}
          </p>
          <ul aria-label="Loterias escolhidas" className="mt-2 flex flex-wrap gap-2">
            {draws.map((draw) => (
              <Chip key={`${draw.name}-${draw.hour}`}>{draw.name}</Chip>
            ))}
          </ul>
          <hr className="my-4 border-gray-100" />
          <p className="flex items-center gap-1.5 text-[13px] text-gray-500">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Data · 1
          </p>
          <ul aria-label="Data escolhida" className="mt-2 flex flex-wrap gap-2">
            <Chip>
              {day.weekday} {day.label}
            </Chip>
          </ul>
        </section>

        <section className={`${cardClass} p-4`}>
          <label htmlFor={inputId} className="block text-[15px] font-bold text-gray-900">
            Código da pule
          </label>
          <p id={hintId} className="mt-0.5 text-[13px] text-gray-400">
            Digite o código da pule que deseja repetir para refazer essa mesma aposta.
          </p>
          <div className="mt-3 flex h-14 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 focus-within:border-brand-primary">
            <input
              id={inputId}
              value={code}
              onChange={(e) => onCode(onlyPuleDigits(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit();
              }}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="go"
              maxLength={PULE_CODE_MAX_LENGTH}
              placeholder="Ex.: 123456"
              aria-describedby={hintId}
              className="min-w-0 flex-1 bg-transparent text-[18px] text-gray-900 tabular-nums outline-none placeholder:text-gray-300"
            />
            {code ? (
              <button
                type="button"
                onClick={() => onCode('')}
                aria-label="Limpar código"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-gray-500"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={onPaste}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-[14px] font-semibold text-brand-primary"
              >
                <ClipboardPaste className="h-4 w-4" aria-hidden />
                Colar
              </button>
            )}
          </div>
        </section>
      </main>
      {footer}
    </>
  );
}
