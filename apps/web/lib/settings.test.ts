import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, settingsStorageKey } from './settings';

describe('parseSettings', () => {
  it('sem nada guardado, valem os padrões do design (aposta rápida e prêmio ligados, notificações desligadas)', () => {
    expect(parseSettings(null)).toEqual({ quickBet: true, notifications: false, showPrize: true });
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
  });

  it('lê o que foi guardado', () => {
    const raw = JSON.stringify({ quickBet: false, notifications: true, showPrize: false });
    expect(parseSettings(raw)).toEqual({ quickBet: false, notifications: true, showPrize: false });
  });

  it('preferência ausente (versão antiga) fica no padrão, sem afetar as outras', () => {
    expect(parseSettings(JSON.stringify({ quickBet: false }))).toEqual({
      quickBet: false,
      notifications: false,
      showPrize: true,
    });
  });

  it('texto inválido ou de outro formato volta aos padrões (nunca erro)', () => {
    for (const raw of ['lixo', '{', '[]', '[true]', '"texto"', '123', 'null', 'true']) {
      expect(parseSettings(raw), raw).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('só booleano vale: "false", 0, null e objetos guardados à mão são ignorados', () => {
    const raw = JSON.stringify({ quickBet: 'false', notifications: 1, showPrize: null });
    expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ quickBet: { valueOf: 0 } }))).toEqual(DEFAULT_SETTINGS);
  });

  it('ignora chaves desconhecidas e não deixa "__proto__" contaminar o resultado', () => {
    const parsed = parseSettings('{"quickBet":false,"admin":true,"__proto__":{"showPrize":false}}');
    expect(parsed).toEqual({ quickBet: false, notifications: false, showPrize: true });
    expect(Object.keys(parsed).sort()).toEqual(['notifications', 'quickBet', 'showPrize']);
    expect(({} as Record<string, unknown>).showPrize).toBeUndefined();
  });

  it('não altera o objeto de padrões', () => {
    parseSettings(JSON.stringify({ quickBet: false }));
    expect(DEFAULT_SETTINGS.quickBet).toBe(true);
  });
});

describe('serializeSettings', () => {
  it('guarda só as preferências conhecidas e é o inverso de parseSettings', () => {
    const settings = { quickBet: false, notifications: true, showPrize: true };
    expect(parseSettings(serializeSettings(settings))).toEqual(settings);
    const extra = { ...settings, intruso: 'x' } as typeof settings;
    expect(Object.keys(JSON.parse(serializeSettings(extra))).sort()).toEqual([
      'notifications',
      'quickBet',
      'showPrize',
    ]);
  });
});

describe('settingsStorageKey', () => {
  it('é por usuário', () => {
    expect(settingsStorageKey('a')).not.toBe(settingsStorageKey('b'));
  });
});
