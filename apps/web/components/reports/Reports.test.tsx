import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PuleDetail, PuleList as PuleListData } from '@sysjb/contracts';
import { describe, expect, it, vi } from 'vitest';
import { balanceSections } from '@/lib/report-receipts';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/relatorios' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const { default: ReportScreen } = await import('./ReportScreen');
const { default: PuleList } = await import('./PuleList');
const { default: PuleReceiptScreen } = await import('./PuleReceiptScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');

const withInvite = (ui: React.ReactNode) =>
  renderWithProviders(<InviteProvider inviteCode="CDYGE">{ui}</InviteProvider>);

/** Intercepta a aba do PDF e devolve o texto do arquivo gerado. */
function capturePdf() {
  const tab = { location: { href: '' }, close: vi.fn() };
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  let pdf: Blob | undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => ((pdf = blob), 'blob:relatorio'));
  URL.revokeObjectURL = vi.fn();
  return {
    async text() {
      await vi.waitFor(() => expect(tab.location.href).toBe('blob:relatorio'));
      open.mockRestore();
      // O Blob do jsdom não tem arrayBuffer(); o FileReader lê os bytes.
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new TextDecoder('latin1').decode(reader.result as ArrayBuffer));
        reader.readAsArrayBuffer(pdf!);
      });
    },
  };
}

