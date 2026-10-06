'use client';

import type { PublicWallet } from '@sysjb/contracts';
import { CircleCheck, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { depositStatusAction } from '@/app/recharge-actions';
import { useSecondsUntil } from '@/hooks/useCountdown';
import { maskCpfInput } from '@/lib/masks';
import { formatBrl } from '@/lib/currency';
import type { PixCharge } from '@/lib/recharge';
import { ROUTES } from '@/lib/routes';
import PaymentTimer from './PaymentTimer';
import PixKeyCard from './PixKeyCard';
import PixQrToggle from './PixQrToggle';

/** A tela pergunta pela confirmação a cada 5 s (a API confere no gateway no máximo nesse ritmo). */
export const DEPOSIT_POLL_MS = 5_000;
/** Depois de 30 min aberta, a tela para de perguntar (o crédito ainda entra pela conferência automática). */
const POLL_LIMIT_MS = 30 * 60_000;

interface PaymentDetailsProps {
  /** Titular do CPF: o Pix só é aceito se sair de uma conta desse titular. */
  holderName: string;
  holderDocument: string;
  charge: PixCharge;
  /** Volta ao formulário para gerar outra cobrança. */
  onRestart: () => void;
  /** Pagamento confirmado: a carteira já com o crédito. */
  onPaid: (wallet: PublicWallet) => void;
}

/** Desfecho do depósito para a tela: pago (creditado), em análise (pago por outra conta) ou recusado. */
type Outcome = 'paid' | 'review' | 'rejected' | null;

/**
 * Acompanha o depósito até um desfecho: pergunta à API em intervalos (e ao voltar para a aba). Para quando é pago,
 * vai para análise ou é recusado, quando a sessão acaba ou depois de 30 min.
 */
function useDepositOutcome(depositId: string, onPaid: (wallet: PublicWallet) => void): Outcome {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const onPaidRef = useRef(onPaid);
  useEffect(() => {
    onPaidRef.current = onPaid;
  }, [onPaid]);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const startedAt = Date.now();
    const check = async () => {
      if (stopped || inFlight) return;
      if (Date.now() - startedAt > POLL_LIMIT_MS) return stop();
      inFlight = true;
      try {
        const result = await depositStatusAction(depositId);
        if (stopped) return;
        if (result.ok && result.status === 'PAID' && result.wallet) {
          stop();
          setOutcome('paid');
          onPaidRef.current(result.wallet);
        } else if (result.ok && (result.status === 'REVIEW' || result.status === 'REJECTED')) {
          stop();
          setOutcome(result.status === 'REVIEW' ? 'review' : 'rejected');
        } else if (!result.ok && result.code === 'SESSION_INVALID') {
          stop();
          router.replace('/login');
        }
      } catch {
        // Rede instável: tenta de novo no próximo intervalo.
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void check(), DEPOSIT_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    function stop() {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    }
    return stop;
  }, [depositId, router]);

  return outcome;
}

/** Etapa 2 da recarga: chave Pix (copia e cola), QR Code e tempo para pagar; depois, a confirmação. */
export default function PaymentDetails({ holderName, holderDocument, charge, onRestart, onPaid }: PaymentDetailsProps) {
  const seconds = useSecondsUntil(charge.expiresAt);
  const expired = seconds === 0;
  const outcome = useDepositOutcome(charge.depositId, onPaid);

  if (outcome === 'review' || outcome === 'rejected') {
    return (
      <section aria-labelledby="deposit-held" className="flex flex-col items-center gap-3 px-6 pt-12 pb-8 text-center">
        <ShieldAlert className="h-16 w-16 text-amber-500" aria-hidden />
        <h2 id="deposit-held" className="text-[20px] font-bold text-slate-900">
          {outcome === 'review' ? 'Pagamento em análise' : 'Pagamento recusado'}
        </h2>
        <p className="text-[14px] text-slate-600">
          {outcome === 'review'
            ? `Recebemos ${formatBrl(charge.amountCents)}, mas o Pix não saiu de uma conta no seu CPF. O valor fica retido até a banca analisar.`
            : 'O Pix não saiu de uma conta no seu CPF e não foi creditado. Fale com o suporte para a devolução.'}
        </p>
        <Link
          href={ROUTES.home}
          className="mt-4 w-full rounded-xl bg-brand-primary py-3.5 text-[15px] font-bold text-white"
        >
          Voltar ao início
        </Link>
      </section>
    );
  }

  if (outcome === 'paid') {
    return (
      <section aria-labelledby="deposit-paid" className="flex flex-col items-center gap-3 px-6 pt-12 pb-8 text-center">
        <CircleCheck className="h-16 w-16 text-emerald-500" aria-hidden />
        <h2 id="deposit-paid" className="text-[20px] font-bold text-slate-900">
          Pagamento confirmado!
        </h2>
        <p role="status" className="text-[14px] text-slate-600">
          {formatBrl(charge.amountCents)} creditado na sua carteira.
        </p>
        <Link
          href={ROUTES.home}
          className="mt-4 w-full rounded-xl bg-brand-primary py-3.5 text-[15px] font-bold text-white"
        >
          Voltar ao início
        </Link>
        <button type="button" onClick={onRestart} className="text-[14px] font-semibold text-brand-primary">
          Fazer outra recarga
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-3.5 pt-4 pb-8">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-snug text-amber-800">
        <p className="flex items-center gap-1.5 text-[13px] font-bold">
          <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden />
          Atenção
        </p>
        <p className="mt-1">
          Só serão aceitos pagamentos do titular: <strong className="uppercase">{holderName}</strong> · CPF{' '}
          <strong>{maskCpfInput(holderDocument)}</strong>. Pix de outra conta não é creditado: fica retido para análise.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-slate-900">Chave Pix (copia e cola)</h2>
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-[12px] font-bold text-red-700 tabular-nums">
          {formatBrl(charge.amountCents)}
        </span>
      </div>

      <PixKeyCard code={charge.code} disabled={expired} />
      <p className="text-center text-[12px] text-slate-400">
        Cole a chave no seu app do banco e realize o pagamento via Pix. O crédito entra assim que o pagamento for
        confirmado.
      </p>

      <PixQrToggle code={charge.code} disabled={expired} />
      <PaymentTimer seconds={seconds} durationSeconds={charge.durationSeconds} onRestart={onRestart} />
    </div>
  );
}
