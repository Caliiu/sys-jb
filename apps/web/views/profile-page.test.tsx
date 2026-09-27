import type { PublicProfile } from '@sysjb/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { renderWithProviders, router, tenant, user } from '@/test/render';

const updateProfileAction = vi.fn();
const changePasswordAction = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/auth-actions', () => ({ meAction: vi.fn() }));
vi.mock('@/app/profile-actions', () => ({
  updateProfileAction: (...args: unknown[]) => updateProfileAction(...args),
  changePasswordAction: (...args: unknown[]) => changePasswordAction(...args),
}));

const { default: ProfilePage } = await import('./ProfilePage');

const profile: PublicProfile = { ...user, email: null, birthDate: '1990-05-17' };
const NEW_PASSWORD = 'uma frase totalmente nova 2026';

type Ui = ReturnType<typeof userEvent.setup>;

function renderProfile(data: PublicProfile = profile) {
  return renderWithProviders(<ProfilePage tenant={tenant} profile={data} />);
}

const save = () => screen.getByRole('button', { name: /Salvar alterações|Salvando/ });
const emailField = () => screen.getByLabelText(/^Email/);
const phoneField = () => screen.getByLabelText('Telefone');
const passwordField = () => screen.getByLabelText('Nova senha');

async function openPassword(ui: Ui) {
  await ui.click(screen.getByRole('button', { name: /Alterar senha/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  updateProfileAction.mockResolvedValue({ ok: true, data: profile });
  changePasswordAction.mockResolvedValue({ ok: true, data: null });
});

describe('Perfil: tela', () => {
  it('mostra título, nome curto, ID e os dados do usuário', () => {
    renderProfile();
    expect(screen.getByRole('heading', { level: 1, name: 'Perfil' })).toBeInTheDocument();
    expect(screen.getByText('Pessoa Sintética')).toBeInTheDocument();
    expect(screen.getByText('100042')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');

    expect(phoneField()).toHaveValue('(11) 9 1234 5678');
    expect(screen.getByLabelText(/^CPF/)).toHaveValue('529.982.247-25');
    expect(screen.getByLabelText(/^Data de nascimento/)).toHaveValue('17/05/1990');
    expect(emailField()).toHaveValue('');
    expect(emailField()).toHaveAttribute('placeholder', 'Preencha seu email aqui');
  });

  it('CPF e data de nascimento são somente leitura; telefone só edita depois de "Alterar"', () => {
    renderProfile();
    expect(screen.getByLabelText(/^CPF/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Data de nascimento/)).toHaveAttribute('readonly');
    expect(phoneField()).toHaveAttribute('readonly');
  });

  it('e-mail salvo aparece preenchido', () => {
    renderProfile({ ...profile, email: 'ana@example.test' });
    expect(emailField()).toHaveValue('ana@example.test');
  });

  it('sem alterações, "Salvar alterações" fica desabilitado', () => {
    renderProfile();
    expect(save()).toBeDisabled();
  });
});

describe('Perfil: copiar ID', () => {
  it('copia o ID e avisa', async () => {
    const ui = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderProfile();
    await ui.click(screen.getByRole('button', { name: 'Copiar ID' }));
    expect(writeText).toHaveBeenCalledWith('100042');
    expect(await screen.findByText('ID copiado.')).toBeInTheDocument();
  });

  it('sem permissão de cópia, avisa sem quebrar', async () => {
    const ui = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) },
      configurable: true,
    });
    renderProfile();
    await ui.click(screen.getByRole('button', { name: 'Copiar ID' }));
    expect(await screen.findByText('Não foi possível copiar o ID.')).toBeInTheDocument();
  });
});

describe('Perfil: telefone', () => {
  it('"Alterar" libera a edição com máscara; "Cancelar" volta ao valor salvo', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await ui.click(screen.getByRole('button', { name: 'Alterar' }));
    expect(phoneField()).not.toHaveAttribute('readonly');
    expect(phoneField()).toHaveValue('(11) 91234-5678');
    expect(phoneField()).toHaveFocus();

    await ui.clear(phoneField());
    await ui.type(phoneField(), '21987654321');
    expect(phoneField()).toHaveValue('(21) 98765-4321');
    expect(save()).toBeEnabled();

    await ui.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(phoneField()).toHaveAttribute('readonly');
    expect(phoneField()).toHaveValue('(11) 9 1234 5678');
    expect(save()).toBeDisabled();
  });

  it('telefone inválido é apontado no campo, sem chamar a API', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await ui.click(screen.getByRole('button', { name: 'Alterar' }));
    await ui.clear(phoneField());
    await ui.type(phoneField(), '123');
    await ui.click(save());

    expect(screen.getByRole('alert')).toHaveTextContent('Informe um telefone válido com DDD.');
    expect(phoneField()).toBeInvalid();
    expect(updateProfileAction).not.toHaveBeenCalled();

    await ui.type(phoneField(), '4');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('salva só o telefone novo (só dígitos)', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await ui.click(screen.getByRole('button', { name: 'Alterar' }));
    await ui.clear(phoneField());
    await ui.type(phoneField(), '21987654321');
    await ui.click(save());
    expect(updateProfileAction).toHaveBeenCalledExactlyOnceWith({ phone: '21987654321' });
    expect(changePasswordAction).not.toHaveBeenCalled();
  });
});