describe('Consultar saldo', () => {
  const receipt = {
    title: 'Consulta saldo',
    sellerId: 1366864,
    consultedAt: '28/09/2026 20:25:01',
    sections: balanceSections({
      date: '2026-09-28',
      salesCents: 400,
      commissionCents: 0,
      prizes: [{ puleNumber: 562229026, amountCents: 2200 }],
      entries: [],
      sentCents: 0,
      receivedCents: 0,
      previousCents: 700,
      balanceCents: 2500,
    }),
  };

  it('mostra o relatório do dia e o compartilha em PDF', async () => {
    withInvite(<ReportScreen backHref="/relatorios/saldo" receipt={receipt} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('VENDEDOR: 1366864');
    expect(main).toHaveTextContent('28/09/2026 20:25:01');
    expect(main).toHaveTextContent(/Consulta saldo\s*28\/09\/2026/);
    expect(main).toHaveTextContent(/T\.vendas:\s*4,00\s*Comissão:\s*0,00/);
    expect(main).toHaveTextContent(/P\.# 562229026\s*22,00/);
    expect(main).toHaveTextContent(/Saldo ant\.:\s*R\$ 7,00 \(\+\)/);
    expect(main).toHaveTextContent(/Haver:\s*R\$ 25,00 \(\+\)/);
    expect(screen.getByRole('link', { name: 'Voltar para as datas' })).toHaveAttribute('href', '/relatorios/saldo');

    const pdf = capturePdf();
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    const text = await pdf.text();
    expect(text).toContain('(HAVER:)');
    expect(text).toContain('(R$ 25,00 \\(+\\))');
  });
});

const list: PuleListData = {
  date: '2026-09-28',
  registeredCents: 400,
  canceledCents: 0,
  truncated: false,
  pules: [
    {
      puleNumber: 562361031,
      game: 'lotteries',
      code: 'PT14',
      createdAt: '2026-09-28T15:05:00.000Z',
      drawDate: '2026-09-29',
      status: 'registered',
      totalCents: 100,
    },
    {
      puleNumber: 562229026,
      game: 'fazendinha',
      code: 'LTTRIVO09',
      createdAt: '2026-09-28T12:01:00.000Z',
      drawDate: '2026-09-28',
      status: 'registered',
      totalCents: 200,
    },
  ],
};

describe('Consultar pule por data', () => {
  it('totais do dia e cada pule abre o recibo (voltando para a lista)', () => {
    renderWithProviders(<PuleList data={list} />);
    expect(screen.getByText('Registradas').closest('div')).toHaveTextContent('R$ 4,00');
    expect(screen.getByText('Canceladas').closest('div')).toHaveTextContent('R$ 0,00');
    const items = within(screen.getByRole('list', { name: 'Pules' })).getAllByRole('link');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('href', '/relatorios/pule/562361031?lista=2026-09-28');
    expect(items[0]).toHaveTextContent(/#562361031\s*28\/09\/26 - 12:05/);
    expect(items[0]).toHaveTextContent(/PT14\s*Vale 29\/09\/26/);
    expect(items[0]).toHaveTextContent(/Registrada\s*R\$ 1,00/);
    expect(screen.queryByText(/mais recentes do dia/)).toBeNull();
  });

  it('dia sem pules e lista cortada', () => {
    renderWithProviders(<PuleList data={{ ...list, pules: [], registeredCents: 0 }} />);
    expect(screen.getByText('Nenhuma pule neste dia.')).toBeInTheDocument();
    renderWithProviders(<PuleList data={{ ...list, truncated: true }} />);
    expect(screen.getByText(/Mostrando as 200 pules mais recentes do dia/)).toBeInTheDocument();
  });
});

const lottery: PuleDetail = {
  game: 'lotteries',
  cancellable: true,
  ticket: {
    puleNumber: 562361031,
    drawDate: '2026-09-29',
    lottery: 'LT PT RIO 14HS',
    hour: 14,
    items: [
      {
        modality: 'milhar',
        modalityLabel: 'MILHAR',
        placement: 'p1',
        placementLabel: '1 PRÊMIO',
        guesses: ['3232'],
        amountCents: 100,
        split: 'total',
        totalCents: 100,
        quoteCents: 800_000,
        possiblePrizeCents: 800_000,
      },
    ],
    totalCents: 100,
    quoteTable: '800/1/8000',
    createdAt: '2026-09-28T15:05:21.000Z',
    sellerId: 1366864,
  },
};

const fazendinha: PuleDetail = {
  game: 'fazendinha',
  bet: {
    puleNumber: 562229026,
    drawDate: '2026-09-28',
    lottery: 'LOTTO TRIVO 09HS',
    hour: 9,
    mode: 'grupo',
    stakeCents: 100,
    prizeCents: 2200,
    quoteTable: '800/1/8000',
    numbers: [4, 5],
    totalCents: 200,
    createdAt: '2026-09-28T12:01:15.000Z',
    sellerId: 1366864,
  },
};

describe('recibo da pule', () => {
  it('Loterias no horário de venda: recibo, Cancelar pule (em breve) e Menu', async () => {
    withInvite(<PuleReceiptScreen detail={lottery} back={{ href: '/relatorios/pule', label: 'Voltar' }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Consultar pule' })).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'Recibo LT PT RIO 14HS' });
    expect(card).toHaveTextContent('RECIBO DA APOSTA');
    expect(card).toHaveTextContent('#562361031');
    expect(card).toHaveTextContent(/Vale\s*29\/09\/26/);
    expect(card).toHaveTextContent(/MILHAR 1 PRÊMIO.*3232.*R\$ 1,00 \/ TODOS/);
    expect(card).toHaveTextContent('Possível prêmio: R$ 8.000,00');
    expect(screen.getByRole('link', { name: 'Menu' })).toHaveAttribute('href', '/relatorios');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pule' }));
    expect(screen.getByRole('status')).toHaveTextContent('Cancelar pule: disponível em breve.');
  });

  it('Loterias fora do horário e Fazendinha: sem Cancelar pule; Fazendinha sem possível prêmio', () => {
    withInvite(
      <PuleReceiptScreen
        detail={{ ...lottery, cancellable: false }}
        back={{ href: '/relatorios/pule', label: 'Voltar' }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Cancelar pule' })).toBeNull();
  });

  it('Fazendinha: palpites e valor por cada; compartilha o recibo em PDF', async () => {
    withInvite(<PuleReceiptScreen detail={fazendinha} back={{ href: '/relatorios/pule', label: 'Voltar' }} />);
    expect(screen.queryByRole('button', { name: 'Cancelar pule' })).toBeNull();
    const card = screen.getByRole('article', { name: 'Recibo LOTTO TRIVO 09HS' });
    expect(card).toHaveTextContent('Fazendinha GP-1');
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['04', '05']);
    expect(card).toHaveTextContent('R$ 1,00 / CADA');
    expect(card).not.toHaveTextContent('Possível prêmio');

    const pdf = capturePdf();
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    const text = await pdf.text();
    expect(text).toContain('(RECIBO DA APOSTA)');
    expect(text).toContain('(FAZENDINHA GP-1)');
    expect(text).toContain('(#562229026)');
  });
});
