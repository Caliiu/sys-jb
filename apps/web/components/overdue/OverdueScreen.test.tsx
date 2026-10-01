import { type DrawOverdueResponse, type PublicDraw, overdueGroups } from '@sysjb/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/loterias/atrasados' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const { default: OverdueScreen } = await import('./OverdueScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');

const draw = (id: string, group: string, name: string, hour: number): PublicDraw => ({
  id,
  group,
  name,
  hour,
  drawTime: `${String(hour).padStart(2, '0')}:20`,
  closesAt: `${String(hour).padStart(2, '0')}:18`,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  games: ['lotteries'],
  result: { lottery: 'rj', extraction: hour },
});

const RIO_09 = draw('11111111-1111-4111-8111-111111111111', 'RIO/FEDERAL', 'LT PT RIO 09HS', 9);
const RIO_11 = draw('22222222-2222-4222-8222-222222222222', 'RIO/FEDERAL', 'LT PT RIO 11HS', 11);
const LOOK = draw('33333333-3333-4333-8333-333333333333', 'LOOK/GOIAS', 'LT LOOK 09HS', 9);
const DRAWS = [RIO_09, RIO_11, LOOK];

const TODAY = '2026-10-01';
const OVERDUE: DrawOverdueResponse = {
  drawId: RIO_09.id,
  drawName: RIO_09.name,
  date: TODAY,
  source: 'provider',
  groups: overdueGroups(
    [
      // Galo (13) há 110 dias; Coelho (10) há 92; Peru (20) ontem; Cachorro (5) hoje. Os outros 21 sem registro.
      { date: '2026-06-13', prizes: ['1252'] },
      { date: '2026-07-01', prizes: ['3340'] },
      { date: '2026-09-30', prizes: ['0078'] },
      { date: TODAY, prizes: ['9918'] },
    ],
    TODAY,
  ),
};

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  router.push.mockReset();
  router.refresh.mockReset();
});

const show = (props: Partial<Parameters<typeof OverdueScreen>[0]> = {}) =>
  renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <OverdueScreen draws={DRAWS} selectedId={null} overdue={null} failed={false} {...props} />
    </InviteProvider>,
  );

const searchButton = () => screen.getByRole('button', { name: /Buscar atrasados|Buscando/ });

describe('Atrasados', () => {
  it('abre sem loteria: "Selecionar" e a busca desativada; Atrasados marcado na barra', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Atrasados' })).toBeInTheDocument();
    expect(screen.getByText('Bichos que não saem há dias')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loteria: Selecionar' })).toBeInTheDocument();
    expect(searchButton()).toBeDisabled();
    expect(screen.queryByRole('list', { name: /Atrasados em/ })).not.toBeInTheDocument();
    const tools = within(screen.getByRole('navigation', { name: 'Ferramentas' }));
    expect(tools.getByRole('link', { name: 'Atrasados' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Fechar' })).toHaveAttribute('href', '/loterias');
  });

  it('escolhe a loteria pela sanfona e busca pela URL do sorteio', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Loteria: Selecionar' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Escolha a loteria' }));
    // Grupos fechados, na ordem do cadastro.
    const groups = sheet.getAllByRole('button', { expanded: false });
    expect(groups.map((b) => b.textContent)).toEqual(['RIO/FEDERAL', 'LOOK/GOIAS']);

    await userEvent.click(sheet.getByRole('button', { name: 'RIO/FEDERAL' }));
    const rio = within(sheet.getByRole('list', { name: 'Extrações RIO/FEDERAL' }));
    expect(rio.getAllByRole('button').map((b) => b.textContent)).toEqual(['LT PT RIO 09HS', 'LT PT RIO 11HS']);
    await userEvent.click(rio.getByRole('button', { name: 'LT PT RIO 11HS' }));

    expect(screen.queryByRole('dialog', { name: 'Escolha a loteria' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loteria: LT PT RIO 11HS' })).toBeInTheDocument();
    await userEvent.click(searchButton());
    expect(router.push).toHaveBeenCalledWith(`/loterias/atrasados?sorteio=${RIO_11.id}`, { scroll: false });
  });

  it('com o resultado: os 25 bichos do mais atrasado ao mais recente, com os textos de dias', () => {
    show({ selectedId: RIO_09.id, overdue: OVERDUE });
    const list = screen.getByRole('region', { name: 'Atrasados em LT PT RIO 09HS' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(25);
    // Sem registro primeiro; no fim, 110 dias, 92 dias, ontem e hoje.
    expect(rows[0]).toHaveTextContent('01AvestruzSem registro de saída');
    expect(rows.slice(-4).map((r) => r.textContent)).toEqual([
      '13GaloSaiu há 110 dias',
      '10CoelhoSaiu há 92 dias',
      '20PeruSaiu há 1 dia',
      '05CachorroSaiu hoje',
    ]);
    expect(screen.getByRole('link', { name: 'Apostar agora' })).toHaveAttribute('href', '/loterias');
  });

  it('buscar de novo o mesmo sorteio recarrega em vez de navegar', async () => {
    show({ selectedId: RIO_09.id, overdue: OVERDUE });
    await userEvent.click(searchButton());
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a folha abre no grupo do sorteio escolhido, com ele marcado', async () => {
    show({ selectedId: LOOK.id });
    await userEvent.click(screen.getByRole('button', { name: 'Loteria: LT LOOK 09HS' }));
    const sheet = within(screen.getByRole('dialog', { name: 'Escolha a loteria' }));
    expect(sheet.getByRole('button', { name: 'LOOK/GOIAS' })).toHaveAttribute('aria-expanded', 'true');
    expect(sheet.getByRole('button', { name: 'LT LOOK 09HS' })).toHaveAttribute('aria-pressed', 'true');
    expect(sheet.getByRole('button', { name: 'RIO/FEDERAL' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('toque copia o grupo com 2 dígitos; cópia bloqueada avisa', async () => {
    show({ selectedId: RIO_09.id, overdue: OVERDUE });
    await userEvent.click(screen.getByRole('button', { name: 'Copiar grupo 05, Cachorro' }));
    expect(writeText).toHaveBeenLastCalledWith('05');
    expect(screen.getByRole('status')).toHaveTextContent('Copiado: 05');

    writeText.mockRejectedValue(new Error('negado'));
    await userEvent.click(screen.getByRole('button', { name: 'Copiar grupo 13, Galo' }));
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível copiar.');
  });

  it('falha na busca avisa; sem loterias com resultado avisa', () => {
    const { unmount } = show({ selectedId: RIO_09.id, failed: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível buscar os atrasados. Tente novamente.');
    unmount();
    show({ draws: [] });
    expect(screen.getByText('Nenhuma loteria com resultados disponível.')).toBeInTheDocument();
  });
});
