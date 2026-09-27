'use client';

import { useCallback, useMemo } from 'react';
import {
  parseSettings,
  type SettingKey,
  serializeSettings,
  settingsStorageKey,
  type UserSettings,
} from '@/lib/settings';
import { useLocalStorageItem } from './useLocalStorageItem';

export interface UseSettingsResult {
  settings: UserSettings;
  setSetting: (key: SettingKey, value: boolean) => void;
}

/**
 * Preferências do usuário, guardadas neste navegador (por usuário) e aplicadas na hora, sem botão salvar.
 * No servidor e antes de hidratar, valem os padrões.
 */
export function useSettings(userId: string): UseSettingsResult {
  const { raw, read, write } = useLocalStorageItem(settingsStorageKey(userId));
  const settings = useMemo(() => parseSettings(raw), [raw]);

  const setSetting = useCallback(
    (key: SettingKey, value: boolean) => write(serializeSettings({ ...parseSettings(read()), [key]: value })),
    [write, read],
  );

  return { settings, setSetting };
}
