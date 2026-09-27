'use client';

import type { ReactNode } from 'react';
import Switch from '../ui/Switch';

interface SettingRowProps {
  /** Prefixo dos ids (nome e descrição do interruptor). */
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Aviso sobre o estado (ex.: notificações bloqueadas no navegador). */
  note?: ReactNode;
}

/** Uma preferência: nome, interruptor e descrição. */
export default function SettingRow({ id, label, description, checked, onChange, disabled, note }: SettingRowProps) {
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;

  return (
    <section className="border-b border-gray-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id={labelId} className="text-[14px] font-medium uppercase text-gray-900">
          {label}
        </h2>
        <Switch
          checked={checked}
          onChange={onChange}
          labelledBy={labelId}
          describedBy={descriptionId}
          disabled={disabled}
        />
      </div>
      <p id={descriptionId} className="mt-3 text-[15px] leading-snug text-gray-400">
        {description}
      </p>
      {note && (
        <p role="status" className="mt-2 text-[13px] font-medium text-amber-700">
          {note}
        </p>
      )}
    </section>
  );
}
