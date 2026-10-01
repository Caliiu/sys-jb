import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PlaceLotteryTicketsResponse, type PublicQuotes, defaultQuotes } from '@sysjb/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_SCHEDULE } from '@/test/draws';
import { renderWithProviders, router, user } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/loterias' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('@/app/lottery-actions', () => ({ placeLotteryTicketsAction: vi.fn(), repeatLotteryTicketAction: vi.fn() }));

const { placeLotteryTicketsAction } = await import('@/app/lottery-actions');
const { default: LotteriesScreen } = await import('./LotteriesScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');
const place = vi.mocked(placeLotteryTicketsAction);

// Segunda, 28/09/2026 10:30 em Brasília.
const NOW = '2026-09-28T13:30:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

function renderScreen(quotes: PublicQuotes = defaultQuotes()) {
  return renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <LotteriesScreen
        nowIso={NOW}
        wallet={user.wallet}
        quotes={quotes}
        schedule={TEST_SCHEDULE}
        sellerId={100042}
        userName="Pessoa Sintética"
      />
    </InviteProvider>,
  );
}

const click = (name: string | RegExp) => userEvent.click(screen.getAllByRole('button', { name })[0]!);
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

/** Tradicional → amanhã → Milhar → 1 PRÊMIO → palpite 3452 → R$ 1,00 → LT PT RIO 14HS → carrinho. */
async function buildCart() {
  await click(/^Tradicional\s*Tradicionais 1\/7/);
  await click(/29\/09\/2026/);
  await click(/^MILHARs*8000x/);
  await click(/^1 PRÊMIO/);
  await userEvent.type(screen.getByLabelText('Digite seu palpite'), '3452');
  await click('Avançar');
  await userEvent.type(screen.getByLabelText('Valor da aposta'), '100');
  await click('Avançar');
  await click(/^RIO\/FEDERAL/);
  await userEvent.click(screen.getByRole('checkbox', { name: /LT PT RIO 14HS/ }));
  await click('Avançar');
}

