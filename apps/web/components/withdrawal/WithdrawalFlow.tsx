'use client';

import type { PublicWallet } from '@sysjb/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { requestWithdrawalAction } from '@/app/withdrawal-actions';
import { useRecentPixKeys } from '@/hooks/useRecentPixKeys';
import { formatPixKeyInput, initialPixKey, normalizePixKey, type PixKeyType, pixKeyProblem } from '@/lib/pix-key';
import { normalizeRecentKey, type RecentPixKey, recentKeyFieldValue } from '@/lib/recent-pix-keys';
import { isWithdrawalAmountValid, type WithdrawalItem, withdrawalSummary } from '@/lib/withdrawal';
import SectionBar from '../section/SectionBar';
import AmountStep from './AmountStep';
import ConfirmWithdrawalSheet from './ConfirmWithdrawalSheet';
import ExplainSheet from './ExplainSheet';
import FixedAction, { ACTION_BUTTON_CLASS } from './FixedAction';
import PayoutMethodStep from './PayoutMethodStep';
import Stepper from './Stepper';

interface WithdrawalFlowProps {
  /** Usuário logado: as chaves recentes ficam guardadas por usuário. */
  userId: string;
  wallet: PublicWallet;
  /** Titular da conta: nome e CPF do cadastro. O saque só vale para a conta com este CPF. */
  holderName: string;
  holderDocument: string;
  /** Sai do fluxo e volta à lista "Meus saques" (a URL não muda). */
  onExit: () => void;
  /** O servidor confirmou a criação do saque: a tela mostra "Solicitação enviada". */
  onRequested: (withdrawal: WithdrawalItem) => void;
}

/**
 * Novo saque em duas etapas, sem mudar a URL (continua em /saques): 1) forma de pagamento (Pix, titular e chave); 2) valor.
 * O estado fica aqui em cima, então voltar da etapa 2 não perde a chave escolhida.
 */
export default function WithdrawalFlow({
  userId,
  wallet,
  holderName,
  holderDocument,
  onExit,
  onRequested,
}: WithdrawalFlowProps) {
  const router = useRouter();
  const { recent, remember, clear } = useRecentPixKeys(userId, holderDocument);
  const summary = useMemo(() => withdrawalSummary(wallet), [wallet]);

  const [step, setStep] = useState<1 | 2>(1);
  const [keyType, setKeyType] = useState<PixKeyType | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [explainOpen, setExplainOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // A etapa nova começa no topo, mesmo que a anterior tenha sido rolada.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  function selectType(type: PixKeyType) {
    setKeyType(type);
    setKeyValue(initialPixKey(type, holderDocument));
    setKeyError(null);
  }

  function changeKey(raw: string) {
    if (!keyType) return;
    setKeyValue(formatPixKeyInput(keyType, raw, holderDocument));
    setKeyError(null);
  }

  function selectRecent(entry: RecentPixKey) {
    setKeyType(entry.type);
    setKeyValue(recentKeyFieldValue(entry));
    setKeyError(null);
  }

  function goToAmount() {
    if (!keyType) return setKeyError('Escolha o tipo de chave.');
    const problem = pixKeyProblem(keyType, keyValue, holderDocument);
    if (problem) return setKeyError(problem);
    // Chave validada: vira "recente" (mais tarde, quando o saque existir, isto passa para a solicitação concluída).
    remember(normalizeRecentKey(keyType, keyValue));
    setStep(2);
  }

  function cancelConfirm() {
    setConfirmOpen(false);
    setSubmitError(null);
  }

  /** O servidor revalida tudo (sessão, chave e valor contra o saldo de agora); a tela só mostra o resultado. */
  async function confirmWithdrawal() {
    if (submitting || !keyType) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await requestWithdrawalAction({
        keyType,
        keyValue: normalizePixKey(keyType, keyValue),
        amountCents,
      });
      if (result.ok) {
        setConfirmOpen(false);
        onRequested(result.withdrawal);
      } else if (result.code === 'SESSION_INVALID') {
        router.replace('/login');
      } else {
        setSubmitError(result.message);
      }
    } catch {
      setSubmitError('Não foi possível enviar o saque. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SectionBar
        title={step === 1 ? 'Novo saque' : 'Valor do resgate'}
        back={{ onClick: step === 1 ? onExit : () => setStep(1) }}
      >
        <Stepper step={step} label={step === 1 ? 'Forma de pagamento' : 'Valor'} />
      </SectionBar>

      <main className="pb-28">
        {step === 1 ? (
          <PayoutMethodStep
            holderName={holderName}
            keyType={keyType}
            keyValue={keyValue}
            error={keyError}
            recentKeys={recent}
            onSelectType={selectType}
            onChangeValue={changeKey}
            onSelectRecent={selectRecent}
            onClearRecent={clear}
            onPasteFail={() => setKeyError('Não foi possível colar. Cole a chave manualmente no campo.')}
          />
        ) : (
          <AmountStep
            summary={summary}
            holderName={holderName}
            holderDocument={holderDocument}
            amountCents={amountCents}
            onChangeAmount={setAmountCents}
            onExplain={() => setExplainOpen(true)}
          />
        )}
      </main>

      <FixedAction>
        {step === 1 ? (
          <button type="button" onClick={goToAmount} className={ACTION_BUTTON_CLASS}>
            Avançar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={!isWithdrawalAmountValid(amountCents, summary.available)}
            className={ACTION_BUTTON_CLASS}
          >
            Avançar
          </button>
        )}
      </FixedAction>

      <ExplainSheet open={explainOpen} onClose={() => setExplainOpen(false)} />

      {keyType && (
        <ConfirmWithdrawalSheet
          open={confirmOpen}
          amountCents={amountCents}
          keyType={keyType}
          keyValue={normalizePixKey(keyType, keyValue)}
          pending={submitting}
          error={submitError}
          onConfirm={confirmWithdrawal}
          onCancel={cancelConfirm}
        />
      )}
    </>
  );
}
