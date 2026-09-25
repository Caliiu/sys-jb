import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/http';
import { renderWithProviders, router } from '@/test/render';

const auth = { register: vi.fn(), login: vi.fn(), logout: vi.fn() };

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

const { default: LoginPage } = await import('./LoginPage');
const { default: RegisterPage } = await import('./RegisterPage');

beforeEach(() => vi.clearAllMocks());

describe('LoginPage', () => {
  it('valida no navegador antes de chamar a API', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe seu CPF.');
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('aplica máscara no CPF, envia só dígitos e vai para o dashboard', async () => {
    auth.login.mockResolvedValue(undefined);
    renderWithProviders(<LoginPage />);
    const cpf = screen.getByRole('textbox', { name: 'CPF' });
    await userEvent.type(cpf, '52998224725');
    expect(cpf).toHaveValue('529.982.247-25');
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo qualquer');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(auth.login).toHaveBeenCalledWith({ cpf: '52998224725', password: 'segredo qualquer' });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('mostra a mensagem da API e permite tentar de novo', async () => {
    auth.login.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'CPF ou senha inválidos.'));
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByRole('textbox', { name: 'CPF' }), '52998224725');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CPF ou senha inválidos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('"Esqueceu sua senha?" avisa que vem em breve', async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Esqueceu sua senha?' }));
    expect(screen.getByRole('status')).toHaveTextContent('Recuperação de senha: disponível em breve.');
  });
});

describe('RegisterPage', () => {
  it('envia os dados normalizados e leva ao login com aviso', async () => {
    auth.register.mockResolvedValue(undefined);
    renderWithProviders(<RegisterPage />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome completo' }), 'Pessoa Sintética');
    await userEvent.type(screen.getByRole('textbox', { name: 'Telefone' }), '11912345678');
    await userEvent.type(screen.getByRole('textbox', { name: 'CPF' }), '52998224725');
    await userEvent.type(screen.getByRole('textbox', { name: 'Data de nascimento (DD/MM/AAAA)' }), '17051990');
    await userEvent.type(screen.getByLabelText('Senha'), 'frase secreta longa');
    await userEvent.click(screen.getByRole('button', { name: 'Avançar' }));

    expect(auth.register).toHaveBeenCalledWith({
      name: 'Pessoa Sintética',
      phone: '11912345678',
      cpf: '52998224725',
      birthDate: '1990-05-17',
      password: 'frase secreta longa',
    });
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(screen.getByRole('status')).toHaveTextContent('Cadastro concluído');
  });

  it('mostrar/ocultar senha', async () => {
    renderWithProviders(<RegisterPage />);
    const senha = screen.getByLabelText('Senha');
    expect(senha).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(senha).toHaveAttribute('type', 'text');
  });
});
