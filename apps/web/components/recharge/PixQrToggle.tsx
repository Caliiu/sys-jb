'use client';

import { QrCode as QrCodeIcon } from 'lucide-react';
import { useId, useState } from 'react';
import QrCode from '../ui/QrCode';

/** Botão "Ver/Ocultar QR Code": o QR só é gerado quando o usuário pede. */
export default function PixQrToggle({ code, disabled }: { code: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const showing = open && !disabled;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={showing}
        aria-controls={panelId}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-500 active:scale-[0.99] transition-transform disabled:opacity-50"
      >
        <QrCodeIcon className="h-4 w-4" aria-hidden />
        {showing ? 'Ocultar QR Code' : 'Ver QR Code'}
      </button>
      <div id={panelId}>
        {showing && (
          <div className="mt-3 flex justify-center rounded-2xl bg-white p-5 shadow-card">
            <QrCode value={code} size={200} title="QR Code do Pix" className="text-black" />
          </div>
        )}
      </div>
    </div>
  );
}
