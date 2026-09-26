import type { PublicUser } from '@sysjb/contracts';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recentKeysStorageKey } from '@/lib/recent-pix-keys';
import { renderWithProviders, router, tenant, user } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/auth-actions', () => ({ meAction: vi.fn() }));
vi.mock('@/app/withdrawal-actions', () => ({ requestWithdrawalAction: vi.fn() }));

const { default: WithdrawalsPage } = await import('./WithdrawalsPage');

const RANDOM = '123e4567-e89b-42d3-a456-426614174000';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear(); // as chaves recentes ficam no navegador
});

type Ui = ReturnType<typeof userEvent.setup>;

/** Abre a página de saques e entra no fluxo pelo botão "Novo saque" (a URL continua /saques). */
async function openNewWithdrawal(person: PublicUser = user): Promise<Ui> {
  const ui = userEvent.setup();
  renderWithProviders(<WithdrawalsPage tenant={tenant} user={person} />);
  await ui.click(screen.getByRole('button', { name: 'Novo saque' }));
  return ui;
}

const advance = () => screen.getByRole('button', { name: 'Avançar' });
const recentSection = () => screen.queryByRole('region', { name: 'Chaves recentes' });

/** Usa uma chave (chega à etapa 2) e volta à etapa 1, onde as recentes aparecem. */
async function useKeyAndReturn(ui: Ui, type: 'CPF' | 'E-mail', email = '') {
  await ui.click(screen.getByRole('radio', { name: type }));
  if (email) await ui.type(screen.getByLabelText('Chave e-mail'), email);
  await ui.click(advance());
  await ui.click(screen.getByRole('button', { name: 'Voltar' }));
}

describe('Novo saque: chaves recentes', () => {
  it('sem histórico, a seção não aparece', async () => {
    await openNewWithdrawal();
    expect(recentSection()).toBeNull();
  });

  it('uma chave usada vira recente e escolher o botão preenche tipo e campo', async () => {
    const ui = await openNewWithdrawal();
    await useKeyAndReturn(ui, 'E-mail', 'Ana@Example.com');
    expect(recentSection()).not.toBeNull();

    // Trocar de tipo limpa o campo; o botão da recente traz tipo e valor de volta.
    await ui.click(screen.getByRole('radio', { name: 'CPF' }));
    expect(screen.queryByLabelText('Chave e-mail')).toBeNull();

    await ui.click(screen.getByRole('button', { name: 'Usar chave E-mail ana@example.com' }));
    expect(screen.getByRole('radio', { name: 'E-mail' })).toBeChecked();
    expect(screen.getByLabelText('Chave e-mail')).toHaveValue('ana@example.com');
  });

  it('chave CPF recente mostra os dígitos e preenche com a máscara do titular', async () => {
    const ui = await openNewWithdrawal();
    await useKeyAndReturn(ui, 'CPF');
    await ui.click(screen.getByRole('radio', { name: 'E-mail' }));
    await ui.click(screen.getByRole('button', { name: `Usar chave CPF ${user.document}` }));
    expect(screen.getByLabelText('Chave CPF')).toHaveValue('529.982.247-25');
  });

  it('não repete a mesma chave', async () => {
    const ui = await openNewWithdrawal();
    await useKeyAndReturn(ui, 'CPF');
    await ui.click(advance());
    await ui.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(within(recentSection()!).getAllByRole('listitem')).toHaveLength(1);
  });

  it('as recentes sobrevivem a fechar e abrir a tela (ficam guardadas no navegador)', async () => {
    const ui = await openNewWithdrawal();
    await useKeyAndReturn(ui, 'CPF');
    await ui.click(screen.getByRole('button', { name: 'Voltar' })); // sai do fluxo
    await ui.click(screen.getByRole('button', { name: 'Novo saque' }));
    expect(within(recentSection()!).getByRole('button', { name: /Usar chave CPF/ })).toBeInTheDocument();
  });

  it('são por usuário: outro usuário no mesmo navegador não vê as chaves', async () => {
    const ui = await openNewWithdrawal();
    await useKeyAndReturn(ui, 'CPF');
    expect(window.localStorage.getItem(recentKeysStorageKey(user.id))).not.toBeNull();
    cleanup();

    await openNewWithdrawal({ ...user, id: '9f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f' });
    expect(recentSection()).toBeNull();
  });

  it('"Limpar" apaga as recentes e o que estava guardado', async () => {
    const ui = await openNewWithdrawal();
    await useKeyAndReturn(ui, 'CPF');
    await ui.click(within(recentSection()!).getByRole('button', { name: 'Limpar' }));
    expect(recentSection()).toBeNull();
    expect(window.localStorage.getItem(recentKeysStorageKey(user.id))).toBeNull();
  });

  it('dado adulterado no armazenamento é ignorado, sem quebrar a tela', async () => {
    window.localStorage.setItem(recentKeysStorageKey(user.id), 'isso não é json');
    await openNewWithdrawal();
    expect(recentSection()).toBeNull();
    cleanup();

    window.localStorage.setItem(
      recentKeysStorageKey(user.id),
      JSON.stringify([
        { type: 'cpf', value: '11144477735' },
        { type: 'email', value: '<img src=x onerror=alert(1)>' },
      ]),
    );
    await openNewWithdrawal();
    expect(recentSection()).toBeNull();
  });

  it('sem armazenamento no navegador, o fluxo segue normalmente (só não lembra)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });
    const ui = await openNewWithdrawal();
    await ui.click(screen.getByRole('radio', { name: 'CPF' }));
    await ui.click(advance());
    expect(screen.getByRole('heading', { level: 1, name: 'Valor do resgate' })).toBeInTheDocument();
    setItem.mockRestore();
  });
});

