import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PlaceLotteryTicketsResponse, defaultQuotes } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_SCHEDULE } from '@/test/draws';
import { renderWithProviders, router, user } from '@/test/render';
import { parsePuleCode } from './RepeatSteps';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/loterias' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/lottery-actions', () => ({ placeLotteryTicketsAction: vi.fn(), repeatLotteryTicketAction: vi.fn() }));

const { repeatLotteryTicketAction } = await import('@/app/lottery-actions');
const { default: LotteriesScreen } = await import('./LotteriesScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');
const repeat = vi.mocked(repeatLotteryTicketAction);

// Segunda, 28/09/2026 10:30 em Brasília.
const NOW = '2026-09-28T13:30:00.000Z';

const RECEIPT: PlaceLotteryTicketsResponse = {
  tickets: [
    {
      puleNumber: 562910578,
      game: 'tradicional',
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
          quoteCents: 800000,
          possiblePrizeCents: 800000,
        },
      ],
      totalCents: 100,
      quoteTable: '800/1/8000',
      createdAt: '2026-09-28T13:42:59.000Z',
      sellerId: 100042,
    },
  ],
  totalCents: 100,
  wallet: { ...user.wallet, balanceJb: 123356 },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

function renderScreen() {
  return renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <LotteriesScreen
        nowIso={NOW}
        wallet={user.wallet}
        quotes={defaultQuotes()}
        schedule={TEST_SCHEDULE}
        sellerId={100042}
        userName="Pessoa Sintética"
      />
    </InviteProvider>,
  );
}

const click = (name: string | RegExp) => userEvent.click(screen.getAllByRole('button', { name })[0]!);
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const codeInput = () => screen.getByLabelText('Código da pule');
const advance = () => screen.getByRole('button', { name: 'Avançar' });

/** Repetir pule → Tradicional → amanhã (29/09) → LT PT RIO 14HS → código. */
async function toCodeStep() {
  renderScreen();
  await click(/Repetir pule/);
  await click(/^TRADICIONAL\s*Repetir pule/);
  await click('Amanhã, 29/09/2026');
  await click(/^RIO\/FEDERAL/);
  await userEvent.click(screen.getByRole('checkbox', { name: /LT PT RIO 14HS/ }));
  await click('Avançar');
}

