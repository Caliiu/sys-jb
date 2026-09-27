import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** O módulo guarda estado (o aviso do navegador chega uma vez só): cada teste carrega uma cópia limpa. */
async function loadFresh() {
  vi.resetModules();
  return import('./pwa-install');
}

function beforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

const matchMedia = (matches: boolean) => vi.fn().mockReturnValue({ matches });

beforeEach(() => {
  window.matchMedia = matchMedia(false) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
});

describe('estado da instalação', () => {
  it('sem aviso do navegador, é instalação manual', async () => {
    const { getInstallStatus } = await loadFresh();
    expect(getInstallStatus()).toBe('manual');
  });

  it('já rodando como app (standalone), conta como instalado', async () => {
    window.matchMedia = matchMedia(true) as unknown as typeof window.matchMedia;
    const { getInstallStatus } = await loadFresh();
    expect(getInstallStatus()).toBe('installed');
  });

  it('iOS: navigator.standalone também conta como instalado', async () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const { getInstallStatus } = await loadFresh();
    expect(getInstallStatus()).toBe('installed');
    Reflect.deleteProperty(navigator, 'standalone');
  });

  it('o aviso do navegador vira "promptable", suprime a barrinha do navegador e avisa os ouvintes', async () => {
    const { getInstallStatus, subscribeInstall } = await loadFresh();
    const listener = vi.fn();
    subscribeInstall(listener);

    const event = beforeInstallPrompt();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(getInstallStatus()).toBe('promptable');
    expect(listener).toHaveBeenCalled();
  });

  it('"appinstalled" marca como instalado e descarta o pedido guardado', async () => {
    const { getInstallStatus, promptInstall } = await loadFresh();
    window.dispatchEvent(beforeInstallPrompt());
    window.dispatchEvent(new Event('appinstalled'));
    expect(getInstallStatus()).toBe('installed');
    expect(await promptInstall()).toBe('unavailable');
  });

  it('deixar de ouvir funciona', async () => {
    const { subscribeInstall } = await loadFresh();
    const listener = vi.fn();
    const unsubscribe = subscribeInstall(listener);
    unsubscribe();
    window.dispatchEvent(beforeInstallPrompt());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('promptInstall', () => {
  it('sem pedido guardado, informa que não há como (a tela mostra o passo a passo)', async () => {
    const { promptInstall } = await loadFresh();
    expect(await promptInstall()).toBe('unavailable');
  });

  it('abre o pedido, devolve a escolha do usuário e só vale uma vez', async () => {
    const { getInstallStatus, promptInstall } = await loadFresh();
    const event = beforeInstallPrompt('accepted');
    window.dispatchEvent(event);

    expect(await promptInstall()).toBe('accepted');
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(getInstallStatus()).toBe('manual'); // o pedido foi consumido
    expect(await promptInstall()).toBe('unavailable');
  });

  it('recusa do usuário é devolvida como "dismissed"', async () => {
    const { promptInstall } = await loadFresh();
    window.dispatchEvent(beforeInstallPrompt('dismissed'));
    expect(await promptInstall()).toBe('dismissed');
  });
});

describe('isIosDevice', () => {
  const setNavigator = (userAgent: string, platform = 'Win32', maxTouchPoints = 0) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
    // O jsdom não tem maxTouchPoints: define a propriedade em vez de espiar o getter.
    Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
  };

  it('reconhece iPhone, iPad e iPadOS (que se apresenta como Mac com toque)', async () => {
    const { isIosDevice } = await loadFresh();
    setNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isIosDevice()).toBe(true);
    setNavigator('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)');
    expect(isIosDevice()).toBe(true);
    setNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 5);
    expect(isIosDevice()).toBe(true);
  });

  it('não confunde Mac sem toque, Android nem Windows', async () => {
    const { isIosDevice } = await loadFresh();
    setNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 0);
    expect(isIosDevice()).toBe(false);
    setNavigator('Mozilla/5.0 (Linux; Android 14) Chrome/120', 'Linux armv8l', 5);
    expect(isIosDevice()).toBe(false);
    setNavigator('Mozilla/5.0 (Windows NT 10.0) Chrome/120');
    expect(isIosDevice()).toBe(false);
  });
});