describe('Perfil: e-mail', () => {
  it('salva o e-mail normalizado, avisa e recarrega os dados', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await ui.type(emailField(), ' Ana@Example.TEST ');
    await ui.click(save());

    expect(updateProfileAction).toHaveBeenCalledExactlyOnceWith({ email: 'ana@example.test' });
    expect(await screen.findByText('Perfil atualizado.')).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it('e-mail inválido é apontado no campo, sem chamar a API', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await ui.type(emailField(), 'sem-arroba');
    await ui.click(save());
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um e-mail válido.');
    expect(emailField()).toBeInvalid();
    expect(updateProfileAction).not.toHaveBeenCalled();
  });

  it('apagar o e-mail salvo envia null', async () => {
    const ui = userEvent.setup();
    renderProfile({ ...profile, email: 'ana@example.test' });
    await ui.clear(emailField());
    await ui.click(save());
    expect(updateProfileAction).toHaveBeenCalledExactlyOnceWith({ email: null });
  });

  it('conflito da API aparece no campo, a tela não recarrega e nada de senha é enviado', async () => {
    updateProfileAction.mockResolvedValue({
      ok: false,
      code: 'CONFLICT',
      message: 'Email já cadastrado nesta banca.',
      fieldErrors: { email: 'Já cadastrado.', outro: 'ignorado' },
    });
    const ui = userEvent.setup();
    renderProfile();
    await ui.type(emailField(), 'ocupado@example.test');
    await openPassword(ui);
    await ui.type(passwordField(), NEW_PASSWORD);
    await ui.click(save());

    expect(await screen.findByText('Já cadastrado.')).toBeInTheDocument();
    expect(screen.getByText('Email já cadastrado nesta banca.')).toBeInTheDocument();
    expect(screen.queryByText('ignorado')).toBeNull();
    expect(emailField()).toBeInvalid();
    expect(changePasswordAction).not.toHaveBeenCalled(); // o perfil falhou: a senha não é tentada
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('Perfil: senha', () => {
  it('"Alterar senha" abre o painel; o X fecha e descarta o que foi digitado', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await openPassword(ui);
    expect(screen.getByText('Deixe em branco se não quiser alterar')).toBeInTheDocument();
    await ui.type(passwordField(), 'rascunho');
    expect(save()).toBeEnabled();

    await ui.click(screen.getByRole('button', { name: 'Cancelar alteração de senha' }));
    expect(screen.queryByLabelText('Nova senha')).toBeNull();
    expect(save()).toBeDisabled();

    await openPassword(ui);
    expect(passwordField()).toHaveValue('');
  });

  it('painel aberto e em branco não altera nada (Salvar continua desabilitado)', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await openPassword(ui);
    expect(save()).toBeDisabled();
  });

  it('o olho mostra e oculta a senha digitada', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await openPassword(ui);
    expect(passwordField()).toHaveAttribute('type', 'password');
    expect(passwordField()).toHaveAttribute('autocomplete', 'new-password');

    await ui.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(passwordField()).toHaveAttribute('type', 'text');
    await ui.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(passwordField()).toHaveAttribute('type', 'password');
  });

  it('senha fraca ou com dados pessoais é barrada antes de enviar', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await openPassword(ui);

    for (const [password, message] of [
      ['abc123', /entre 8 e 128/],
      ['senha123', /muito comum/],
      ['meu cpf 52998224725 aqui', /CPF, telefone ou data de nascimento/],
      ['nasci em 17051990 mesmo', /CPF, telefone ou data de nascimento/],
    ] as const) {
      await ui.clear(passwordField());
      await ui.type(passwordField(), password);
      await ui.click(save());
      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(passwordField()).toBeInvalid();
    }
    expect(changePasswordAction).not.toHaveBeenCalled();
  });

  it('troca só a senha: chama só a ação da senha, avisa, fecha o painel e recarrega', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await openPassword(ui);
    await ui.type(passwordField(), NEW_PASSWORD);
    await ui.click(save());

    expect(changePasswordAction).toHaveBeenCalledExactlyOnceWith({ password: NEW_PASSWORD });
    expect(updateProfileAction).not.toHaveBeenCalled();
    expect(await screen.findByText('Perfil atualizado.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nova senha')).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it('e-mail e senha juntos: salva o perfil primeiro e depois a senha', async () => {
    const order: string[] = [];
    updateProfileAction.mockImplementation(async () => {
      order.push('perfil');
      return { ok: true, data: profile };
    });
    changePasswordAction.mockImplementation(async () => {
      order.push('senha');
      return { ok: true, data: null };
    });
    const ui = userEvent.setup();
    renderProfile();
    await ui.type(emailField(), 'ana@example.test');
    await openPassword(ui);
    await ui.type(passwordField(), NEW_PASSWORD);
    await ui.click(save());

    expect(await screen.findByText('Perfil atualizado.')).toBeInTheDocument();
    expect(order).toEqual(['perfil', 'senha']);
  });

  it('a senha é conferida contra o telefone NOVO (o que ficará salvo)', async () => {
    const ui = userEvent.setup();
    renderProfile();
    await ui.click(screen.getByRole('button', { name: 'Alterar' }));
    await ui.clear(phoneField());
    await ui.type(phoneField(), '21987654321');
    await openPassword(ui);
    await ui.type(passwordField(), 'minha senha 21987654321 ok');
    await ui.click(save());

    expect(screen.getByRole('alert')).toHaveTextContent('A senha não pode conter CPF, telefone ou data de nascimento.');
    expect(updateProfileAction).not.toHaveBeenCalled();
    expect(changePasswordAction).not.toHaveBeenCalled();
  });

  it('perfil salvo, mas a API recusa a senha: avisa o que foi salvo e o que não foi', async () => {
    changePasswordAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Corrija os campos destacados.',
      fieldErrors: { password: 'Senha muito comum.' },
    });
    const ui = userEvent.setup();
    renderProfile();
    await ui.type(emailField(), 'ana@example.test');
    await openPassword(ui);
    await ui.type(passwordField(), NEW_PASSWORD);
    await ui.click(save());

    expect(await screen.findByText('Seus dados foram salvos, mas a senha não foi alterada.')).toBeInTheDocument();
    expect(screen.getByText('Senha muito comum.')).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled(); // o e-mail salvo já aparece
    expect(screen.queryByText('Perfil atualizado.')).toBeNull();
  });
});

