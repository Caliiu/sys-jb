import { ChevronRight } from 'lucide-react';

export const stepCardClass = 'rounded-xl bg-white shadow-card';

/** Número da etapa: cheio quando escolhida, claro enquanto pendente, cinza quando ainda não dá para escolher. */
export function StepBadge({ n, state }: { n: number; state: 'done' | 'pending' | 'disabled' }) {
  const tone =
    state === 'done'
      ? 'bg-brand-primary text-white'
      : state === 'pending'
        ? 'bg-brand-primary/10 text-brand-primary'
        : 'bg-gray-100 text-gray-300';
  return (
    <span
      aria-hidden
      className={`flex w-9 h-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${tone}`}
    >
      {n}
    </span>
  );
}

/** Etapa que abre uma escolha (folha de opções): "1 · Loteria / Selecionar". */
export default function StepButton({
  n,
  label,
  value,
  disabled = false,
  onClick,
}: {
  n: number;
  label: string;
  /** null = ainda não escolhido ("Selecionar"). */
  value: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}: ${value ?? 'Selecionar'}`}
      className={`${stepCardClass} flex w-full items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99] transition-transform disabled:opacity-50 disabled:active:scale-100`}
    >
      <StepBadge n={n} state={disabled ? 'disabled' : value ? 'done' : 'pending'} />
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
        <span className={`block truncate text-[16px] ${value ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
          {value ?? 'Selecionar'}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
    </button>
  );
}
