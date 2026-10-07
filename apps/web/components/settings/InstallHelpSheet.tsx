'use client';

import { useId } from 'react';
import { isIosDevice } from '@/lib/pwa-install';
import BottomSheet from '../ui/BottomSheet';

/** Passo a passo para quando o navegador não deixa instalar com um toque (iPhone e alguns navegadores). */
export default function InstallHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const steps =
    open && isIosDevice()
      ? [
          'Toque em Compartilhar, na barra do Safari.',
          'Role e escolha "Adicionar à Tela de Início".',
          'Toque em "Adicionar" para confirmar.',
        ]
      : [
          'Abra o menu do navegador (⋮ ou ⋯).',
          'Escolha "Instalar aplicativo" ou "Adicionar à tela inicial".',
          'Confirme para criar o atalho.',
        ];

  return (
    <BottomSheet open={open} onClose={onClose} titleId={titleId}>
      <h2 id={titleId} className="text-[17px] font-extrabold text-gray-900">
        Adicionar à tela inicial
      </h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] text-gray-800">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-brand-primary text-[14px] font-bold text-white"
      >
        Entendi
      </button>
    </BottomSheet>
  );
}
