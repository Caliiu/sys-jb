/**
 * Instalação do app na tela inicial (PWA). O navegador dispara "beforeinstallprompt" UMA vez, logo depois
 * do carregamento da página: por isso este módulo registra os ouvintes assim que é carregado (a partir do
 * layout raiz, em InstallCapture), e não quando a página de Configurações abre.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Sem isto o navegador mostraria a barrinha própria dele; o pedido passa a ser feito pelo nosso botão.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

/**
 * 'unknown': servidor/antes de hidratar. 'installed': já roda como app (ou acabou de instalar).
 * 'promptable': o navegador permite pedir a instalação com um toque. 'manual': só pelo menu do navegador.
 */
export type InstallStatus = 'unknown' | 'installed' | 'promptable' | 'manual';

export function getInstallStatus(): InstallStatus {
  if (typeof window === 'undefined') return 'unknown';
  if (installed || isStandalone()) return 'installed';
  return deferredPrompt ? 'promptable' : 'manual';
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Abre o pedido de instalação do navegador. 'unavailable': não há pedido guardado (use o passo a passo manual). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt;
  if (!event) return 'unavailable';
  // O evento só vale uma vez; se o usuário recusar, o navegador dispara outro mais tarde.
  deferredPrompt = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome;
}

/** iPhone/iPad (inclusive iPadOS, que se apresenta como Mac): lá a instalação é sempre pelo Compartilhar do Safari. */
export function isIosDevice(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
