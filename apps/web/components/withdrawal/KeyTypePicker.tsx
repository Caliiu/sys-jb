'use client';

import { PIX_KEY_INFO, PIX_KEY_TYPES, type PixKeyType } from '@/lib/pix-key';
import { PIX_KEY_ICONS } from './pix-key-icons';

interface KeyTypePickerProps {
  value: PixKeyType | null;
  onChange: (type: PixKeyType) => void;
}

/** Tipo da chave Pix (radios nativos: teclado e leitor de tela funcionam sem código extra). */
export default function KeyTypePicker({ value, onChange }: KeyTypePickerProps) {
  return (
    <fieldset>
      <legend className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Tipo de chave</legend>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {PIX_KEY_TYPES.map((type) => {
          const Icon = PIX_KEY_ICONS[type];
          return (
            <label
              key={type}
              className="flex h-[62px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-[#F6F6F6] text-[12px] font-semibold text-gray-500 has-checked:border-brand-primary has-checked:bg-brand-primary has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-brand-primary/40"
            >
              <input
                type="radio"
                name="pix-key-type"
                value={type}
                checked={value === type}
                onChange={() => onChange(type)}
                className="sr-only"
              />
              <Icon className="h-4 w-4" aria-hidden />
              {PIX_KEY_INFO[type].label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
