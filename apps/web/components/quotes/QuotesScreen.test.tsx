import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultQuotes } from '@sysjb/contracts';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/relatorios/cotacoes' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const { default: QuotesScreen } = await import('./QuotesScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');

// 28/09/2026 12:13:33 em Brasília.
const NOW = '2026-09-28T15:13:33.000Z';

/** Linha da tabela pelo rótulo exato (o nome da linha inclui também o valor). */
const rowOf = (label: string) => screen.getByRole('rowheader', { name: label }).closest('tr')!;

function renderScreen() {
  renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <QuotesScreen quotes={defaultQuotes()} sellerId={100042} nowIso={NOW} />
    </InviteProvider>,
  );
}

describe('Relatórios > Cotações', () => {
  it('lista os jogos; os que ainda não existem avisam "em breve"', async () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: 'Cotações' })).toBeInTheDocument();
    const games = within(screen.getByRole('list', { name: 'Jogos' })).getAllByRole('button');
    expect(games.map((b) => b.textContent)).toEqual([
      'TRADICIONAL',
      'TRADICIONAL 1/10',
      'LOT. URUGUAIA',
      'QUININHA',
      'SENINHA',
      'SUPER15',
      'FAZENDINHA',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'QUININHA' }));
    expect(screen.getByRole('status')).toHaveTextContent('QUININHA: disponível em breve.');
  });

  it('Tradicional: cabeçalho do vendedor, tabela 800/1/8000, aviso do Duque/Terno e os prêmios', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'TRADICIONAL' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('VENDEDOR: 100042');
    expect(main).toHaveTextContent('28/09/2026 12:13:33');
    expect(main).toHaveTextContent(/Tabela de cotação\s*800\/1\/8000/);
    expect(main).toHaveTextContent(/Valor pra cada\s*R\$1,00/);
    expect(main).toHaveTextContent(/Duque GP.*Terno GP.*aposta seca/);
    expect(rowOf('GRUPO')).toHaveTextContent('R$ 20,00');
    expect(rowOf('MILHAR')).toHaveTextContent('R$ 8.000,00');
    expect(rowOf('PASSE VAI VEM')).toHaveTextContent('R$ 45,00');
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');

    await userEvent.click(screen.getByRole('button', { name: 'Voltar para cotações' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Cotações' })).toBeInTheDocument();
  });

  it('Fazendinha: um prêmio por modalidade e valor (CT-100 desligado mostra R$ 0,00)', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'FAZENDINHA' }));
    expect(rowOf('FAZENDINHA GP-1')).toHaveTextContent('R$ 22,00');
    expect(rowOf('FAZENDINHA DZ-3')).toHaveTextContent('R$ 264,00');
    expect(rowOf('FAZENDINHA CT-100')).toHaveTextContent('R$ 0,00');
    expect(screen.queryByText(/aposta seca/)).toBeNull();
  });

  it('Compartilhar gera o PDF da tabela e o abre numa aba nova', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    let pdf: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => ((pdf = blob), 'blob:cotacoes'));
    URL.revokeObjectURL = vi.fn();

    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'TRADICIONAL' }));
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));

    expect(open).toHaveBeenCalledWith('', '_blank');
    await vi.waitFor(() => expect(tab.location.href).toBe('blob:cotacoes'));
    expect(pdf?.type).toBe('application/pdf');
    // O Blob do jsdom não tem arrayBuffer(); o FileReader lê os bytes.
    const bytes = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(pdf!);
    });
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('(VENDEDOR: 100042)');
    expect(text).toContain('(MILHAR)');
    expect(text).toContain('(R$ 8.000,00)');
    open.mockRestore();
  });
});
