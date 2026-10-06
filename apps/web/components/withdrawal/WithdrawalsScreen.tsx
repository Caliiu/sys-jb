'use client';

import type { PublicWallet } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { WithdrawalItem, WithdrawalLimits } from '@/lib/withdrawal';
import SectionBar from '../section/SectionBar';
import FixedAction, { ACTION_BUTTON_CLASS } from './FixedAction';
import WithdrawalFlow from './WithdrawalFlow';
import WithdrawalList from './WithdrawalList';
import WithdrawalSuccess from './WithdrawalSuccess';

type View = { name: 'list' } | { name: 'new' } | { name: 'success'; withdrawal: WithdrawalItem };

interface WithdrawalsScreenProps {
  userId: string;
  items: readonly WithdrawalItem[];
  /** Limites de saque da banca e o uso de hoje. */
  limits: WithdrawalLimits;
  /** A lista não pôde ser lida (a tela avisa e oferece atualizar). */
  loadFailed: boolean;
  wallet: PublicWallet;
  /** Titular da conta: nome e CPF do cadastro. */
  holderName: string;
  holderDocument: string;
  /** "Agora" do servidor, para agrupar por "Hoje" e "Ontem". */
  nowIso: string;
}

/**
 * Saques em uma só rota (/saques), sem mudar a URL: lista "Meus saques", fluxo "Novo saque" e
 * "Solicitação enviada" se alternam por estado. A lista volta ao início; o fluxo volta à lista.
 */
export default function WithdrawalsScreen({
  userId,
  items,
  limits,
  loadFailed,
  wallet,
  holderName,
  holderDocument,
  nowIso,
}: WithdrawalsScreenProps) {
  const router = useRouter();
  const [view, setView] = useState<View>({ name: 'list' });
  const [refreshing, startRefresh] = useTransition();

  // A tela nova começa no topo, mesmo que a anterior tenha sido rolada.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.name]);

  const refresh = () => startRefresh(() => router.refresh());
  const showList = () => setView({ name: 'list' });

  if (view.name === 'new') {
    return (
      <WithdrawalFlow
        userId={userId}
        wallet={wallet}
        limits={limits}
        holderName={holderName}
        holderDocument={holderDocument}
        onExit={showList}
        onRequested={(withdrawal) => {
          setView({ name: 'success', withdrawal });
          refresh(); // traz a lista e o saldo já com o saque novo
        }}
      />
    );
  }

  if (view.name === 'success') return <WithdrawalSuccess withdrawal={view.withdrawal} onTrack={showList} />;

  return (
    <>
      <SectionBar title="Meus saques" />
      <main className="pb-28">
        {loadFailed && (
          <p role="alert" className="mx-4 mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">
            Não foi possível carregar seus saques. Toque em Atualizar ou tente novamente em instantes.
          </p>
        )}
        <WithdrawalList
          items={items}
          holderName={holderName}
          nowIso={nowIso}
          refreshing={refreshing}
          onRefresh={refresh}
          showEmpty={!loadFailed}
        />
      </main>
      <FixedAction>
        <button type="button" onClick={() => setView({ name: 'new' })} className={ACTION_BUTTON_CLASS}>
          Novo saque
        </button>
      </FixedAction>
    </>
  );
}
