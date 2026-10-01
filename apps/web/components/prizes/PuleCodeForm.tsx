import { PULE_CODE_MAX_DIGITS } from '@sysjb/contracts';

interface PuleCodeFormProps {
  /** Rota que recebe ?pule= (a própria página). */
  action: string;
  /** Valor digitado antes (volta no campo quando o código é recusado). */
  defaultValue?: string;
  error?: string;
}

/**
 * Código da pule (Premiadas > Reclame, Relatórios > Consultar pule). Formulário GET para a própria rota
 * (funciona sem JavaScript); o código é conferido no servidor antes de consultar a API.
 */
export default function PuleCodeForm({ action, defaultValue = '', error }: PuleCodeFormProps) {
  return (
    <form method="get" action={action} noValidate className="flex flex-col gap-5 px-3.5 pt-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="pule" className="sr-only">
          Código da pule
        </label>
        <input
          id="pule"
          name="pule"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="go"
          // Folga para espaços ("562 229 026"); o servidor remove e confere os dígitos.
          maxLength={PULE_CODE_MAX_DIGITS * 2}
          required
          defaultValue={defaultValue}
          placeholder="Código da pule"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'pule-error' : undefined}
          className="h-12 w-full rounded-xl bg-white px-4 text-[16px] text-gray-900 placeholder:text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-brand-orange aria-invalid:ring-2 aria-invalid:ring-red-500"
        />
        {error && (
          <p id="pule-error" role="alert" className="px-1 text-[13px] font-semibold text-red-700">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="h-12 w-full rounded-xl bg-brand-orange text-[16px] font-bold text-white active:scale-[0.99] transition-transform"
      >
        Avançar
      </button>
    </form>
  );
}
