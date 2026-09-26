import type { ReactNode } from 'react';

/** Botão de ação principal das telas de saque (laranja; desabilitado fica esmaecido na cor da banca). */
export const ACTION_BUTTON_CLASS =
  'flex h-[52px] w-full items-center justify-center rounded-2xl bg-brand-orange text-[16px] font-bold text-white shadow-sm transition-transform active:scale-[0.98] disabled:bg-brand-primary/35 disabled:active:scale-100';

/** Faixa fixa no rodapé da coluna do app, com respiro para a área segura do celular. */
export default function FixedAction({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] bg-[#F4F6F6] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
