'use client';

import { whatsappUrl } from '@sysjb/contracts';
import { useCallback, useRef } from 'react';
import { supportContactAction } from '@/app/support-actions';
import { useToast } from '@/components/ui/Toast';

/**
 * Abre o WhatsApp do atendimento (promotor vinculado ou a banca; quem decide é a API). A aba é aberta já no
 * toque e recebe o endereço depois da consulta: aberta só depois da espera, o navegador a bloquearia como pop-up.
 */
export function useOpenSupport(): () => Promise<void> {
  const toast = useToast();
  const busy = useRef(false);

  return useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const win = window.open('', '_blank');
    try {
      const { phone, message } = await supportContactAction();
      if (!phone) {
        win?.close();
        toast.show('Atendimento indisponível no momento.');
        return;
      }
      const url = whatsappUrl(phone, message);
      if (win) {
        win.opener = null; // A página do WhatsApp não controla o app.
        win.location.href = url;
      } else {
        window.location.href = url; // Pop-up bloqueado: abre na mesma aba.
      }
    } catch {
      win?.close();
      toast.show('Não foi possível abrir o atendimento. Tente novamente.');
    } finally {
      busy.current = false;
    }
  }, [toast]);
}
