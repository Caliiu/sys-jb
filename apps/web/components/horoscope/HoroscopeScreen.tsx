'use client';

import { Copy, Star } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BICHOS } from '@/lib/fazendinha';
import type { PublicHoroscopeReading } from '@sysjb/contracts';
import { SIGN_INFO, ZODIAC_SIGNS, type ZodiacSign, readingFor } from '@/lib/horoscope';
import { ROUTES } from '@/lib/routes';
import LotteryToolsNav from '../lotteries/LotteryToolsNav';
import SectionBar from '../section/SectionBar';
import SignGlyph from './SignGlyph';
import { useToast } from '../ui/Toast';

interface HoroscopeScreenProps {
  /** Hoje em Brasília (YYYY-MM-DD), decidido no servidor: a leitura não depende do relógio do aparelho. */
  date: string;
  /** Signo do jogador (pela data de nascimento, calculado no servidor); null = não foi possível saber. */
  userSign: ZodiacSign | null;
  /** Previsões de hoje da API do provedor (cache da nossa API); vazio = usa a leitura local. */
  official: readonly PublicHoroscopeReading[];
}

const numberClass =
  'flex h-12 items-center justify-center rounded-lg bg-gray-50 text-[17px] font-bold tabular-nums text-brand-primary active:scale-[0.97] transition-transform';

/**
 * Loterias > Horóscopo: leitura do dia do signo escolhido (abre no signo do jogador) e palpites (grupo, dezenas,
 * centenas e milhares) que o jogador toca para copiar. Signos fixos acima da barra de ferramentas.
 */
export default function HoroscopeScreen({ date, userSign, official }: HoroscopeScreenProps) {
  const toast = useToast();
  const [sign, setSign] = useState<ZodiacSign>(userSign ?? 'aries');
  const reading = useMemo(
    () =>
      readingFor(
        sign,
        date,
        official.find((r) => r.sign === sign),
      ),
    [sign, date, official],
  );
  const { group, tens, hundreds, thousands } = reading.tips;
  const info = SIGN_INFO[sign];

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`Copiado: ${text}`);
    } catch {
      toast.show('Não foi possível copiar.');
    }
  }

  const rows: Array<{ title: string; singular: string; numbers: string[] }> = [
    { title: 'Dezenas', singular: 'dezena', numbers: tens },
    { title: 'Centenas', singular: 'centena', numbers: hundreds },
    { title: 'Milhares', singular: 'milhar', numbers: thousands },
  ];

  return (
    <>
      <SectionBar title="Horóscopo do dia" back={{ href: ROUTES.lotteries, label: 'Fechar' }} />
      <main className="px-3 pt-3 pb-52">
        <article aria-labelledby="horoscope-sign" className="rounded-xl bg-white p-4 shadow-card">
          <header className="flex items-center gap-3">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white">
              <SignGlyph sign={sign} className="h-9 w-9" />
            </span>
            <div>
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <Star className="h-3 w-3 fill-brand-primary text-brand-primary" aria-hidden />
                {sign === userSign ? 'Hoje, seu signo' : 'Hoje'}
              </p>
              <h2 id="horoscope-sign" className="text-[24px] font-bold leading-tight text-gray-900">
                {info.name}
              </h2>
            </div>
          </header>

          <p className="mt-4 rounded-xl bg-gray-50 px-4 py-4 text-[15px] leading-relaxed text-gray-700">
            {reading.text}
          </p>

          {reading.colors.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="font-semibold text-gray-600">Cores do dia:</span>
              {reading.colors.map((color) => (
                <span key={color} className="rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-700">
                  {color}
                </span>
              ))}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-gray-600">
              <Star className="h-3.5 w-3.5 fill-brand-primary text-brand-primary" aria-hidden />
              Palpites do dia
            </h3>
            <span className="text-[12px] text-gray-500">Toque para copiar</span>
          </div>

          <div className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">
            <button
              type="button"
              onClick={() => copy(String(group).padStart(2, '0'))}
              aria-label={`Copiar grupo ${group}, ${BICHOS[group - 1]}`}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span>
                <span className="block text-[15px] font-semibold text-gray-900">Grupo</span>
                <span className="block text-[13px] text-gray-500">{BICHOS[group - 1]}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-[28px] font-bold tabular-nums text-brand-primary">
                  {String(group).padStart(2, '0')}
                </span>
                <Copy className="h-4 w-4 text-gray-500" aria-hidden />
              </span>
            </button>

            {rows.map((row) => (
              <section key={row.title} aria-label={row.title} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[15px] font-semibold text-gray-900">{row.title}</h4>
                  <button
                    type="button"
                    onClick={() => copy(row.numbers.join(' '))}
                    aria-label={`Copiar todas as ${row.title.toLowerCase()}`}
                    className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[12px] font-medium text-gray-600"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    Copiar todas
                  </button>
                </div>
                <ul
                  className="mt-2 grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${Math.min(row.numbers.length, 5)}, minmax(0, 1fr))` }}
                >
                  {row.numbers.map((number) => (
                    <li key={number}>
                      <button
                        type="button"
                        onClick={() => copy(number)}
                        aria-label={`Copiar ${row.singular} ${number}`}
                        className={`${numberClass} w-full`}
                      >
                        {number}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <Link
            href={ROUTES.lotteries}
            className="mt-5 flex items-center justify-center rounded-xl bg-brand-primary py-3.5 text-[16px] font-bold text-white shadow-card"
          >
            Apostar agora
          </Link>
        </article>
      </main>

      <LotteryToolsNav active="horoscope" above={<SignPicker selected={sign} onSelect={setSign} />} />
    </>
  );
}

/** Signos em faixa rolável; o escolhido fica visível (ao abrir, o do jogador pode estar no fim da lista). */
function SignPicker({ selected, onSelect }: { selected: ZodiacSign; onSelect: (sign: ZodiacSign) => void }) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [selected]);

  return (
    <div
      role="group"
      aria-label="Signos"
      className="flex gap-2 overflow-x-auto border-t border-gray-100 bg-white px-3 py-2.5 [scrollbar-width:none]"
    >
      {ZODIAC_SIGNS.map((sign) => {
        const checked = sign === selected;
        return (
          <button
            key={sign}
            ref={checked ? selectedRef : undefined}
            type="button"
            aria-pressed={checked}
            onClick={() => onSelect(sign)}
            className={`flex h-[68px] w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-semibold transition-colors ${
              checked ? 'bg-brand-primary text-white shadow-card' : 'bg-gray-100 text-gray-700'
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full ${checked ? 'bg-white text-brand-primary' : 'bg-brand-primary text-white'}`}
            >
              <SignGlyph sign={sign} className="h-5 w-5" />
            </span>
            {SIGN_INFO[sign].name}
          </button>
        );
      })}
    </div>
  );
}
