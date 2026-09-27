'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** 'unknown': ainda no servidor/antes de hidratar. 'unsupported': o navegador não tem notificações. */
export type NotificationSupport = 'unknown' | 'unsupported' | NotificationPermission;

const CHANGED_EVENT = 'sysjb:notification-permission-changed';

function getSnapshot(): NotificationSupport {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

function subscribe(onChange: () => void): () => void {
  let status: PermissionStatus | null = null;
  let disposed = false;

  // O usuário pode liberar ou bloquear nas configurações do site: o navegador avisa por aqui...
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((result) => {
      if (disposed) return;
      status = result;
      result.addEventListener('change', onChange);
    })
    .catch(() => undefined); // navegador sem essa consulta: ver também o foco da janela, abaixo
  // ...e, onde não avisa, ao voltar para a janela a permissão é lida de novo.
  window.addEventListener('focus', onChange);
  window.addEventListener(CHANGED_EVENT, onChange);

  return () => {
    disposed = true;
    status?.removeEventListener('change', onChange);
    window.removeEventListener('focus', onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

export interface UseNotificationPermissionResult {
  permission: NotificationSupport;
  /** Pede a permissão ao navegador (só abre o pedido se ainda não foi decidida). Devolve o resultado. */
  request: () => Promise<NotificationSupport>;
}

/** Permissão de notificações do navegador, sempre em dia com o que o usuário decidiu. */
export function useNotificationPermission(): UseNotificationPermissionResult {
  const permission = useSyncExternalStore<NotificationSupport>(subscribe, getSnapshot, () => 'unknown');

  const request = useCallback(async (): Promise<NotificationSupport> => {
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    } finally {
      window.dispatchEvent(new Event(CHANGED_EVENT));
    }
  }, []);

  return { permission, request };
}
