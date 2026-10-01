'use client';

import { ChevronRight, CircleAlert, Eye, EyeOff, Lock, X } from 'lucide-react';
import { useState } from 'react';

interface PasswordPanelProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

const PANEL_ID = 'profile-password-panel';

const lockBadge = (
  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-200/70">
    <Lock className="h-4 w-4 text-gray-500" />
  </span>
);

/** "Alterar senha": um cartão que abre o campo "Nova senha" (em branco = não altera). */
export default function PasswordPanel({ open, onOpen, onClose, value, onChange, error }: PasswordPanelProps) {
  const [visible, setVisible] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        aria-controls={PANEL_ID}
        className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-[#F8F8F8] px-3.5 py-3 text-left active:scale-[0.99] transition-transform"
      >
        {lockBadge}
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-gray-900">Alterar senha</span>
          <span className="block text-[12px] text-gray-500">Clique para alterar sua senha</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
      </button>
    );
  }

  return (
    <section id={PANEL_ID} className="rounded-xl border border-gray-200 bg-[#F8F8F8] p-3.5">
      <div className="flex items-center gap-3">
        {lockBadge}
        <label htmlFor="profile-password" className="flex-1 text-[14px] font-bold text-gray-900">
          Nova senha
        </label>
        <button
          type="button"
          onClick={() => {
            setVisible(false);
            onClose();
          }}
          aria-label="Cancelar alteração de senha"
          className="flex h-8 w-8 items-center justify-center text-gray-500"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="relative mt-3">
        <input
          id="profile-password"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Digite sua nova senha"
          autoComplete="new-password"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'profile-password-error' : 'profile-password-hint'}
          className={`h-11 w-full rounded-xl border bg-white pl-3.5 pr-11 text-[16px] text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand-primary/40 ${
            error ? 'border-red-400' : 'border-gray-200'
          }`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-brand-orange"
        >
          {visible ? (
            <EyeOff className="h-4.5 w-4.5" size={18} aria-hidden />
          ) : (
            <Eye className="h-4.5 w-4.5" size={18} aria-hidden />
          )}
        </button>
      </div>

      {error ? (
        <p id="profile-password-error" role="alert" className="mt-2 text-[12.5px] font-semibold text-red-700">
          {error}
        </p>
      ) : (
        <p id="profile-password-hint" className="mt-2 flex items-center gap-1.5 text-[12px] text-gray-500">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Deixe em branco se não quiser alterar
        </p>
      )}
    </section>
  );
}
