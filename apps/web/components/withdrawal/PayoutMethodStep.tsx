'use client';

import type { ReactNode } from 'react';
import { PIX_KEY_INFO, type PixKeyType } from '@/lib/pix-key';
import type { RecentPixKey } from '@/lib/recent-pix-keys';
import PixIcon from '../icons/PixIcon';
import InfoNotice from './InfoNotice';
import KeyTypePicker from './KeyTypePicker';
import PasteKeyButton from './PasteKeyButton';
import RecentKeys from './RecentKeys';

const labelClass = 'text-[11.5px] font-semibold uppercase tracking-wide text-gray-500';
const fieldClass =
  'mt-2 h-11 w-full rounded-xl border border-gray-200 bg-[#F6F6F6] px-3.5 text-[14px] font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-brand-primary/40 read-only:cursor-default read-only:focus:ring-0';

function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl bg-white p-4 shadow-sm">{children}</section>;
}

interface PayoutMethodStepProps {
  holderName: string;
  keyType: PixKeyType | null;
  keyValue: string;
  /** Erro da chave (ou de tipo não escolhido), mostrado abaixo dos cartões. */
  error: string | null;
  recentKeys: readonly RecentPixKey[];
  onSelectType: (type: PixKeyType) => void;
  onChangeValue: (value: string) => void;
  onSelectRecent: (entry: RecentPixKey) => void;
  onClearRecent: () => void;
  /** "Colar" não conseguiu ler a área de transferência. */
  onPasteFail: () => void;
}

/** Etapa 1 do saque: forma de pagamento (só Pix), titular e chave. */
export default function PayoutMethodStep({
  holderName,
  keyType,
  keyValue,
  error,
  recentKeys,
  onSelectType,
  onChangeValue,
  onSelectRecent,
  onClearRecent,
  onPasteFail,
}: PayoutMethodStepProps) {
  const info = keyType ? PIX_KEY_INFO[keyType] : null;

  return (
    <div className="flex flex-col gap-3 px-3.5 pt-4">
      <Card>
        <h2 className={labelClass}>Forma de pagamento</h2>
        <div role="radiogroup" aria-label="Forma de pagamento" className="mt-3">
          <div
            role="radio"
            aria-checked="true"
            className="flex items-center gap-3 rounded-xl border border-brand-primary px-3.5 py-3"
          >
            <PixIcon size={22} className="text-brand-teal" aria-hidden />
            <span className="flex-1 text-[15px] font-bold text-brand-primary">Pix</span>
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-brand-primary after:h-2.5 after:w-2.5 after:rounded-full after:bg-brand-primary"
            />
          </div>
        </div>
      </Card>

      <Card>
        <label htmlFor="withdraw-holder" className={labelClass}>
          Titular
        </label>
        <input id="withdraw-holder" readOnly value={holderName} className={`${fieldClass} uppercase`} />
      </Card>

      <RecentKeys keys={recentKeys} onSelect={onSelectRecent} onClear={onClearRecent} />

      <Card>
        <KeyTypePicker value={keyType} onChange={onSelectType} />
        {info && keyType && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <label htmlFor="withdraw-key" className={labelClass}>
              {info.fieldLabel}
            </label>
            <div className="relative">
              <input
                id="withdraw-key"
                // A chave CPF é sempre a do titular: só leitura.
                readOnly={keyType === 'cpf'}
                value={keyValue}
                onChange={(event) => onChangeValue(event.target.value)}
                placeholder={info.placeholder}
                inputMode={keyType === 'phone' ? 'tel' : keyType === 'email' ? 'email' : undefined}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'withdraw-key-error' : undefined}
                className={`${fieldClass} ${keyType === 'random' ? 'pr-24' : ''} ${error ? 'border-red-400' : ''}`}
              />
              {keyType === 'random' && <PasteKeyButton onPaste={onChangeValue} onFail={onPasteFail} />}
            </div>
          </div>
        )}
      </Card>

      <InfoNotice>O saque só será realizado para conta com o mesmo CPF do cadastro.</InfoNotice>

      {error && (
        <p id="withdraw-key-error" role="alert" className="text-center text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
