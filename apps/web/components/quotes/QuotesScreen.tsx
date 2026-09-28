'use client';

import { FAZENDINHA_MODE_CODES, FAZENDINHA_MODES, type PublicQuotes } from '@sysjb/contracts';
import { ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatBrl } from '@/lib/currency';
import { ROUTES } from '@/lib/routes';
import SectionBar from '../section/SectionBar';
import TenantLogo from '../tenant/TenantLogo';
import { useToast } from '../ui/Toast';

type Game = 'tradicional' | 'fazendinha';

/** Jogos da lista (os que ainda não existem no sistema avisam "em breve"). */
const GAMES: Array<{ label: string; game?: Game }> = [
  { label: 'TRADICIONAL', game: 'tradicional' },
  { label: 'TRADICIONAL 1/10' },
  { label: 'LOT. URUGUAIA' },
  { label: 'QUININHA' },
  { label: 'SENINHA' },
  { label: 'SUPER15' },
  { label: 'FAZENDINHA', game: 'fazendinha' },
];

// Data e hora da consulta no fuso de Brasília: "28/09/2026 12:13:33".
const NOW_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface QuotesScreenProps {
  quotes: PublicQuotes;
  /** Vendedor = o próprio jogador (displayId). */
  sellerId: number;
  nowIso: string;
}

/** Linhas da tabela de um jogo: rótulo e prêmio para o valor indicado. Prêmio 0 = não oferecido. */
function rowsFor(quotes: PublicQuotes, game: Game): Array<{ label: string; prizeCents: number }> {
  if (game === 'tradicional') return quotes.traditional.map((q) => ({ label: q.label, prizeCents: q.prizeCents }));
  return FAZENDINHA_MODES.flatMap((mode) =>
    quotes.fazendinha
      .filter((q) => q.mode === mode.id)
      .sort((a, b) => a.stakeCents - b.stakeCents)
      .map((q) => ({
        label: `FAZENDINHA ${FAZENDINHA_MODE_CODES[q.mode]}-${q.stakeCents / 100}`,
        prizeCents: q.prizeCents,
      })),
  );
}

/** Relatórios > Cotações: lista de jogos e a tabela de prêmios da banca de cada um. */
export default function QuotesScreen({ quotes, sellerId, nowIso }: QuotesScreenProps) {
  const toast = useToast();
  const [game, setGame] = useState<Game | null>(null);

  if (!game) {
    return (
      <>
        <SectionBar title="Cotações" back={{ href: ROUTES.reports, label: 'Voltar para relatórios' }} />
        <main>
          <ul aria-label="Jogos" className="px-3 py-2 space-y-2">
            {GAMES.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    if (!item.game) return toast.comingSoon(item.label);
                    setGame(item.game);
                    window.scrollTo(0, 0);
                  }}
                  className="w-full flex items-center justify-between rounded-lg bg-white px-4 py-4 text-left shadow-card active:scale-[0.99] transition-transform"
                >
                  <span className="text-[15px] text-gray-900">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-gray-300" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </main>
      </>
    );
  }

  const rows = rowsFor(quotes, game);
  const consultedAt = NOW_FORMAT.format(new Date(nowIso)).replace(', ', ' ');
  const shareText = [
    `TABELA DE COTAÇÃO ${quotes.tableLabel}`,
    'VALOR PRA CADA R$ 1,00',
    ...rows.map((r) => `${r.label}: ${formatBrl(r.prizeCents)}`),
  ].join('\n');

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Tabela de cotação', text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      toast.show('Tabela copiada.');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) toast.show('Não foi possível compartilhar.');
    }
  }

  return (
    <>
      <SectionBar title="Relatórios" back={{ onClick: () => setGame(null), label: 'Voltar para cotações' }} />
      <main className="bg-white text-[15px] tracking-wide text-gray-900 uppercase">
        <div className="flex items-center justify-between gap-3 bg-brand-primary px-3 py-2 text-white">
          <TenantLogo size={36} className="w-9 h-9 rounded-full" />
          <div className="text-right text-[13px] leading-tight">
            <p className="font-bold">VENDEDOR: {sellerId}</p>
            <p>{consultedAt}</p>
          </div>
        </div>

        <dl className="px-3 py-3 border-b border-gray-200 space-y-1">
          <div className="flex justify-between">
            <dt>Tabela de cotação</dt>
            <dd className="tabular-nums">{quotes.tableLabel}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Valor pra cada</dt>
            <dd className="tabular-nums">{formatBrl(100).replace(' ', '')}</dd>
          </div>
        </dl>

        {game === 'tradicional' && (
          <p className="px-3 py-3 border-b border-gray-200">
            Para <strong>Duque GP</strong> e <strong>Terno GP</strong>
            <br />
            valor válido para aposta seca
          </p>
        )}

        <table className="w-full">
          <caption className="sr-only">Cotações {game === 'tradicional' ? 'Tradicional' : 'Fazendinha'}</caption>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-gray-200">
                <th scope="row" className="px-3 py-4 text-left font-normal">
                  {row.label}
                </th>
                <td className="px-3 py-4 text-right tabular-nums">{formatBrl(row.prizeCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      <div className="sticky bottom-0 bg-white px-2 pt-3 pb-3 space-y-2">
        <button
          type="button"
          onClick={share}
          className="w-full h-14 flex items-center justify-center gap-2 rounded-xl bg-brand-green text-white text-[17px] font-bold active:scale-[0.99] transition-transform"
        >
          <FileText className="w-5 h-5" aria-hidden />
          Compartilhar
        </button>
        <Link
          href={ROUTES.home}
          className="w-full h-14 flex items-center justify-center rounded-xl bg-brand-orange text-white text-[17px] font-bold active:scale-[0.99] transition-transform"
        >
          Voltar ao início
        </Link>
      </div>
    </>
  );
}
