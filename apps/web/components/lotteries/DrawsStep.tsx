'use client';

import { type DrawGame, type DrawSchedule, drawsOn, groupDraws, isDrawOpenOn } from '@sysjb/contracts';
import { Clock } from 'lucide-react';
import { drawKey } from '@/lib/lotteries';
import DrawGroupsPicker from './DrawGroupsPicker';
import { FooterButton } from './EntrySteps';

interface DrawsStepProps {
  nowIso: string;
  /** Cadastro de sorteios da banca (dias da semana, exceções e horário de venda). */
  schedule: DrawSchedule;
  /** YYYY-MM-DD: cada sorteio corre nos dias dele (a Federal, quartas e domingos), salvo exceções. */
  drawDate: string;
  /** Jogo do cadastro de sorteios: Tradicional 1/7 (lotteries) ou 1/10 (lotteries10). */
  game?: DrawGame;
  selected: string[];
  onChange: (keys: string[]) => void;
  onNext: () => void;
}

/**
 * Etapa 7: loterias (extrações) do dia, agrupadas; várias podem ser escolhidas. Hoje, só as que ainda não
 * fecharam. Favoritas (estrela) sobem para o topo; ficam só neste aparelho.
 */
export default function DrawsStep({
  nowIso,
  schedule,
  drawDate,
  game = 'lotteries',
  selected,
  onChange,
  onNext,
}: DrawsStepProps) {
  // Grupos com sorteio aberto, na ordem do cadastro.
  const groups = groupDraws(
    drawsOn(schedule, drawDate, game).filter((d) => isDrawOpenOn(nowIso, drawDate, d.closesAt)),
  );

  return (
    <>
      <main className="px-3 py-3 pb-28">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-gray-500">Não há mais loterias abertas neste dia.</p>
        ) : (
          <DrawGroupsPicker
            groups={groups}
            selected={selected}
            onChange={onChange}
            keyOf={drawKey}
            aside={(draw) => (
              <span className="flex items-center gap-1 text-[13px] text-gray-400 tabular-nums">
                <Clock className="w-3.5 h-3.5" aria-hidden />
                {draw.closesAt}
              </span>
            )}
          />
        )}
      </main>
      <FooterButton label="Avançar" onClick={onNext} disabled={selected.length === 0} />
    </>
  );
}
