import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Chave pública VAPID de teste (65 bytes em base64url, começa em 0x04). */
const KEY_BYTES = new Uint8Array(65).map((_, i) => (i === 0 ? 4 : i));
const PUBLIC_KEY = btoa(String.fromCharCode(...KEY_BYTES))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

interface FakeSubscription {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function fakeSubscription(endpoint: string, key: Uint8Array = KEY_BYTES): FakeSubscription {
  return {
    endpoint,
    options: { applicationServerKey: key.slice().buffer },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

let permission: NotificationPermission;
let answer: (value: NotificationPermission) => void;
let current: FakeSubscription | null;
const requestPermission = vi.fn(
  () =>
    new Promise<NotificationPermission>((resolve) => {
      answer = (value) => {
        permission = value;
        resolve(value);
      };
    }),
);
const pushManager = {
  getSubscription: vi.fn(async () => current),
  subscribe: vi.fn(async () => (current = fakeSubscription('https://fcm.googleapis.com/fcm/send/novo'))),
};
const register = vi.fn(async () => ({}));

function installBrowser({ standalone }: { standalone: boolean }) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });
  Object.defineProperty(window, 'Notification', {
    value: {
      get permission() {
        return permission;
      },
      requestPermission,
    },
    configurable: true,
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { register, ready: Promise.resolve({ pushManager }), getRegistration: async () => ({ pushManager }) },
    configurable: true,
  });
  window.matchMedia = vi.fn(
    (query: string) => ({ matches: standalone && query === '(display-mode: standalone)' }) as MediaQueryList,
  );
}

async function load() {
  vi.resetModules();
  const actions = await import('@/app/push-actions');
  vi.mocked(actions.savePushSubscriptionAction).mockClear();
  vi.mocked(actions.removePushSubscriptionAction).mockClear();
  const client = await import('./push-client');
  return {
    ...client,
    save: vi.mocked(actions.savePushSubscriptionAction),
    remove: vi.mocked(actions.removePushSubscriptionAction),
  };
}

beforeEach(() => {
  permission = 'default';
  current = null;
  requestPermission.mockClear();
  pushManager.getSubscription.mockClear();
  pushManager.subscribe.mockClear();
  register.mockClear();
});

describe('notificações no navegador', () => {
  it('no login, só o app instalado pede a permissão, e só se o jogador ainda não respondeu', async () => {
    installBrowser({ standalone: false });
    let push = await load();
    push.askPushOnLogin(PUBLIC_KEY);
    expect(requestPermission).not.toHaveBeenCalled();

    installBrowser({ standalone: true });
    push = await load();
    push.askPushOnLogin(null);
    permission = 'denied';
    push.askPushOnLogin(PUBLIC_KEY);
    expect(requestPermission).not.toHaveBeenCalled();

    permission = 'default';
    push.askPushOnLogin(PUBLIC_KEY);
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('permitido no login: inscreve com a chave da plataforma e manda para a API quando a conta abre', async () => {
    installBrowser({ standalone: true });
    const push = await load();
    push.askPushOnLogin(PUBLIC_KEY);
    // A conta abre antes de o jogador responder: o envio espera a resposta.
    const syncing = push.syncPush(PUBLIC_KEY);
    answer('granted');
    await syncing;

    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: KEY_BYTES });
    expect(push.save).toHaveBeenCalledWith({
      endpoint: 'https://fcm.googleapis.com/fcm/send/novo',
      expirationTime: null,
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('negado: nada é inscrito nem enviado', async () => {
    installBrowser({ standalone: true });
    const push = await load();
    push.askPushOnLogin(PUBLIC_KEY);
    const syncing = push.syncPush(PUBLIC_KEY);
    answer('denied');
    await syncing;
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(push.save).not.toHaveBeenCalled();
  });

  it('app aberto de novo: reaproveita a inscrição; feita com outra chave é refeita', async () => {
    installBrowser({ standalone: true });
    permission = 'granted';
    const same = fakeSubscription('https://fcm.googleapis.com/fcm/send/antigo');
    current = same;
    let push = await load();
    await push.syncPush(PUBLIC_KEY);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(push.save).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: same.endpoint }));

    const other = fakeSubscription('https://fcm.googleapis.com/fcm/send/outra-chave', new Uint8Array(65).fill(9));
    current = other;
    push = await load();
    await push.syncPush(PUBLIC_KEY);
    expect(other.unsubscribe).toHaveBeenCalled();
    expect(push.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/novo' }),
    );
  });

  it('sem chave ou sem suporte: não faz nada', async () => {
    installBrowser({ standalone: true });
    permission = 'granted';
    let push = await load();
    await push.syncPush(null);
    // Navegador sem Web Push (ex.: Safari numa aba, fora do app instalado).
    delete (window as unknown as Record<string, unknown>).PushManager;
    push = await load();
    await push.syncPush(PUBLIC_KEY);
    expect(push.save).not.toHaveBeenCalled();
  });

  it('ao sair: tira o aparelho da conta e cancela a inscrição', async () => {
    installBrowser({ standalone: true });
    const subscription = fakeSubscription('https://fcm.googleapis.com/fcm/send/meu');
    current = subscription;
    const push = await load();
    await push.leavePush();
    expect(push.remove).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/meu');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('falha na API não impede a saída', async () => {
    installBrowser({ standalone: true });
    current = fakeSubscription('https://fcm.googleapis.com/fcm/send/meu');
    const push = await load();
    push.remove.mockRejectedValueOnce(new Error('rede'));
    await expect(push.leavePush()).resolves.toBeUndefined();
  });
});
