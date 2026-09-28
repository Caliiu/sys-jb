import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAZENDINHA_MODES, type FazendinhaModeId, type FazendinhaTicket } from '@/lib/fazendinha';
import { testDraw } from '@/test/draws';
import { renderWithProviders, router, user } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/app/fazendinha-actions', () => ({ placeFazendinhaBetAction: vi.fn() }));

const { placeFazendinhaBetAction } = await import('@/app/fazendinha-actions');
const { default: PalpitesScreen } = await import('./PalpitesScreen');
const place = vi.mocked(placeFazendinhaBetAction);

const ticket = (mode: FazendinhaModeId, stakeCents = 100): FazendinhaTicket => ({
  drawDate: '2026-09-28',
  dayLabel: 'Hoje - 28/09',
  lottery: testDraw('LT PT RIO 11HS'),
  mode: FAZENDINHA_MODES.find((m) => m.id === mode)!,
  stakeCents,
  prizeCents: stakeCents * FAZENDINHA_MODES.find((m) => m.id === mode)!.multiplier,
});

const callbacks = { onPurchased: vi.fn(), onSoldOut: vi.fn(), onDrawClosed: vi.fn() };

function renderScreen(t: FazendinhaTicket, options: { sold?: number[] } = {}) {
  return renderWithProviders(<PalpitesScreen ticket={t} sold={options.sold ?? []} {...callbacks} />);
}