describe('Repetir pule', () => {
  it('etapas como nos prints: modalidade, data (com resumo 3/7), loterias e código', async () => {
    renderScreen();
    await click(/Repetir pule/);
    expect(heading()).toBe('Repetir pule');
    expect(screen.getByRole('list', { name: 'Etapa 2 de 7' })).toBeInTheDocument();
    const types = within(screen.getByRole('list', { name: 'Modalidades' })).getAllByRole('button');
    expect(types.map((b) => b.textContent)).toEqual([
      'TRADICIONALRepetir pule',
      'TRADICIONAL 1/10Repetir pule',
      'LOT. URUGUAIARepetir pule',
      'QUININHARepetir pule',
      'SENINHARepetir pule',
      'SUPER15Repetir pule',
    ]);
    await click(/^QUININHA/);
    expect(screen.getByRole('status')).toHaveTextContent('Quininha: disponível em breve.');

    await click(/^TRADICIONAL\s*Repetir pule/);
    expect(heading()).toBe('Data');
    const dates = within(screen.getByRole('list', { name: 'Datas' })).getAllByRole('button');
    expect(dates).toHaveLength(7);
    // Os mesmos cartões da aposta nova: título, dia do mês e a etiqueta nos dias com Federal.
    expect(dates.map((d) => d.getAttribute('aria-label')).slice(0, 3)).toEqual([
      'Hoje, 28/09/2026',
      'Amanhã, 29/09/2026',
      'Quarta, 30/09/2026, com Federal',
    ]);
    expect(dates[0]).toHaveTextContent('Hoje28');
    expect(screen.getByText('Repetir Pule').closest('div')).toHaveTextContent(/Tradicionais 1\/7\s*3\/7/);

    await click('Amanhã, 29/09/2026');
    expect(heading()).toBe('Loterias');
    expect(advance()).toBeDisabled();
    await click(/^RIO\/FEDERAL/);
    await userEvent.click(screen.getByRole('checkbox', { name: /LT PT RIO 14HS/ }));
    await click('Avançar');

    expect(heading()).toBe('Código da pule');
    expect(screen.getByRole('list', { name: 'Etapa 6 de 7' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Resumo da pule' });
    expect(summary).toHaveTextContent(/Tradicional.*Loterias · 1.*LT PT RIO 14HS.*Data · 1.*Terça 29\/09\/2026/);
  });

  it('Tradicional 1/10: só as loterias da 1/10 e o pedido vai com o jogo', async () => {
    repeat.mockResolvedValue({ ok: false, code: 'CONFLICT', message: 'Esta pule é da Tradicional 1/7.' });
    renderScreen();
    await click(/Repetir pule/);
    await click(/^TRADICIONAL 1\/10\s*Repetir pule/);
    expect(screen.getByText('Repetir Pule').closest('div')).toHaveTextContent(/Oficiais 1\/10\s*3\/7/);
    await click('Amanhã, 29/09/2026');
    expect(screen.queryByRole('button', { name: /^RIO\/FEDERAL/ })).not.toBeInTheDocument();
    await click(/^BAHIA/);
    await userEvent.click(screen.getByRole('checkbox', { name: /LT BAHIA 15HS/ }));
    await click('Avançar');
    expect(screen.getByRole('region', { name: 'Resumo da pule' })).toHaveTextContent(/Tradicional 1\/10/);
    await userEvent.type(codeInput(), '562910577');
    await userEvent.click(advance());
    expect(repeat).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ game: 'tradicional_10', draws: [{ name: 'LT BAHIA 15HS', hour: 15 }] }),
    );
    // Pule de outro jogo: a mensagem da API explica qual escolher.
    expect(screen.getByText('Esta pule é da Tradicional 1/7.')).toBeInTheDocument();
  });

  it('código: só dígitos, até 10; Avançar só com código válido; limpar', async () => {
    await toCodeStep();
    expect(advance()).toBeDisabled();
    await userEvent.type(codeInput(), 'ab5-62 91x0578');
    expect(codeInput()).toHaveValue('562910578');
    expect(advance()).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar código' }));
    expect(codeInput()).toHaveValue('');
    await userEvent.type(codeInput(), '0');
    expect(advance()).toBeDisabled();

    expect(parsePuleCode('562910578')).toBe(562910578);
    expect(parsePuleCode('2147483647')).toBe(2147483647);
    expect(parsePuleCode('2147483648')).toBeNull();
    expect(parsePuleCode('0')).toBeNull();
    expect(parsePuleCode('12a')).toBeNull();
  });

  it('colar: pega só os dígitos da área de transferência; falha avisa', async () => {
    await toCodeStep();
    const readText = vi.fn().mockResolvedValueOnce('Pule #562910578').mockRejectedValueOnce(new Error('negado'));
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
    await click('Colar');
    expect(codeInput()).toHaveValue('562910578');
    await userEvent.click(screen.getByRole('button', { name: 'Limpar código' }));
    await click('Colar');
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível colar. Digite o código da pule.');
  });

  it('sucesso: envia pule, data e loterias; "Direcionando ao recibo" e o recibo com Menu', async () => {
    repeat.mockResolvedValue({ ok: true, data: RECEIPT });
    await toCodeStep();
    await userEvent.type(codeInput(), '562910577');
    await userEvent.click(advance());

    expect(repeat).toHaveBeenCalledExactlyOnceWith({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      game: 'tradicional',
      puleNumber: 562910577,
      drawDate: '2026-09-29',
      draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
    });
    const dialog = screen.getByRole('alertdialog', { name: 'Pule repetida com sucesso!' });
    expect(dialog).toHaveTextContent('Direcionando ao recibo...');

    await screen.findByRole('heading', { level: 1, name: 'Sucesso' }, { timeout: 3000 });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const recibo = screen.getByRole('article', { name: 'Recibo LT PT RIO 14HS' });
    expect(recibo).toHaveTextContent('#562910578');
    expect(screen.getByRole('button', { name: 'Ocultar saldo' })).toHaveTextContent('1.234,00'); // saldo + prêmios depois do débito (era 1.235,00)

    await click('Menu');
    expect(heading()).toBe('Nova aposta');
  });

  it('erro: "Não foi possível repetir" com a mensagem; tentar de novo reusa a chave, mudar o código gera outra', async () => {
    repeat.mockResolvedValue({ ok: false, code: 'NOT_FOUND', message: 'Pule inválida' });
    await toCodeStep();
    await userEvent.type(codeInput(), '324');
    await userEvent.click(advance());

    const dialog = screen.getByRole('alertdialog', { name: 'Não foi possível repetir' });
    expect(dialog).toHaveTextContent('Pule inválida');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(heading()).toBe('Código da pule');

    await userEvent.click(advance());
    const [first, second] = repeat.mock.calls.map(([input]) => (input as { idempotencyKey: string }).idempotencyKey);
    expect(second).toBe(first);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await userEvent.type(codeInput(), '5');
    await userEvent.click(advance());
    expect((repeat.mock.calls[2]![0] as { idempotencyKey: string }).idempotencyKey).not.toBe(first);
  });

  it('voltar mantém as escolhas; outra data limpa as loterias', async () => {
    await toCodeStep();
    await userEvent.type(codeInput(), '123');
    await click('Voltar');
    expect(heading()).toBe('Loterias');
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeEnabled();
    await click('Voltar');
    expect(heading()).toBe('Data');
    await click('Quarta, 30/09/2026, com Federal');
    expect(heading()).toBe('Loterias');
    expect(advance()).toBeDisabled();
  });
});
