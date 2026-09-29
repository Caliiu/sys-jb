import type { PublicUser } from '@sysjb/contracts';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsStorageKey } from '@/lib/settings';
import { renderWithProviders, router, tenant, user } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/auth-actions', () => ({ meAction: vi.fn() }));

const { default: SettingsPage } = await import('./SettingsPage');

const QUICK_BET = 'Aposta rápida';
const NOTIFICATIONS = 'Permitir notificações';
const SHOW_PRIZE = 'Exibir possível prêmio';

const storedSettings = (person: PublicUser = user) => window.localStorage.getItem(settingsStorageKey(person.id));

function renderSettings(person: PublicUser = user, version = '1.2.3') {
  return renderWithProviders(<SettingsPage tenant={tenant} user={person} version={version} />);
}

const toggle = (name: string) => screen.getByRole('switch', { name });

type NotificationMock = { permission: NotificationPermission; requestPermission: ReturnType<typeof vi.fn> };

/** Simula a API de notificações do navegador; `result` é o que o usuário escolhe ao ser perguntado. */
function mockNotification(initial: NotificationPermission, result: NotificationPermission = 'granted') {
  const api: NotificationMock = {
    permission: initial,
    requestPermission: vi.fn().mockImplementation(() => {
      api.permission = result;
      return Promise.resolve(result);
    }),
  };
  vi.stubGlobal('Notification', api);
  return api;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  mockNotification('default');
});
afterEach(() => vi.unstubAllGlobals());

describe('Configurações: tela', () => {
  it('mostra título, as três preferências com os padrões do design e a versão', () => {
    renderSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');

    expect(toggle(QUICK_BET)).toBeChecked();
    expect(toggle(NOTIFICATIONS)).not.toBeChecked();
    expect(toggle(SHOW_PRIZE)).toBeChecked();
    expect(screen.getByText('V1.2.3')).toBeInTheDocument();
  });

  it('cada interruptor é nomeado e descrito para leitor de tela', () => {
    renderSettings();
    expect(toggle(QUICK_BET)).toHaveAccessibleDescription(/repetindo seleção de DATA, LOTERIA e COTAÇÃO/);
    expect(toggle(NOTIFICATIONS)).toHaveAccessibleDescription('Permite receber notificações do aplicativo.');
    expect(toggle(SHOW_PRIZE)).toHaveAccessibleDescription(/possível prêmio nos recibos das suas apostas/);
  });
});

describe('Configurações: preferências', () => {
  it('alternar aplica na hora e guarda por usuário', async () => {
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(QUICK_BET));
    expect(toggle(QUICK_BET)).not.toBeChecked();
    expect(JSON.parse(storedSettings()!)).toEqual({ quickBet: false, notifications: false, showPrize: true });

    await ui.click(toggle(SHOW_PRIZE));
    expect(JSON.parse(storedSettings()!)).toEqual({ quickBet: false, notifications: false, showPrize: false });
  });

  it('funciona pelo teclado (Espaço e Enter)', async () => {
    const ui = userEvent.setup();
    renderSettings();
    toggle(SHOW_PRIZE).focus();
    await ui.keyboard(' ');
    expect(toggle(SHOW_PRIZE)).not.toBeChecked();
    await ui.keyboard('{Enter}');
    expect(toggle(SHOW_PRIZE)).toBeChecked();
  });

  it('as escolhas permanecem ao abrir a tela de novo', async () => {
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(QUICK_BET));
    cleanup();

    renderSettings();
    expect(toggle(QUICK_BET)).not.toBeChecked();
    expect(toggle(SHOW_PRIZE)).toBeChecked();
  });

  it('são por usuário: outro usuário no mesmo navegador começa com os padrões', async () => {
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(QUICK_BET));
    cleanup();

    renderSettings({ ...user, id: '9f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' });
    expect(toggle(QUICK_BET)).toBeChecked();
  });

  it('dado adulterado no armazenamento é ignorado (padrões), sem quebrar', () => {
    window.localStorage.setItem(settingsStorageKey(user.id), '{"quickBet":"nao","showPrize":null}');
    renderSettings();
    expect(toggle(QUICK_BET)).toBeChecked();
    expect(toggle(SHOW_PRIZE)).toBeChecked();

    cleanup();
    window.localStorage.setItem(settingsStorageKey(user.id), 'isso não é json');
    renderSettings();
    expect(toggle(QUICK_BET)).toBeChecked();
  });

  it('sem armazenamento no navegador, a tela abre normalmente (só não lembra)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    renderSettings();
    expect(toggle(QUICK_BET)).toBeChecked();
    await userEvent.setup().click(toggle(QUICK_BET));
    expect(toggle(QUICK_BET)).toBeChecked(); // nada guardado: continua no padrão
    vi.restoreAllMocks();
  });
});