/** Aviso "Ocorreu um erro": confere a mensagem e fecha. */
async function expectError(message: string) {
  const alert = screen.getByRole('alertdialog', { name: 'Ocorreu um erro' });
  expect(alert).toHaveAccessibleDescription(message);
  await userEvent.click(within(alert).getByRole('button', { name: 'Fechar' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
}

const gridButtons = () => within(screen.getByRole('list', { name: 'Palpites disponíveis' })).getAllByRole('button');

async function buy(...names: string[]) {
  for (const name of names) await userEvent.click(screen.getByRole('button', { name }));
  await userEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
}

beforeEach(() => vi.clearAllMocks());

describe('PalpitesScreen', () => {
  it('resumo da aposta e os 25 bichos', () => {
    renderScreen(ticket('grupo'));
    expect(screen.getByRole('region', { name: 'Aposta' })).toHaveTextContent(
      /R\$ 1,00\s*pra\s*R\$ 22,00.*Hoje - 28\/09.*LT PT RIO 11HS.*GRUPO/,
    );
    const buttons = gridButtons();
    expect(buttons).toHaveLength(25);
    expect(buttons[0]).toHaveAccessibleName('01 Avestruz');
    expect(buttons[24]).toHaveAccessibleName('25 Vaca');
  });

  it('números vendidos ficam indisponíveis', () => {
    renderScreen(ticket('grupo'), { sold: [3] });
    expect(screen.getByRole('button', { name: '03 Burro (indisponível)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '04 Borboleta' })).toBeEnabled();
  });

  it('selecionar soma o total; "Seus palpites" mostra os números e remove ao tocar', async () => {
    renderScreen(ticket('grupo', 300));
    expect(screen.getByRole('button', { name: 'Finalizar' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '05 Cachorro' }));
    await userEvent.click(screen.getByRole('button', { name: '25 Vaca' }));
    expect(screen.getByRole('button', { name: '05 Cachorro' })).toHaveAttribute('aria-pressed', 'true');
    const chips = within(screen.getByRole('list', { name: 'Seus palpites' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['05', '25']);
    expect(screen.getByText('R$ 6,00')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remover 05 Cachorro' }));
    expect(screen.getByRole('button', { name: '05 Cachorro' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('R$ 3,00')).toBeInTheDocument();
  });

  it('Finalizar pede confirmação; cancelar mantém os palpites e não compra', async () => {
    renderScreen(ticket('grupo'));
    await userEvent.click(screen.getByRole('button', { name: '04 Borboleta' }));
    await userEvent.click(screen.getByRole('button', { name: '05 Cachorro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar' }));

    const dialog = screen.getByRole('dialog', { name: 'Confirmar compra' });
    expect(dialog).toHaveAccessibleDescription('Confirma a compra de 2 números para fazendinha?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('R$ 2,00')).toBeInTheDocument();
    expect(place).not.toHaveBeenCalled();
  });

  it('confirmar compra os palpites da cartela e entrega o resultado', async () => {
    const data = { bet: { puleNumber: 1 }, wallet: user.wallet } as never;
    place.mockResolvedValue({ ok: true, data });
    renderScreen(ticket('dezena', 300));
    await buy('05 Águia', '00 Vaca');

    expect(place).toHaveBeenCalledExactlyOnceWith({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      drawDate: '2026-09-28',
      lottery: 'LT PT RIO 11HS',
      hour: 11,
      mode: 'dezena',
      stakeCents: 300,
      prizeCents: 26_400,
      numbers: [5, 0],
    });
    expect(callbacks.onPurchased).toHaveBeenCalledExactlyOnceWith(data);
  });

  it('reenviar a mesma seleção usa a mesma chave; mudar a seleção gera outra', async () => {
    place.mockResolvedValue({ ok: false, code: 'INTERNAL_ERROR', message: 'Serviço indisponível. Tente novamente.' });
    renderScreen(ticket('grupo'));
    await buy('01 Avestruz');
    await expectError('Serviço indisponível. Tente novamente.');
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await buy('02 Águia');

    const keys = place.mock.calls.map(([input]) => (input as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('número vendido para outra pessoa: sai da seleção e vira indisponível', async () => {
    place.mockResolvedValue({
      ok: false,
      code: 'NUMBERS_UNAVAILABLE',
      message: 'Alguns palpites acabaram de ser vendidos.',
      unavailable: [4],
    });
    renderScreen(ticket('grupo'));
    await buy('04 Borboleta', '05 Cachorro');

    expect(screen.queryByRole('dialog')).toBeNull();
    await expectError('Alguns palpites acabaram de ser vendidos.');
    expect(callbacks.onSoldOut).toHaveBeenCalledExactlyOnceWith([4]);
    const chips = within(screen.getByRole('list', { name: 'Seus palpites' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['05']);
  });

  it('cotação alterada: avisa e, ao fechar, volta à lista recarregada (nada é comprado)', async () => {
    place.mockResolvedValueOnce({
      ok: false,
      code: 'QUOTE_CHANGED',
      message: 'A cotação mudou. Confira o novo prêmio antes de apostar.',
    });
    renderScreen(ticket('grupo'));
    await buy('01 Avestruz');
    expect(callbacks.onDrawClosed).not.toHaveBeenCalled();
    await expectError('A cotação mudou. Confira o novo prêmio antes de apostar.');
    expect(router.refresh).toHaveBeenCalled();
    expect(callbacks.onDrawClosed).toHaveBeenCalledOnce();
    expect(callbacks.onPurchased).not.toHaveBeenCalled();
  });

  it('sessão encerrada leva ao login; extração encerrada volta à lista', async () => {
    place.mockResolvedValueOnce({ ok: false, code: 'SESSION_INVALID', message: 'Sessão encerrada.' });
    const { unmount } = renderScreen(ticket('grupo'));
    await buy('01 Avestruz');
    expect(router.replace).toHaveBeenCalledWith('/login');
    unmount();

    place.mockResolvedValueOnce({ ok: false, code: 'DRAW_CLOSED', message: 'Extração encerrada. Escolha outra.' });
    renderScreen(ticket('grupo'));
    await buy('01 Avestruz');
    expect(callbacks.onDrawClosed).not.toHaveBeenCalled();
    await expectError('Extração encerrada. Escolha outra.');
    expect(callbacks.onDrawClosed).toHaveBeenCalledOnce();
  });

  it('dezena lista 01–99 e 00 com o bicho do grupo', () => {
    renderScreen(ticket('dezena'));
    const buttons = gridButtons();
    expect(buttons).toHaveLength(100);
    expect(buttons[4]).toHaveAccessibleName('05 Águia');
    expect(buttons[99]).toHaveAccessibleName('00 Vaca');
  });

  it('centena navega por faixas de cem', async () => {
    renderScreen(ticket('centena'));
    expect(gridButtons()[0]).toHaveAccessibleName('000 Vaca');
    await userEvent.click(screen.getByRole('button', { name: '400–499' }));
    expect(gridButtons()[13]).toHaveAccessibleName('413 Borboleta');
  });

  it('sem saldo o jogador ainda avança; a recusa da API aparece no aviso de erro e mantém os palpites', async () => {
    place.mockResolvedValue({ ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Saldo indisponível' });
    renderScreen(ticket('grupo', 2000));
    await userEvent.click(screen.getByRole('button', { name: '01 Avestruz' }));
    await userEvent.click(screen.getByRole('button', { name: '02 Águia' }));
    expect(screen.queryByText(/Saldo insuficiente/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Finalizar' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Saldo indisponível')).toHaveClass('uppercase');
    await expectError('Saldo indisponível');

    const chips = within(screen.getByRole('list', { name: 'Seus palpites' })).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['01', '02']);
    expect(callbacks.onPurchased).not.toHaveBeenCalled();
  });
});
