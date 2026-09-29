import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PrizesReport } from '@sysjb/contracts';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/premiadas/consultar/2026-09-28' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const { default: PrizesScreen } = await import('./PrizesScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');

// 28/09/2026 20:18:40 em Brasília.
const NOW = '2026-09-28T23:18:40.000Z';

const report: PrizesReport = {
  date: '2026-09-28',
  tickets: [
    {
      puleNumber: 562229026,
      lottery: 'LOTTO TRIVO 09HS',
      hour: 9,
      items: [{ label: 'FZG1 1/1', amountCents: 100, prizeCents: 2200, guesses: ['05'] }],
      prizeCents: 2200,
    },
  ],
  totalPrizeCents: 2200,
};

function renderScreen(data: PrizesReport) {
  renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <PrizesScreen report={data} sellerId={1366864} nowIso={NOW} />
    </InviteProvider>,
  );
}

/** Lê os bytes do Blob (o do jsdom não tem arrayBuffer()). */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new TextDecoder('latin1').decode(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

describe('Premiadas > Consultar premiadas', () => {
  it('mostra vendedor, data, extração, pule e total', () => {
    renderScreen(report);
    expect(screen.getByRole('heading', { level: 1, name: 'Premiadas' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('VENDEDOR: 1366864');
    expect(main).toHaveTextContent('28/09/2026 20:18:40');
    expect(main).toHaveTextContent(/Premiadas\s*28\/09\/2026/);
    const group = screen.getByRole('region', { name: 'LOTTO TRIVO 09HS' });
    const pule = within(group).getByRole('listitem');
    expect(pule).toHaveTextContent('Pule #562229026');
    expect(pule).toHaveTextContent(/FZG1 1\/1\s+1,00\s*22,00/);
    expect(pule).toHaveTextContent('05');
    expect(main).toHaveTextContent(/Total P\.\s*R\$ 22,00/);
    expect(screen.queryByText('Nenhuma pule premiada')).toBeNull();
    expect(screen.getByRole('link', { name: 'Voltar para as datas' })).toHaveAttribute('href', '/premiadas/consultar');
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });

  it('sem pule premiada no dia, avisa', () => {
    renderScreen({ date: '2026-09-28', tickets: [], totalPrizeCents: 0 });
    expect(screen.getByText('Nenhuma pule premiada')).toBeInTheDocument();
    expect(screen.queryByText('Total P.')).toBeNull();
  });

  it('Compartilhar gera o PDF e o abre numa aba nova', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    let pdf: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => ((pdf = blob), 'blob:premiadas'));
    URL.revokeObjectURL = vi.fn();

    renderScreen(report);
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));

    expect(open).toHaveBeenCalledWith('', '_blank');
    await vi.waitFor(() => expect(tab.location.href).toBe('blob:premiadas'));
    expect(pdf?.type).toBe('application/pdf');
    const text = await readBlob(pdf!);
    expect(text).toContain('(VENDEDOR: 1366864)');
    expect(text).toContain('(PULE #562229026)');
    expect(text).toContain('(TOTAL P.)');
    open.mockRestore();
  });

  it('se o PDF falhar, fecha a aba e avisa', async () => {
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    URL.createObjectURL = vi.fn(() => {
      throw new Error('sem memória');
    });

    renderScreen(report);
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));

    await vi.waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível gerar o PDF.');
    open.mockRestore();
  });
});