describe('Configurações: notificações', () => {
  it('ligar pede a permissão ao navegador e, se concedida, liga e guarda', async () => {
    const api = mockNotification('default', 'granted');
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(NOTIFICATIONS));

    expect(api.requestPermission).toHaveBeenCalledOnce();
    await waitFor(() => expect(toggle(NOTIFICATIONS)).toBeChecked());
    expect(JSON.parse(storedSettings()!)).toMatchObject({ notifications: true });
  });

  it('se o usuário nega o pedido, continua desligado (e a preferência não é gravada como ligada)', async () => {
    const api = mockNotification('default', 'denied');
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(NOTIFICATIONS));

    expect(api.requestPermission).toHaveBeenCalledOnce();
    expect(toggle(NOTIFICATIONS)).not.toBeChecked();
    expect(JSON.parse(storedSettings()!)).toMatchObject({ notifications: false });
    // Bloqueada: o interruptor fica desabilitado e explica o que fazer.
    await waitFor(() => expect(toggle(NOTIFICATIONS)).toBeDisabled());
    expect(screen.getByText(/bloqueadas neste navegador/)).toBeInTheDocument();
  });

  it('fechar o pedido sem decidir também deixa desligado, sem bloquear', async () => {
    mockNotification('default', 'default');
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(NOTIFICATIONS));
    expect(toggle(NOTIFICATIONS)).not.toBeChecked();
    expect(toggle(NOTIFICATIONS)).toBeEnabled();
  });

  it('já bloqueado no navegador: desabilitado, com aviso, e nada é pedido', async () => {
    const api = mockNotification('denied');
    renderSettings();
    expect(toggle(NOTIFICATIONS)).toBeDisabled();
    expect(
      screen.getByText(
        'As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar.',
      ),
    ).toBeInTheDocument();
    await userEvent.setup().click(toggle(NOTIFICATIONS));
    expect(api.requestPermission).not.toHaveBeenCalled();
  });

  it('navegador sem suporte a notificações: desabilitado, com aviso', () => {
    vi.stubGlobal('Notification', undefined);
    renderSettings();
    expect(toggle(NOTIFICATIONS)).toBeDisabled();
    expect(screen.getByText('Este navegador não suporta notificações.')).toBeInTheDocument();
  });

  it('permissão já concedida: liga direto, sem perguntar de novo', async () => {
    const api = mockNotification('granted');
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(NOTIFICATIONS));
    expect(api.requestPermission).not.toHaveBeenCalled();
    expect(toggle(NOTIFICATIONS)).toBeChecked();
  });

  it('desligar não mexe na permissão do navegador e guarda a escolha', async () => {
    const api = mockNotification('granted');
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(NOTIFICATIONS));
    await ui.click(toggle(NOTIFICATIONS));
    expect(toggle(NOTIFICATIONS)).not.toBeChecked();
    expect(api.permission).toBe('granted');
    expect(JSON.parse(storedSettings()!)).toMatchObject({ notifications: false });
  });

  it('ligada antes, mas a permissão foi revogada depois: aparece desligada (nunca "ligada sem poder")', () => {
    window.localStorage.setItem(
      settingsStorageKey(user.id),
      JSON.stringify({ quickBet: true, notifications: true, showPrize: true }),
    );
    mockNotification('denied');
    renderSettings();
    expect(toggle(NOTIFICATIONS)).not.toBeChecked();
  });

  it('ligada e com permissão: aparece ligada ao abrir', () => {
    window.localStorage.setItem(
      settingsStorageKey(user.id),
      JSON.stringify({ quickBet: true, notifications: true, showPrize: true }),
    );
    mockNotification('granted');
    renderSettings();
    expect(toggle(NOTIFICATIONS)).toBeChecked();
  });

  it('o pedido em andamento trava o interruptor (sem pedidos duplicados)', async () => {
    let finish: (value: NotificationPermission) => void = () => {};
    const api = mockNotification('default');
    api.requestPermission.mockReturnValue(new Promise<NotificationPermission>((resolve) => (finish = resolve)));
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(toggle(NOTIFICATIONS));
    expect(toggle(NOTIFICATIONS)).toBeDisabled();
    await ui.click(toggle(NOTIFICATIONS));
    expect(api.requestPermission).toHaveBeenCalledOnce();

    api.permission = 'granted';
    finish('granted');
    await waitFor(() => expect(toggle(NOTIFICATIONS)).toBeChecked());
  });
});

describe('Configurações: baixar aplicativo', () => {
  it('sem pedido do navegador, o banner abre o passo a passo (navegador comum)', async () => {
    const ui = userEvent.setup();
    renderSettings();
    const banner = screen.getByRole('button', { name: /Baixar aplicativo/ });
    expect(within(banner).getByText('Adicionar à tela inicial')).toBeInTheDocument();

    await ui.click(banner);
    const sheet = screen.getByRole('dialog', { name: 'Adicionar à tela inicial' });
    expect(within(sheet).getByText(/Instalar aplicativo/)).toBeInTheDocument();
    expect(within(sheet).queryByText(/Safari/)).toBeNull();

    await ui.keyboard('{Escape}');
    // A folha desce deslizando antes de sair.
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adicionar à tela inicial' })).toBeNull());
  });

  it('no iPhone, o passo a passo fala do Compartilhar do Safari', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    const ui = userEvent.setup();
    renderSettings();
    await ui.click(screen.getByRole('button', { name: /Baixar aplicativo/ }));
    const sheet = screen.getByRole('dialog', { name: 'Adicionar à tela inicial' });
    expect(within(sheet).getByText(/Compartilhar/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('com o pedido do navegador disponível, um toque abre a instalação (sem passo a passo)', async () => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: ReturnType<typeof vi.fn>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'accepted' });

    const ui = userEvent.setup();
    renderSettings();
    window.dispatchEvent(event);
    await ui.click(await screen.findByRole('button', { name: /Baixar aplicativo/ }));

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Adicionar à tela inicial' })).toBeNull();
  });

  it('já instalado (aberto como app), o banner não aparece', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    vi.resetModules();
    renderSettings();
    // O módulo de instalação já estava carregado: o estado "instalado" vem do display-mode lido na hora.
    expect(screen.queryByRole('button', { name: /Baixar aplicativo/ })).toBeNull();
  });
});
