'use client';

import {
  Calculator,
  CalendarDays,
  Coins,
  FileText,
  Gift,
  Info,
  type LucideIcon,
  Network,
  Pause,
  UserRound,
  X,
} from 'lucide-react';
import { type ReactNode, useId, useRef } from 'react';
import { useOverlay } from '@/hooks/useOverlay';
import { primaryButtonClass } from './filter-styles';

/** Passos na ordem da tela: ícone, título e o texto (o cálculo leva a fórmula em destaque). */
const STEPS: ReadonlyArray<{ icon: LucideIcon; title: string; body: ReactNode }> = [
  {
    icon: FileText,
    title: 'Recargas elegíveis',
    body: (
      <>
        Somente recargas de Loterias pagas, a partir do valor mínimo.
        <br />
        Recargas do cassino não recebem bônus.
      </>
    ),
  },
  {
    icon: Calculator,
    title: 'Cálculo do bônus',
    body: (
      <>
        Percentual da recarga, limitado ao teto da regra.
        <code className="mt-2 block w-fit rounded-md bg-admin-hover px-3 py-1.5 font-mono text-[12.5px] text-admin-text">
          Bônus = menor valor entre (% × recarga) e limite
        </code>
      </>
    ),
  },
  {
    icon: CalendarDays,
    title: 'Dia e horário',
    body: (
      <>
        A primeira recarga diária e a regra de Federal consideram a data do pagamento, no horário de Brasília. Os dias
        de Federal seguem o cadastro de sorteios, incluindo feriados e sorteios extras.
      </>
    ),
  },
  {
    icon: UserRound,
    title: 'Pagamento por outro titular',
    body: <>O bônus depende da liberação do Gerente.</>,
  },
  {
    icon: Coins,
    title: 'Uso do bônus e prêmios',
    body: (
      <>
        O bônus é usado primeiro nas apostas de Loterias e Fazendinha.
        <br />
        Não pode ser sacado e não expira. Os ganhos são creditados normalmente em Prêmios.
      </>
    ),
  },
  {
    icon: Network,
    title: 'Comissões',
    body: <>Indicação e promotor recebem comissão apenas sobre a parte da aposta paga com Saldo e Prêmios.</>,
  },
];

const iconBox = 'grid shrink-0 place-items-center rounded-xl bg-admin-accent/10 text-admin-accent';

/**
 * "Como funciona" do bônus de recarga: as regras completas num diálogo. Esc, o X, o fundo ou "Entendi" fecham; o foco
 * entra no diálogo e volta para quem abriu. Em telas baixas, só a lista rola (cabeçalho e "Entendi" ficam à vista).
 */
export default function DepositBonusHowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlay(open, onClose, panelRef, 'panel');
  if (!open) return null;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-2xl bg-admin-surface shadow-admin outline-none"
      >
        <header className="flex items-start gap-4 px-6 pt-6 pb-4 md:px-8 md:pt-7">
          <span className={`${iconBox} h-12 w-12 md:h-14 md:w-14`}>
            <Info className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[22px] font-bold tracking-tight text-admin-text md:text-[26px]">
              Como funciona o bônus
            </h2>
            <p id={descriptionId} className="text-[14px] text-admin-muted md:text-[15px]">
              Entenda as regras do bônus de recarga.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 rounded-md p-2 text-admin-muted hover:bg-admin-hover hover:text-admin-text"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 md:px-8">
          <div className="flex items-center gap-4 rounded-xl bg-admin-accent/[0.07] px-4 py-4 md:px-5">
            <span className={`${iconBox} h-11 w-11 bg-admin-accent/10`}>
              <Gift className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <p className="text-[16px] font-semibold text-admin-accent-dark">Um bônus por recarga</p>
              <p className="text-[14px] text-admin-muted">
                Entre as regras ativas e elegíveis,{' '}
                <strong className="font-medium text-admin-text">vale o maior bônus</strong>.
              </p>
            </div>
          </div>

          <ol className="mt-1 divide-y divide-admin-border">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="flex gap-3 py-4 md:gap-5">
                <span className={`${iconBox} hidden h-11 w-11 bg-admin-accent/[0.07] sm:grid`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-admin-hover text-[13px] font-semibold text-admin-text"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-admin-text">{title}</h3>
                  <div className="mt-0.5 text-[13.5px] leading-relaxed text-admin-muted">{body}</div>
                </div>
              </li>
            ))}
          </ol>

          <p className="flex items-center gap-3 rounded-lg bg-admin-hover px-4 py-3 text-[13px] text-admin-text">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-admin-muted/70 text-white">
              <Pause className="h-3 w-3 fill-current" aria-hidden />
            </span>
            Ao pausar uma regra, o percentual e o limite ficam salvos.
          </p>
        </div>

        <footer className="flex justify-end border-t border-admin-border px-6 py-4 md:px-8">
          <button type="button" onClick={onClose} className={`${primaryButtonClass} h-10 px-8`}>
            Entendi
          </button>
        </footer>
      </div>
    </div>
  );
}
