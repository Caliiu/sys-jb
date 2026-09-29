import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

vi.mock('@/app/support-actions', () => ({ supportContactAction: vi.fn() }));

const { supportContactAction } = await import('@/app/support-actions');
const { default: SupportBanner } = await import('./SupportBanner');
const contact = vi.mocked(supportContactAction);

/** Aba aberta no toque: guarda o endereço que recebe depois. */
function fakeWindow() {
  return { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
}

beforeEach(() => vi.clearAllMocks());

const open = () => userEvent.click(screen.getByRole('button', { name: /Atendimento/ }));

describe('Atendimento', () => {
  it('abre o WhatsApp com o número e a mensagem que a API montou, na aba aberta no toque, sem acesso ao app', async () => {
    const win = fakeWindow();
    const spy = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    const message = 'Olá Promotor Ana Souza, preciso de ajuda, meu código de unidade é: 100008.';
    contact.mockResolvedValue({ phone: '11956932585', message });
    renderWithProviders(<SupportBanner />);
    await open();

    expect(spy).toHaveBeenCalledWith('', '_blank');
    expect(win.location.href).toBe(
      'https://api.whatsapp.com/send?phone=+5511956932585&text=Ol%C3%A1%20Promotor%20Ana%20Souza%2C%20preciso%20de%20ajuda%2C%20meu%20c%C3%B3digo%20de%20unidade%20%C3%A9%3A%20100008.',
    );
    expect(win.opener).toBeNull();
  });

  it('sem número configurado: fecha a aba e avisa', async () => {
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    contact.mockResolvedValue({ phone: null, message: 'Olá, preciso de ajuda.' });
    renderWithProviders(<SupportBanner />);
    await open();

    expect(win.close).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Atendimento indisponível no momento.');
  });

  it('falha na consulta: fecha a aba e avisa', async () => {
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    contact.mockRejectedValue(new Error('rede'));
    renderWithProviders(<SupportBanner />);
    await open();

    expect(win.close).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível abrir o atendimento. Tente novamente.');
  });

  it('toque duplo não abre duas abas', async () => {
    const spy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow() as unknown as Window);
    let release: (value: { phone: string; message: string }) => void = () => {};
    contact.mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderWithProviders(<SupportBanner />);
    const button = screen.getByRole('button', { name: /Atendimento/ });
    await userEvent.click(button);
    await userEvent.click(button);
    release({ phone: '11987654321', message: 'Olá, preciso de ajuda.' });
    await vi.waitFor(() => expect(contact).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
