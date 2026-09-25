'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { X, Copy, Share2 } from 'lucide-react';
import { useOverlay } from '@/hooks/useOverlay';
import TenantLogo from '../tenant/TenantLogo';
import WhatsAppIcon from '../icons/WhatsAppIcon';
import QrCode from '../ui/QrCode';

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  /** Código de convite do usuário (hoje, o displayId). */
  inviteCode: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Convite (visual do app original). Mudanças: o link usa o domínio da banca e leva ao cadastro;
 * o QR é real; copiar/compartilhar tratam falhas; o texto não promete recompensa, porque o
 * crédito por indicação ainda não existe.
 */
export default function InviteModal({ open, onClose, inviteCode }: InviteModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [copyState, setCopyState] = useState<CopyState>('idle');
  // Abre com animação mesmo na primeira montagem (o modal é carregado sob demanda).
  const [visible, setVisible] = useState(false);
  // Carregado só no navegador (ssr: false): window existe aqui.
  const inviteLink = useMemo(
    () => `${window.location.origin}/cadastro?convite=${encodeURIComponent(inviteCode)}`,
    [inviteCode],
  );

  useOverlay(open, onClose, panelRef);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(open));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopyState('copied');
    } catch {
      // Sem permissão/contexto seguro: seleciona o link para cópia manual.
      linkRef.current?.select();
      setCopyState('failed');
    }
  }

  async function handleShare() {
    if (!navigator.share) {
      await handleCopy();
      return;
    }
    try {
      await navigator.share({ url: inviteLink });
    } catch (err) {
      // Cancelar o compartilhamento não é erro.
      if (!(err instanceof DOMException && err.name === 'AbortError')) await handleCopy();
    }
  }

  return (
    <div
      onClick={onClose}
      inert={!open}
      className={`fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm transition-opacity ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[480px] bg-white rounded-t-2xl px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] transition-transform duration-300 ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-[17px] font-extrabold text-brand-primary">
            Escaneie o QR de convite
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X className="w-5 h-5 text-gray-400" aria-hidden />
          </button>
        </div>
        <p className="text-[12.5px] text-gray-500 text-center mt-1">
          Convide seus amigos para se cadastrar com o seu link
        </p>

        <div className="flex items-center justify-center mt-5">
          <div className="relative w-40 h-40 bg-gray-100 rounded-2xl flex items-center justify-center">
            <QrCode
              value={inviteLink}
              size={128}
              title="QR code do link de convite"
              className="text-gray-900 rounded-md"
            />
            <span className="absolute bg-white rounded-md p-0.5 shadow-card">
              <TenantLogo size={32} decorative />
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-5 bg-gray-100 rounded-xl px-4 py-3">
          <input
            ref={linkRef}
            readOnly
            value={inviteLink}
            aria-label="Link de convite"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-gray-600 outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 active:scale-95 transition-transform"
            aria-label="Copiar link"
          >
            <Copy className="w-4.5 h-4.5 text-brand-primary" size={18} aria-hidden />
          </button>
        </div>
        <p role="status" className="min-h-4 text-[11px] text-center mt-1">
          {copyState === 'copied' && <span className="text-brand-teal">Link copiado!</span>}
          {copyState === 'failed' && (
            <span className="text-gray-500">Não foi possível copiar. Copie o link selecionado.</span>
          )}
        </p>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(inviteLink)}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center gap-2 bg-gray-100 rounded-xl py-4 active:scale-[0.98] transition-transform"
          >
            <WhatsAppIcon className="w-6 h-6 text-brand-primary" aria-hidden />
            <span className="text-[13px] font-bold text-brand-primary">Whatsapp</span>
          </a>
          <button
            type="button"
            onClick={handleShare}
            className="flex flex-col items-center gap-2 bg-gray-100 rounded-xl py-4 active:scale-[0.98] transition-transform"
          >
            <Share2 className="w-6 h-6 text-gray-700" aria-hidden />
            <span className="text-[13px] font-bold text-gray-800">Compartilhar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