describe('Loterias', () => {
  it('primeira tela: tipos de jogo (só o Tradicional abre), Repetir pule e ferramentas "em breve"', async () => {
    renderScreen();
    expect(heading()).toBe('Nova aposta');
    expect(screen.getByText('Olá, Pessoa Sintética')).toBeInTheDocument();
    expect(screen.getByText('100042')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Etapa 1 de 9' })).toBeInTheDocument();
    await click(/Quininha/);
    expect(screen.getByRole('status')).toHaveTextContent('Quininha: disponível em breve.');
    // Repetir pule abre o próprio fluxo (RepeatPuleFlow.test.tsx) e volta para cá.
    await click(/Repetir pule/);
    expect(heading()).toBe('Repetir pule');
    await click('Voltar às loterias');
    expect(heading()).toBe('Nova aposta');
    const tools = within(screen.getByRole('navigation', { name: 'Ferramentas' }));
    // Prêmio e Horóscopo abrem as páginas deles; as outras ainda são "em breve".
    expect(tools.getByRole('link', { name: 'Prêmio' })).toHaveAttribute('href', '/loterias/calcular');
    expect(tools.getByRole('link', { name: 'Horóscopo' })).toHaveAttribute('href', '/loterias/horoscopo');
    expect(tools.getAllByRole('button').map((b) => b.textContent)).toEqual(['Sonhos', 'Atrasados']);
  });

  it('fluxo completo até o carrinho, com as etapas e o resumo de cada uma', async () => {
    renderScreen();
    await click(/^Tradicional\s*Tradicionais 1\/7/);
    expect(heading()).toBe('Data');
    const days = within(screen.getByRole('list', { name: 'Datas' })).getAllByRole('button');
    expect(days).toHaveLength(7);
    // Cartões: título (Hoje/Amanhã/dia da semana), dia do mês e a etiqueta nos dias com Federal (qua e dom).
    expect(days.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Hoje, 28/09/2026',
      'Amanhã, 29/09/2026',
      'Quarta, 30/09/2026, com Federal',
      'Quinta, 01/10/2026',
      'Sexta, 02/10/2026',
      'Sábado, 03/10/2026',
      'Domingo, 04/10/2026, com Federal',
    ]);
    expect(days[0]).toHaveTextContent('Hoje28');

    await userEvent.click(days[1]!);
    expect(heading()).toBe('Modalidade');
    expect(screen.getByText('29/09/2026 · Terça')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar modalidade'), 'dez');
    expect(
      within(screen.getByRole('list', { name: 'Modalidades' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'DEZENA80x',
      'DEZENA ESQ80x',
      'DEZENA MEIO80x',
      'DUQUE DEZ300x',
      'TERNO DEZ5000x',
      'TERNO DEZ SECO10000x',
    ]);
    await userEvent.clear(screen.getByLabelText('Buscar modalidade'));
    await click(/^MILHARs*8000x/);

    expect(heading()).toBe('Colocação');
    await click(/^1 PRÊMIO/);
    expect(heading()).toBe('Palpites');
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Digite seu palpite'), '3452');
    expect(screen.getByRole('button', { name: 'Remover palpite 3452' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Digite seu palpite'), '3452');
    expect(screen.getByText('Você já tem o palpite 3452.')).toBeInTheDocument();
    await click('Avançar');

    expect(heading()).toBe('Valor');
    await userEvent.click(screen.getByRole('button', { name: /\+20/ }));
    expect(screen.getByLabelText('Valor da aposta')).toHaveValue('R$ 20,00');
    await userEvent.click(screen.getByRole('radio', { name: 'Cada' }));
    await click('Avançar');

    expect(heading()).toBe('Loterias');
    await click(/^RIO\/FEDERAL/);
    const draws = within(screen.getByRole('list', { name: 'Extrações RIO/FEDERAL' })).getAllByRole('checkbox');
    expect(draws.map((d) => d.textContent)).toEqual([
      'LT PT RIO 09HS09:18',
      'LT PT RIO 11HS11:18',
      'LT PT RIO 14HS14:18',
      'LT PT RIO 16HS16:18',
      'LT PT RIO 21HS21:18',
    ]);
    await userEvent.click(draws[2]!);
    await userEvent.click(draws[3]!);
    expect(screen.getByLabelText('2 escolhidas')).toBeInTheDocument();
    await click('Avançar');

    expect(heading()).toBe('Carrinho');
    expect(screen.getByRole('region', { name: 'Total da aposta' })).toHaveTextContent(
      /R\$ 40,00.*Vale.*Terça 29\/09\/2026.*2 loterias/,
    );
    const bet = within(screen.getByRole('list', { name: 'Suas apostas' })).getAllByRole('listitem')[0]!;
    expect(bet).toHaveTextContent(/MILHAR · 1 PRÊMIO.*3452.*R\$ 20,00.*\/ CADA/);
  });

  it('Voltar depois do valor segue o fluxo até o início (sem Carrinho ⇄ Loterias) e reabre a aposta', async () => {
    renderScreen();
    await buildCart();
    expect(heading()).toBe('Carrinho');
    await click('Voltar');
    expect(heading()).toBe('Loterias');
    // A aposta sai do carrinho e reabre no Valor com o que foi escolhido.
    await click('Voltar');
    expect(heading()).toBe('Valor');
    expect(screen.getByLabelText('Valor da aposta')).toHaveValue('R$ 1,00');
    await click('Voltar');
    expect(heading()).toBe('Palpites');
    expect(screen.getByRole('button', { name: 'Remover palpite 3452' })).toBeInTheDocument();
    for (const title of ['Colocação', 'Modalidade', 'Data', 'Nova aposta']) {
      await click('Voltar');
      expect(heading()).toBe(title);
    }
  });

  it('reabrir a aposta e avançar de novo não a duplica no carrinho', async () => {
    renderScreen();
    await buildCart();
    await click('Voltar');
    await click('Voltar');
    expect(heading()).toBe('Valor');
    // As loterias escolhidas continuam: o Avançar volta direto ao carrinho.
    await click('Avançar');
    expect(heading()).toBe('Carrinho');
    expect(
      within(screen.getByRole('list', { name: 'Suas apostas' })).getAllByRole('heading', { level: 3 }),
    ).toHaveLength(1);
  });

  it('combos voltam dos palpites direto para a modalidade (a colocação é fixa)', async () => {
    renderScreen();
    await click(/^Tradicional\s*Tradicionais 1\/7/);
    await click(/29\/09\/2026/);
    await click(/^DUQUE GP/);
    expect(heading()).toBe('Palpites');
    await click('Voltar');
    expect(heading()).toBe('Modalidade');
  });

  it('Colar: separa o "Copiar todas" do Horóscopo (com traço) nos palpites da modalidade', async () => {
    const readText = vi.fn().mockResolvedValue('9857-9958-9659-9760');
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
    renderScreen();
    await click(/^Tradicional\s*Tradicionais 1\/7/);
    await click(/29\/09\/2026/);
    await click(/^MILHARs*8000x/);
    await click(/^1 PRÊMIO/);
    await click('Colar');
    expect(
      within(screen.getByRole('list', { name: 'Meus palpites' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['9857', '9958', '9659', '9760']);
  });

  it('Colar: números de outro tamanho avisam o que foi copiado e o que a modalidade pede', async () => {
    const readText = vi.fn().mockResolvedValue('9857-9958-9659-9760');
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
    renderScreen();
    await click(/^Tradicional\s*Tradicionais 1\/7/);
    await click(/29\/09\/2026/);
    await click(/^CENTENAs*800x/);
    await click(/^1 PRÊMIO/);
    await click('Colar');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Os números copiados são milhares (4 dígitos); CENTENA pede 3.',
    );
    expect(screen.getByText('Seus palpites aparecerão aqui.')).toBeInTheDocument();
  });

  it('hoje só mostra loterias que ainda não fecharam', async () => {
    renderScreen();
    await click(/^Tradicional\s*Tradicionais 1\/7/);
    await click(/28\/09\/2026/);
    await click(/^CENTENAs*800x/);
    await click(/^1 PRÊMIO/);
    await userEvent.type(screen.getByLabelText('Digite seu palpite'), '123');
    await click('Avançar');
    await userEvent.type(screen.getByLabelText('Valor da aposta'), '100');
    await click('Avançar');
    await click(/^RIO\/FEDERAL/);
    const names = within(screen.getByRole('list', { name: 'Extrações RIO/FEDERAL' }))
      .getAllByRole('checkbox')
      .map((d) => d.textContent);
    expect(names[0]).toBe('LT PT RIO 11HS11:18');
    expect(names.some((n) => n?.startsWith('LT PT RIO 09HS'))).toBe(false);
  });

  it('com a página aberta, a lista usa o horário do servidor que passou (não o relógio do celular)', async () => {
    // Relógio do aparelho errado (2020): só o tempo decorrido conta.
    const deviceStart = Date.parse('2020-01-01T00:00:00Z');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(deviceStart);
    try {
      renderScreen();
      await click(/^Tradicional\s*Tradicionais 1\/7/);
      await click(/28\/09\/2026/);
      await click(/^CENTENAs*800x/);
      await click(/^1 PRÊMIO/);
      await userEvent.type(screen.getByLabelText('Digite seu palpite'), '123');
      await click('Avançar');
      await userEvent.type(screen.getByLabelText('Valor da aposta'), '100');
      // Passou 1 hora: agora são 11:30 em Brasília; o LT PT RIO 11HS (venda até 11:18) fechou.
      clock.mockReturnValue(deviceStart + 60 * 60 * 1000);
      await click('Avançar');
      await click(/^RIO\/FEDERAL/);
      const names = within(screen.getByRole('list', { name: 'Extrações RIO/FEDERAL' }))
        .getAllByRole('checkbox')
        .map((d) => d.textContent);
      expect(names[0]).toBe('LT PT RIO 14HS14:18');
    } finally {
      clock.mockRestore();
    }
  });

  it('combos pulam a colocação (fixa) e aceitam os grupos juntos', async () => {
    renderScreen();
    await click(/^Tradicional\s*Tradicionais 1\/7/);
    await click(/29\/09\/2026/);
    await click(/^DUQUE GPs*180x/);
    expect(heading()).toBe('Palpites');
    await userEvent.type(screen.getByLabelText('Digite seu palpite'), '0526');
    expect(screen.getByText('Palpite inválido: grupos de 01 a 25, sem repetir.')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Digite seu palpite'));
    await userEvent.type(screen.getByLabelText('Digite seu palpite'), '0512');
    expect(screen.getByRole('button', { name: 'Remover palpite 05-12' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Surpresinha' }));
    expect(within(screen.getByRole('list', { name: 'Meus palpites' })).getAllByRole('button')).toHaveLength(2);
  });

  it('carrinho: editar pela folha e remover; "Mais apostas" volta à modalidade', async () => {
    renderScreen();
    await buildCart();
    await userEvent.click(screen.getByRole('button', { name: 'Editar aposta 1' }));
    const sheet = screen.getByRole('dialog', { name: 'MILHAR · 1 PRÊMIO' });
    await userEvent.type(within(sheet).getByLabelText('Digite seu palpite'), '9999');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remover palpite 3452' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Concluir' }));
    const bet = within(screen.getByRole('list', { name: 'Suas apostas' })).getAllByRole('listitem')[0]!;
    expect(bet).toHaveTextContent('9999');
    expect(bet).not.toHaveTextContent('3452');

    await click('Mais apostas');
    expect(heading()).toBe('Modalidade');
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(heading()).toBe('Carrinho');
    await userEvent.click(screen.getByRole('button', { name: 'Remover aposta 1' }));
    expect(heading()).toBe('Modalidade');
  });

  it('Tradicional 1/10: só as loterias da 1/10, colocações até o 10º e a compra vai com o jogo', async () => {
    place.mockResolvedValue({ ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Saldo indisponível' });
    renderScreen();
    await click(/^Tradicional 1\/10\s*Oficiais 1\/10/);
    expect(heading()).toBe('Data');
    expect(screen.getByText('Oficiais 1/10')).toBeInTheDocument();
    // A Federal não é da 1/10: sem a etiqueta nos dias dela.
    const days = within(screen.getByRole('list', { name: 'Datas' })).getAllByRole('button');
    expect(days[2]).toHaveAttribute('aria-label', 'Quarta, 30/09/2026');
    await userEvent.click(days[1]!);
    await click(/^MILHARs*8000x/);

    const placements = within(screen.getByRole('list', { name: 'Colocações' }))
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(placements).toHaveLength(55);
    expect(placements.slice(0, 4).map((p) => p.match(/^[\d/e ]+PRÊMIO/)?.[0])).toEqual([
      '1 PRÊMIO',
      '1/5 PRÊMIO',
      '1/10 PRÊMIO',
      '1 e 1/5 PRÊMIO',
    ]);
    expect(placements.some((p) => p.startsWith('10 PRÊMIO'))).toBe(true);
    expect(placements.some((p) => p.startsWith('6/9 PRÊMIO'))).toBe(false);
    await click(/^8 PRÊMIO/);
    expect(screen.getByText(/^Tradicional 1\/10 · Milhar/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Digite seu palpite'), '3452');
    await click('Avançar');
    await userEvent.type(screen.getByLabelText('Valor da aposta'), '100');
    await click('Avançar');
    // Só a Bahia é da 1/10 no cadastro de teste.
    expect(screen.queryByRole('button', { name: /^RIO\/FEDERAL/ })).not.toBeInTheDocument();
    await click(/^BAHIA/);
    await userEvent.click(screen.getByRole('checkbox', { name: /LT BAHIA 15HS/ }));
    await click('Avançar');
    await click('Avançar');
    expect(screen.getByRole('article', { name: 'Resumo LT BAHIA 15HS' })).toHaveTextContent(
      /Jogo\s*Tradicional 1\/10.*MILHAR 8 PRÊMIO/,
    );
    await click('Finalizar');
    expect(place).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        game: 'tradicional_10',
        draws: [{ name: 'LT BAHIA 15HS', hour: 15 }],
        items: [expect.objectContaining({ modality: 'milhar', placement: 'p8' })],
      }),
    );
  });

  it('voltar e escolher o outro jogo troca resumo e datas', async () => {
    renderScreen();
    await click(/^Tradicional 1\/10\s*Oficiais 1\/10/);
    expect(screen.queryByRole('button', { name: /com Federal/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(heading()).toBe('Nova aposta');
    await click(/^Tradicional\s*Tradicionais 1\/7/);
    expect(screen.getByText('Tradicionais 1/7')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /com Federal/ })).toHaveLength(2);
  });

  it('finalizar: resumo, compra com a cotação vista e recibo com o número do pule', async () => {
    const data: PlaceLotteryTicketsResponse = {
      tickets: [
        {
          puleNumber: 300000001,
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
              guesses: ['3452'],
              amountCents: 100,
              split: 'total',
              totalCents: 100,
              quoteCents: 800000,
              possiblePrizeCents: 800000,
            },
          ],
          totalCents: 100,
          quoteTable: '800/1/8000',
          createdAt: '2026-09-28T15:05:21.000Z',
          sellerId: 100042,
        },
      ],
      totalCents: 100,
      wallet: { ...user.wallet, balanceJb: 123356 },
    };
    place.mockResolvedValue({ ok: true, data });
    renderScreen();
    await buildCart();
    await click('Avançar');

    expect(heading()).toBe('Finalizar');
    const resumo = screen.getByRole('article', { name: 'Resumo LT PT RIO 14HS' });
    expect(resumo).toHaveTextContent(/Vale\s*29\/09\/2026.*Cotação\s*800\/1\/8000/);
    expect(resumo).toHaveTextContent(/MILHAR 1 PRÊMIO.*3452.*1,00 \/ TODOS.*Possível prêmio: R\$ 8\.000,00/);
    expect(resumo).toHaveTextContent(/Total jogo:\s*R\$ 1,00.*A pagar\s*R\$ 1,00/);

    await click('Finalizar');
    expect(place).toHaveBeenCalledExactlyOnceWith({
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      game: 'tradicional',
      drawDate: '2026-09-29',
      draws: [{ name: 'LT PT RIO 14HS', hour: 14 }],
      items: [
        {
          modality: 'milhar',
          placement: 'p1',
          guesses: ['3452'],
          amountCents: 100,
          split: 'total',
          quoteCents: 800000,
        },
      ],
    });
    expect(screen.getByRole('dialog', { name: 'Aposta Realizada com sucesso' })).toBeInTheDocument();
    await click('Fechar');
    expect(heading()).toBe('Sucesso');
    const recibo = screen.getByRole('article', { name: 'Recibo LT PT RIO 14HS' });
    expect(recibo).toHaveTextContent('#300000001');
    expect(recibo).toHaveTextContent('Confira sua aposta. Boa sorte!');
    expect(screen.getByRole('button', { name: 'Ocultar saldo' })).toHaveTextContent('1.234,00');

    await click('Nova aposta');
    expect(heading()).toBe('Nova aposta');
    // Fluxo mais longo do web (as 9 etapas da compra): folga para rodar com a suíte inteira.
  }, 15_000);

  it('saldo indisponível e cotação alterada aparecem no aviso; nada é perdido do carrinho', async () => {
    place.mockResolvedValueOnce({ ok: false, code: 'INSUFFICIENT_FUNDS', message: 'Saldo indisponível' });
    renderScreen();
    await buildCart();
    await click('Avançar');
    await click('Finalizar');
    const alert = screen.getByRole('alertdialog', { name: 'Ocorreu um erro' });
    expect(alert).toHaveAccessibleDescription('Saldo indisponível');
    await userEvent.click(within(alert).getByRole('button', { name: 'Fechar' }));
    expect(heading()).toBe('Finalizar');

    place.mockResolvedValueOnce({
      ok: false,
      code: 'QUOTE_CHANGED',
      message: 'A cotação mudou. Confira os prêmios antes de apostar.',
    });
    await click('Finalizar');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(router.refresh).toHaveBeenCalled();
    expect(heading()).toBe('Carrinho');
    expect(
      within(screen.getByRole('list', { name: 'Suas apostas' })).getAllByRole('heading', { level: 3 }),
    ).toHaveLength(1);
  });

  it('modalidade desligada na cotação da banca não aparece', async () => {
    const quotes = defaultQuotes();
    quotes.traditional = quotes.traditional.map((q) => (q.modality === 'milhar' ? { ...q, prizeCents: 0 } : q));
    renderScreen(quotes);
    await click(/^Tradicional\s*Tradicionais 1\/7/);
    await click(/29\/09\/2026/);
    const names = within(screen.getByRole('list', { name: 'Modalidades' }))
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(names.some((n) => n.startsWith('MILHAR'))).toBe(false);
    expect(names.some((n) => n.startsWith('CENTENA'))).toBe(true);
  });
});
