import type { ReactNode } from 'react';

export interface DetailRow {
  label: string;
  value: ReactNode;
  /** Valor maior e em destaque (ex.: o valor do saque). */
  emphasis?: boolean;
}

/** Cartão de pares "rótulo / valor" (confirmação, solicitação enviada e detalhes do resgate). */
export default function DetailRows({ rows }: { rows: readonly DetailRow[] }) {
  return (
    <dl className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-[#FAFAFA] px-4 py-3.5 text-[13px]">
      {rows.map(({ label, value, emphasis }) => (
        <div key={label} className="flex items-center justify-between gap-4">
          <dt className="text-gray-500">{label}</dt>
          <dd
            className={`min-w-0 break-all text-right font-bold tabular-nums text-gray-900 ${emphasis ? 'text-[16px]' : ''}`}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
