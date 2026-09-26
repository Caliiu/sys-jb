'use client';

import type { PublicWallet } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { WithdrawalItem } from '@/lib/withdrawal';
import SectionBar from '../section/SectionBar';
import FixedAction, { ACTION_BUTTON_CLASS } from './FixedAction';
import WithdrawalFlow from './WithdrawalFlow';
import WithdrawalList from './WithdrawalList';
import WithdrawalSuccess from './WithdrawalSuccess';

type View = { name: 'list' } | { name: 'new' } | { name: 'success'; withdrawal: WithdrawalItem };

interface WithdrawalsScreenProps {
  userId: string;
  items: readonly WithdrawalItem[];
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
        holderName={holderName}
        holderDocument={holderDocument}
        onExit={showList}
        onRequested={(withdrawal) => {
          setView({ name: 'success', withdrawal });
          refresh(); // traz a lista já com o saque novo
        }}
      />
    );
  }

  if (view.name === 'success') return <WithdrawalSuccess withdrawal={view.withdrawal} onTrack={showList} />;

  return (
    <>
      <SectionBar title="Meus saques" />
      <main className="pb-28">
        <WithdrawalList
          items={items}
          holderName={holderName}
          nowIso={nowIso}
          refreshing={refreshing}
          onRefresh={refresh}
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
