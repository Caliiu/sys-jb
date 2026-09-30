'use client';

import { groupDraws, type PublicDraw } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROUTES, resultsViewOf } from '@/lib/routes';
import DrawGroupsPicker from '../lotteries/DrawGroupsPicker';
import { FooterButton } from '../lotteries/EntrySteps';
import SectionBar from '../section/SectionBar';

interface ResultsDrawsScreenProps {
  /** YYYY-MM-DD. */
  date: string;
  /** Sorteios da banca que correm no dia, na ordem do cadastro. */
  draws: PublicDraw[];
  /** Ids já marcados (ao voltar do resultado). */
  initialSelected: string[];
}

/**
 * Resultados > Resultado loterias > data: escolha das extrações (a mesma lista agrupada da compra, com as
 * favoritas no topo). Avançar abre o resultado das marcadas, na ordem do cadastro.
 */
export default function ResultsDrawsScreen({ date, draws, initialSelected }: ResultsDrawsScreenProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => initialSelected.filter((id) => draws.some((d) => d.id === id)));
  const groups = groupDraws(draws);

  const next = () => {
    const ids = draws.filter((d) => selected.includes(d.id)).map((d) => d.id);
    if (ids.length > 0) router.push(resultsViewOf(date, ids));
  };

  return (
    <>
      <SectionBar title="Loterias" back={{ href: ROUTES.lotteryResults, label: 'Voltar para as datas' }} />
      <main className="px-3 py-3 pb-28">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-gray-500">Não há loterias neste dia.</p>
        ) : (
          <DrawGroupsPicker groups={groups} selected={selected} onChange={setSelected} keyOf={(d) => d.id} />
        )}
      </main>
      <FooterButton label="Avançar" onClick={next} disabled={selected.length === 0} />
    </>
  );
}
