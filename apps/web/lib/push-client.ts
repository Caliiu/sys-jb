import { removePushSubscriptionAction, savePushSubscriptionAction } from '@/app/push-actions';

/**
 * Notificações do app instalado, no navegador. Fluxo:
 * 1. No toque em "Entrar" (askPushOnLogin), o sistema mostra a janela de permissão. Precisa ser no toque: o iPhone só
 *    deixa pedir em resposta a um gesto do usuário. Só no app instalado e só se o jogador ainda não respondeu.
 * 2. Com a conta aberta (syncPush, a cada abertura do app), a inscrição do aparelho vai para a API.
 * 3. Ao sair (leavePush), o aparelho sai da conta e a inscrição é cancelada.
 * Nada aqui impede o login ou a saída: falhas são ignoradas (o app funciona igual sem notificações).
 */

/** Inscrição feita no login, à espera da sessão para ser enviada. */
let pendingFromLogin: Promise<PushSubscription | null> | null = null;

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Rodando como app instalado (tela inicial), não numa aba do navegador. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!current || current.byteLength !== expected.length) return false;
  const bytes = new Uint8Array(current);
  return bytes.every((byte, i) => byte === expected[i]);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

/** Inscrição deste aparelho com a chave atual; a feita com outra chave (troca do par VAPID) é refeita. */
async function subscribe(publicKey: string): Promise<PushSubscription> {
  const key = base64UrlToBytes(publicKey);
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing.options.applicationServerKey, key)) return existing;
  await existing?.unsubscribe();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/** No toque em "Entrar": abre a janela de permissão do sistema (sem esperar a resposta: o login segue junto). */
export function askPushOnLogin(publicKey: string | null): void {
  if (!publicKey || !pushSupported() || !isStandalone() || Notification.permission !== 'default') return;
  pendingFromLogin = Notification.requestPermission()
    .then((permission) => (permission === 'granted' ? subscribe(publicKey) : null))
    .catch(() => null);
}

/** Com a conta aberta: manda a inscrição deste aparelho para a API (renovada a cada abertura do app). */
export async function syncPush(publicKey: string | null): Promise<void> {
  if (!publicKey || !pushSupported()) return;
  try {
    // A janela do login pode ainda estar aberta: espera a resposta antes de olhar a permissão.
    const fromLogin = pendingFromLogin ? await pendingFromLogin : null;
    pendingFromLogin = null;
    if (Notification.permission !== 'granted') return;
    const subscription = fromLogin ?? (await subscribe(publicKey));
    await savePushSubscriptionAction(subscription.toJSON());
  } catch {
    // Sem notificações neste aparelho; o app segue normal.
  }
}

/** Antes de sair da conta: este aparelho para de receber as notificações dela. */
export async function leavePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const subscription = await reg?.pushManager.getSubscription();
    if (!subscription) return;
    await removePushSubscriptionAction(subscription.endpoint);
    await subscription.unsubscribe();
  } catch {
    // A saída continua mesmo assim.
  }
}
