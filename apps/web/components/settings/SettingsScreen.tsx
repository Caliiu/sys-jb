'use client';

import { useState } from 'react';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useSettings } from '@/hooks/useSettings';
import SectionBar from '../section/SectionBar';
import InstallBanner from './InstallBanner';
import SettingRow from './SettingRow';

interface SettingsScreenProps {
  userId: string;
  /** Versão do app (vem do servidor). */
  version: string;
}

const NOTIFICATION_NOTES = {
  denied: 'As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar.',
  unsupported: 'Este navegador não suporta notificações.',
} as const;

/** Configurações: preferências aplicadas na hora (guardadas por usuário neste navegador) e instalação do app. */
export default function SettingsScreen({ userId, version }: SettingsScreenProps) {
  const { settings, setSetting } = useSettings(userId);
  const { permission, request } = useNotificationPermission();
  const [requesting, setRequesting] = useState(false);

  // Ligada só se o usuário quer E o navegador permite: se ele revogar a permissão depois, volta a aparecer desligada.
  const notificationsOn = settings.notifications && permission === 'granted';
  const blocked = permission === 'denied' || permission === 'unsupported';

  async function toggleNotifications(next: boolean) {
    if (!next) return setSetting('notifications', false);
    setRequesting(true);
    try {
      const result = permission === 'granted' ? 'granted' : await request();
      setSetting('notifications', result === 'granted');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <>
      <SectionBar title="Configurações" />
      <main className="pb-28">
        <SettingRow
          id="setting-quick-bet"
          label="Aposta rápida"
          description="Ativa o botão + PULE, que permite iniciar uma nova aposta repetindo seleção de DATA, LOTERIA e COTAÇÃO."
          checked={settings.quickBet}
          onChange={(next) => setSetting('quickBet', next)}
        />
        <SettingRow
          id="setting-notifications"
          label="Permitir notificações"
          description="Permite receber notificações do aplicativo."
          checked={notificationsOn}
          onChange={toggleNotifications}
          disabled={blocked || requesting}
          note={permission === 'denied' || permission === 'unsupported' ? NOTIFICATION_NOTES[permission] : undefined}
        />
        <SettingRow
          id="setting-show-prize"
          label="Exibir possível prêmio"
          description="Mostra ou oculta o valor de possível prêmio nos recibos das suas apostas."
          checked={settings.showPrize}
          onChange={(next) => setSetting('showPrize', next)}
        />
        <p className="px-4 py-3 text-right text-[13px] font-semibold text-gray-400">V{version}</p>
      </main>
      <InstallBanner />
    </>
  );
}
