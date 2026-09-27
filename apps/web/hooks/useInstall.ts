'use client';

import { useSyncExternalStore } from 'react';
import { getInstallStatus, type InstallStatus, promptInstall, subscribeInstall } from '@/lib/pwa-install';

export interface UseInstallResult {
  status: InstallStatus;
  install: typeof promptInstall;
}

/** Estado da instalação do app na tela inicial e o pedido de instalação. */
export function useInstall(): UseInstallResult {
  const status = useSyncExternalStore<InstallStatus>(subscribeInstall, getInstallStatus, () => 'unknown');
  return { status, install: promptInstall };
}
