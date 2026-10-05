'use client';

import {
  type DrawSchedule,
  drawRunsOn,
  type LotteryResultsResponse,
  RESULTS_DAYS_BACK,
  reportDates,
} from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadResultsAction } from '@/app/results-actions';
import { formatCalendarDate, formatDateTimeSeconds } from '@/lib/datetime';
import { drawResults, resultsReceipt } from '@/lib/results-receipt';
import { ROUTES } from '@/lib/routes';
import MenuList from '../section/MenuList';
import SectionBar from '../section/SectionBar';
import { useToast } from '../ui/Toast';
import ResultsDrawsScreen from './ResultsDrawsScreen';
import ResultsScreen from './ResultsScreen';

/** Resultados consultados de um dia e a hora da consulta (ISO 8601, a do comprovante). */
export interface LoadedResults {
  report: LotteryResultsResponse;
  consultedAt: string;
}

/**
 * Etapa da tela: escolha do dia; extrações do dia (com as marcadas); resultado das marcadas. É também onde a tela abre:
 * na escolha do dia ou, pelo link da notificação "Resultado saiu", direto no resultado.
 */
export type ResultsStep =
  | { step: 'dates' }
  | { step: 'draws'; date: string; selected: string[] }
  | { step: 'result'; date: string; selected: string[]; loaded: LoadedResults };

interface ResultsFlowProps {
  /** Agora (ISO 8601, do servidor): base das datas consultáveis. */
  nowIso: string;
  schedule: DrawSchedule;
  /** Vendedor = o próprio jogador (displayId), no comprovante. */
  sellerId: number;
  start: ResultsStep;
}

const UNAVAILABLE = 'Não foi possível consultar os resultados. Tente novamente.';

/**
 * Resultados > Resultado loterias numa rota só (/resultados/loterias), como as outras telas de etapas: dia (hoje e os
 * anteriores) → extrações do dia (a mesma lista agrupada da compra, com favoritas) → número, grupo e bicho de cada
 * prêmio das escolhidas que já têm resultado, com "Compartilhar". O endereço não muda entre as etapas; o "voltar" de
 * cada uma leva à anterior.
 */
export default function ResultsFlow({ nowIso, schedule, sellerId, start }: ResultsFlowProps) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<ResultsStep>(start);
  const [busy, setBusy] = useState(false);

  // O link da notificação traz a data e os sorteios; aberto, o endereço volta a ser o da tela.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', ROUTES.lotteryResults);
  }, []);

  // Cada etapa começa do topo.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.step]);

  if (state.step === 'dates') {
    const items = reportDates(nowIso, RESULTS_DAYS_BACK).map((date) => ({
      label: formatCalendarDate(date),
      onSelect: () => setState({ step: 'draws', date, selected: [] }),
    }));
    return (
      <>
        <SectionBar title="Resultados" back={{ href: ROUTES.results, label: 'Voltar para resultados' }} />
        <main>
          <MenuList items={items} label="Resultados" />
        </main>
      </>
    );
  }

  const { date, selected } = state;

  if (state.step === 'draws') {
    const showResults = async (ids: string[]) => {
      setBusy(true);
      try {
        const res = await loadResultsAction(date);
        if (res.ok) {
          setState({
            step: 'result',
            date,
            selected: ids,
            loaded: { report: res.report, consultedAt: res.consultedAt },
          });
        } else if (res.code === 'SESSION_INVALID') {
          router.replace('/login');
        } else {
          toast.show(res.message);
        }
      } catch {
        toast.show(UNAVAILABLE);
      } finally {
        setBusy(false);
      }
    };
    return (
      <ResultsDrawsScreen
        key={date}
        draws={schedule.draws.filter((draw) => drawRunsOn(draw, date, schedule.exceptions))}
        initialSelected={selected}
        onBack={() => setState({ step: 'dates' })}
        onConfirm={showResults}
        busy={busy}
      />
    );
  }

  const receipt = resultsReceipt({
    date,
    results: drawResults(schedule.draws, selected, state.loaded.report.results),
    sellerId,
    consultedAt: formatDateTimeSeconds(state.loaded.consultedAt),
  });
  return (
    // Comprovante em fundo branco até o rodapé (as outras etapas são listas, em cinza).
    <div className="flex flex-1 flex-col bg-white">
      <ResultsScreen
        back={{ onClick: () => setState({ step: 'draws', date, selected }), label: 'Voltar para as loterias' }}
        receipt={receipt}
      />
    </div>
  );
}
