import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PrizeClaim } from '@sysjb/contracts';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/premiadas/reclame' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const { default: PrizeClaimScreen } = await import('./PrizeClaimScreen');
const { default: PuleCodeForm } = await import('./PuleCodeForm');
const { InviteProvider } = await import('../dashboard/InviteProvider');

// 28/09/2026 20:21:14 em Brasília.
const NOW = '2026-09-28T23:21:14.000Z';

function renderResult(claim: PrizeClaim) {
  renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <PrizeClaimScreen claim={claim} sellerId={1366864} nowIso={NOW} />
    </InviteProvider>,
  );
}

describe('Premiadas > Reclame: código da pule', () => {
  it('campo e Avançar enviam ?pule= para a própria rota (GET)', () => {
    const { container } = renderWithProviders(<PuleCodeForm action="/premiadas/reclame" />);
    const form = container.querySelector('form')!;
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/premiadas/reclame');
    const input = screen.getByRole('textbox', { name: 'Código da pule' });
    expect(input).toHaveAttribute('name', 'pule');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('placeholder', 'Código da pule');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('button', { name: 'Avançar' })).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('código recusado: volta o valor digitado com o aviso ligado ao campo', () => {
    renderWithProviders(
      <PuleCodeForm action="/premiadas/reclame" defaultValue="12a" error="Informe o código da pule (só números)." />,
    );
    const input = screen.getByRole('textbox', { name: 'Código da pule' });
    expect(input).toHaveValue('12a');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Informe o código da pule (só números).');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o código da pule (só números).');
  });
});

describe('Premiadas > Reclame: resultado', () => {
  it('prêmio não encontrado, com vendedor e data/hora', () => {
    renderResult({ status: 'not_found' });
    expect(screen.getByRole('heading', { level: 1, name: 'Premiadas' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('VENDEDOR: 1366864');
    expect(main).toHaveTextContent('28/09/2026 20:21:14');
    expect(main).toHaveTextContent('Prêmio não encontrado');
    expect(screen.getByRole('link', { name: 'Consultar outra pule' })).toHaveAttribute('href', '/premiadas/reclame');
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });

  it('prêmio pago: mostra a data do pagamento', () => {
    renderResult({ status: 'paid', paidOn: '2026-09-28' });
    expect(screen.getByRole('main')).toHaveTextContent('Prêmio pago em 28/09/26');
  });

  it('Compartilhar gera o PDF com a mesma mensagem', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    let pdf: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => ((pdf = blob), 'blob:reclame'));
    URL.revokeObjectURL = vi.fn();

    renderResult({ status: 'paid', paidOn: '2026-09-28' });
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));

    await vi.waitFor(() => expect(tab.location.href).toBe('blob:reclame'));
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new TextDecoder('latin1').decode(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(pdf!);
    });
    expect(text).toContain(String.raw`(PR\312MIO PAGO EM 28/09/26)`);
    expect(text).toContain('(VENDEDOR: 1366864)');
    open.mockRestore();
  });
});
