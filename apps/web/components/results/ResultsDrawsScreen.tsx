'use client';

import { groupDraws, type PublicDraw } from '@sysjb/contracts';
import { useState } from 'react';
import DrawGroupsPicker from '../lotteries/DrawGroupsPicker';
import { FooterButton } from '../lotteries/EntrySteps';
import SectionBar from '../section/SectionBar';

interface ResultsDrawsScreenProps {
  /** Sorteios da banca que correm no dia, na ordem do cadastro. */
  draws: PublicDraw[];
  /** Ids já marcados (ao voltar do resultado). */
  initialSelected: string[];
  /** Volta para a escolha do dia. */
  onBack: () => void;
  /** Avançar: os ids marcados, na ordem do cadastro. */
  onConfirm: (ids: string[]) => void;
  /** Consultando o resultado: o botão fica desabilitado. */
  busy?: boolean;
}

/**
 * Resultados > Resultado loterias > data: escolha das extrações (a mesma lista agrupada da compra, com as
 * favoritas no topo). Avançar pede o resultado das marcadas, na ordem do cadastro.
 */
export default function ResultsDrawsScreen({
  draws,
  initialSelected,
  onBack,
  onConfirm,
  busy = false,
}: ResultsDrawsScreenProps) {
  const [selected, setSelected] = useState(() => initialSelected.filter((id) => draws.some((d) => d.id === id)));
  const groups = groupDraws(draws);

  const next = () => {
    const ids = draws.filter((d) => selected.includes(d.id)).map((d) => d.id);
    if (ids.length > 0) onConfirm(ids);
  };

  return (
    <>
      <SectionBar title="Loterias" back={{ onClick: onBack, label: 'Voltar para as datas' }} />
      <main className="px-3 py-3 pb-28">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-gray-500">Não há loterias neste dia.</p>
        ) : (
          <DrawGroupsPicker groups={groups} selected={selected} onChange={setSelected} keyOf={(d) => d.id} />
        )}
      </main>
      <FooterButton label={busy ? 'Consultando…' : 'Avançar'} onClick={next} disabled={selected.length === 0 || busy} />
    </>
  );
}