describe('Novo saque: colar a chave aleatória', () => {
  /** O setup() do userEvent instala o próprio clipboard: por isso o stub é definido depois dele. */
  async function openRandom(readText: () => Promise<string>): Promise<Ui> {
    const ui = await openNewWithdrawal();
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
    await ui.click(screen.getByRole('radio', { name: 'Aleatória' }));
    return ui;
  }

  it('só a chave aleatória tem "Colar", e o campo pede para colar a chave', async () => {
    const ui = await openRandom(() => Promise.resolve(''));
    expect(screen.getByLabelText('Chave aleatória')).toHaveAttribute('placeholder', 'Cole sua chave aleatória');
    expect(screen.getByRole('button', { name: 'Colar' })).toBeInTheDocument();

    for (const type of ['CPF', 'E-mail', 'Celular']) {
      await ui.click(screen.getByRole('radio', { name: type }));
      expect(screen.queryByRole('button', { name: 'Colar' })).toBeNull();
    }
  });

  it('cola o texto da área de transferência, limpo e em minúsculas', async () => {
    const ui = await openRandom(() => Promise.resolve(`  ${RANDOM.toUpperCase()}\n`));
    await ui.click(screen.getByRole('button', { name: 'Colar' }));
    expect(screen.getByLabelText('Chave aleatória')).toHaveValue(RANDOM);
    expect(screen.queryByRole('alert')).toBeNull();

    await ui.click(advance());
    expect(screen.getByRole('heading', { level: 1, name: 'Valor do resgate' })).toBeInTheDocument();
  });

  it('sem permissão de leitura, orienta a colar manualmente', async () => {
    const ui = await openRandom(() => Promise.reject(new DOMException('negado', 'NotAllowedError')));
    await ui.click(screen.getByRole('button', { name: 'Colar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível colar. Cole a chave manualmente no campo.');
    expect(screen.getByLabelText('Chave aleatória')).toHaveValue('');
  });

  it('área de transferência vazia também orienta', async () => {
    const ui = await openRandom(() => Promise.resolve('   '));
    await ui.click(screen.getByRole('button', { name: 'Colar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível colar.');
  });

  it('texto colado que não é uma chave aleatória continua sendo barrado ao avançar', async () => {
    const ui = await openRandom(() => Promise.resolve('texto qualquer que não é chave'));
    await ui.click(screen.getByRole('button', { name: 'Colar' }));
    await ui.click(advance());
    expect(screen.getByRole('alert')).toHaveTextContent('Informe a chave aleatória completa (36 caracteres).');
  });
});
