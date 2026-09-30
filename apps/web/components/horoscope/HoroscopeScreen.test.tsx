import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BICHOS } from '@/lib/fazendinha';
import type { PublicHoroscopeReading } from '@sysjb/contracts';
import { type ZodiacSign, dailyReading, readingFor } from '@/lib/horoscope';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/loterias/horoscopo' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const { default: HoroscopeScreen } = await import('./HoroscopeScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');

const DATE = '2026-09-30';
const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

const show = (userSign: ZodiacSign | null = 'aries', official: PublicHoroscopeReading[] = []) =>
  renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <HoroscopeScreen date={DATE} userSign={userSign} official={official} />
    </InviteProvider>,
  );

const signButton = (name: string) =>
  within(screen.getByRole('group', { name: 'Signos' })).getByRole('button', { name });

describe('Horóscopo', () => {
  it('abre no signo do jogador, com o texto e os palpites do dia', () => {
    show('escorpiao');
    const reading = dailyReading('escorpiao', DATE);
    expect(screen.getByRole('heading', { level: 1, name: 'Horóscopo do dia' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Escorpião' })).toBeInTheDocument();
    expect(screen.getByText('Hoje, seu signo')).toBeInTheDocument();
    expect(screen.getByText(reading.text)).toBeInTheDocument();
    expect(signButton('Escorpião')).toHaveAttribute('aria-pressed', 'true');

    const { group, tens, hundreds, thousands } = reading.tips;
    expect(screen.getByRole('button', { name: `Copiar grupo ${group}, ${BICHOS[group - 1]}` })).toBeInTheDocument();
    for (const [row, numbers] of [
      ['Dezenas', tens],
      ['Centenas', hundreds],
      ['Milhares', thousands],
    ] as const) {
      const section = screen.getByRole('region', { name: row });
      expect(
        within(section)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(numbers);
    }
  });

  it('outro signo: troca leitura e destaque; "seu signo" só no do jogador', async () => {
    show('aries');
    await userEvent.click(signButton('Peixes'));
    expect(screen.getByRole('heading', { level: 2, name: 'Peixes' })).toBeInTheDocument();
    expect(screen.queryByText('Hoje, seu signo')).not.toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText(dailyReading('peixes', DATE).text)).toBeInTheDocument();
    expect(signButton('Peixes')).toHaveAttribute('aria-pressed', 'true');
    expect(signButton('Áries')).toHaveAttribute('aria-pressed', 'false');
  });

  it('sem o signo do jogador: abre em Áries, sem "seu signo"', () => {
    show(null);
    expect(screen.getByRole('heading', { level: 2, name: 'Áries' })).toBeInTheDocument();
    expect(screen.queryByText('Hoje, seu signo')).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Signos' })).getAllByRole('button')).toHaveLength(12);
  });

  it('toque copia: um número, o grupo com 2 dígitos e "Copiar todas" separado por espaço', async () => {
    show('aries');
    const { group, tens, thousands } = dailyReading('aries', DATE).tips;

    await userEvent.click(screen.getByRole('button', { name: `Copiar dezena ${tens[0]}` }));
    expect(writeText).toHaveBeenLastCalledWith(tens[0]);
    expect(screen.getByRole('status')).toHaveTextContent(`Copiado: ${tens[0]}`);

    await userEvent.click(screen.getByRole('button', { name: /^Copiar grupo/ }));
    expect(writeText).toHaveBeenLastCalledWith(String(group).padStart(2, '0'));

    await userEvent.click(screen.getByRole('button', { name: 'Copiar todas as milhares' }));
    expect(writeText).toHaveBeenLastCalledWith(thousands.join(' '));
  });

  it('cópia bloqueada pelo navegador avisa', async () => {
    writeText.mockRejectedValue(new Error('negado'));
    show('aries');
    await userEvent.click(screen.getByRole('button', { name: 'Copiar todas as dezenas' }));
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível copiar.');
  });

  it('previsão do provedor: texto, cores, as 5 dezenas dele e o grupo da 1ª dezena; signo sem previsão usa a local', async () => {
    const aries: PublicHoroscopeReading = {
      sign: 'aries',
      text: 'Trabalho: a Lua em Gêmeos deixa seu poder de comunicação tinindo.',
      tens: ['78', '04', '46', '45', '68'],
      colors: ['Verde-pistache-claro'],
    };
    show('aries', [aries]);
    expect(screen.getByText(aries.text)).toBeInTheDocument();
    expect(screen.getByText('Cores do dia:').parentElement).toHaveTextContent('Cores do dia:Verde-pistache-claro');
    const dezenas = screen.getByRole('region', { name: 'Dezenas' });
    expect(
      within(dezenas)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(aries.tens);
    // 78 → grupo 20 (Peru).
    expect(screen.getByRole('button', { name: 'Copiar grupo 20, Peru' })).toBeInTheDocument();
    const { hundreds } = readingFor('aries', DATE, aries).tips;
    const centenas = screen.getByRole('region', { name: 'Centenas' });
    expect(
      within(centenas)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(hundreds);

    await userEvent.click(signButton('Touro'));
    expect(screen.getByText(dailyReading('touro', DATE).text)).toBeInTheDocument();
    expect(screen.queryByText('Cores do dia:')).not.toBeInTheDocument();
  });

  it('Apostar agora e Fechar levam às Loterias; Horóscopo marcado na barra de ferramentas', () => {
    show('aries');
    expect(screen.getByRole('link', { name: 'Apostar agora' })).toHaveAttribute('href', '/loterias');
    expect(screen.getByRole('link', { name: 'Fechar' })).toHaveAttribute('href', '/loterias');
    const tools = within(screen.getByRole('navigation', { name: 'Ferramentas' }));
    expect(tools.getByRole('link', { name: 'Horóscopo' })).toHaveAttribute('aria-current', 'page');
    expect(tools.getByRole('link', { name: 'Prêmio' })).not.toHaveAttribute('aria-current');
  });
});
