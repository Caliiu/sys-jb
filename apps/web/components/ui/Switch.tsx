'use client';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** id do texto que dá nome ao interruptor. */
  labelledBy: string;
  /** id do texto de apoio (descrição/aviso). */
  describedBy?: string;
  disabled?: boolean;
}

/** Interruptor liga/desliga acessível (role="switch": Espaço/Enter alternam e o leitor de tela anuncia o estado). */
export default function Switch({ checked, onChange, labelledBy, describedBy, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:opacity-60 ${
        checked ? 'bg-green-600' : 'bg-gray-200'
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-[3px] top-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
