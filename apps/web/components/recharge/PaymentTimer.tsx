import { AlarmClock } from 'lucide-react';
import { formatClock } from '@/lib/recharge';

interface PaymentTimerProps {
  /** Segundos restantes; null até o navegador hidratar (no servidor não há relógio). */
  seconds: number | null;
  durationSeconds: number;
  /** Pede outra cobrança (volta ao formulário). */
  onRestart: () => void;
}

/** Contagem regressiva do prazo da cobrança, com barra de progresso. Ao expirar, oferece gerar outro Pix. */
export default function PaymentTimer({ seconds, durationSeconds, onRestart }: PaymentTimerProps) {
  const percent = seconds === null ? 100 : Math.min(100, (seconds / durationSeconds) * 100);

  return (
    <section aria-label="Prazo do pagamento" className="flex flex-col items-center gap-2 pt-1">
      {seconds === 0 ? (
        <>
          <p role="alert" className="text-[16px] font-bold text-red-700">
            Pagamento expirado
          </p>
          <button
            type="button"
            onClick={onRestart}
            className="rounded-xl bg-brand-primary px-5 py-2.5 text-[14px] font-bold text-white active:scale-95 transition-transform"
          >
            Gerar novo Pix
          </button>
        </>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
            <AlarmClock className="h-4 w-4 text-brand-primary" aria-hidden />
            Tempo para pagar
          </p>
          <p role="timer" className="font-display text-[36px] leading-none text-brand-primary tabular-nums">
            {seconds === null ? '--:--' : formatClock(seconds)}
          </p>
          <div aria-hidden className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      )}
      <p className="text-[11px] text-slate-400">O pagamento será cancelado após o tempo expirar</p>
    </section>
  );
}