describe('Perfil: falhas e proteção', () => {
  it('sessão encerrada leva ao login', async () => {
    updateProfileAction.mockResolvedValue({ ok: false, code: 'SESSION_INVALID', message: 'x' });
    const ui = userEvent.setup();
    renderProfile();
    await ui.type(emailField(), 'ana@example.test');
    await ui.click(save());
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('falha inesperada não quebra a tela', async () => {
    updateProfileAction.mockRejectedValue(new Error('rede'));
    const ui = userEvent.setup();
    renderProfile();
    await ui.type(emailField(), 'ana@example.test');
    await ui.click(save());
    expect(await screen.findByText('Não foi possível salvar. Tente novamente.')).toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('enquanto salva, o botão trava (sem envio duplicado)', async () => {
    let finish: (value: unknown) => void = () => {};
    updateProfileAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const ui = userEvent.setup();
    renderProfile();
    await ui.type(emailField(), 'ana@example.test');
    await ui.click(save());

    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
    await ui.click(screen.getByRole('button', { name: 'Salvando…' }));
    await ui.type(emailField(), '{Enter}');
    expect(updateProfileAction).toHaveBeenCalledTimes(1);

    finish({ ok: true, data: profile });
    expect(await screen.findByText('Perfil atualizado.')).toBeInTheDocument();
  });

  it('a tela reflete os dados salvos: ao mudarem, o formulário recomeça deles', () => {
    const { rerender } = renderProfile();
    // O rerender do Testing Library não repete os providers de renderWithProviders: eles vão junto.
    rerender(
      <TenantProvider tenant={tenant}>
        <ToastProvider>
          <ProfilePage tenant={tenant} profile={{ ...profile, email: 'novo@example.test', phone: '21987654321' }} />
        </ToastProvider>
      </TenantProvider>,
    );
    expect(emailField()).toHaveValue('novo@example.test');
    expect(phoneField()).toHaveValue('(21) 9 8765 4321');
    expect(save()).toBeDisabled();
  });
});
