import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HOW_TO_PLAY_TOPICS } from '@/lib/how-to-play';
import { ROUTES } from '@/lib/routes';
import { renderWithProviders, router } from '@/test/render';

vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/como-jogar' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ logout: vi.fn() }) }));

const { default: HowToPlayScreen } = await import('./HowToPlayScreen');
const { InviteProvider } = await import('../dashboard/InviteProvider');

const show = () =>
  renderWithProviders(
    <InviteProvider inviteCode="CDYGE">
      <HowToPlayScreen topics={HOW_TO_PLAY_TOPICS} />
    </InviteProvider>,
  );

describe('Como jogar', () => {
  it('título, voltar ao início e um cartão por assunto, na ordem', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Como jogar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
    const cards = [...document.querySelectorAll('main > details > summary')];
    expect(cards).toHaveLength(HOW_TO_PLAY_TOPICS.length);
    expect(cards.map((s) => s.textContent)).toEqual([
      'Recarregue sua conta',
      'Tradicional (1/7)',
      'Tradicional 1/10',
      'Colocações',
      'Modalidades',
      'Tabela de Inversão',
      'Fazendinha',
      'Acompanhe suas apostas',
      'Prêmios e saque',
    ]);
  });

  it('o cartão abre ao tocar e mostra o passo a passo e o atalho', async () => {
    show();
    const card = screen.getByText('Tradicional (1/7)').closest('details')!;
    expect(card).not.toHaveAttribute('open');
    await userEvent.click(screen.getByText('Tradicional (1/7)'));
    expect(card).toHaveAttribute('open');
    const steps = within(card).getAllByRole('listitem');
    expect(steps[0]).toHaveTextContent('Em Loterias, toque em "Tradicional".');
    expect(within(card).getByRole('link', { name: 'Apostar agora' })).toHaveAttribute('href', '/loterias');
  });

  it('Modalidades: as 42 do texto da operação, cada uma abre com "Joga-se" e "Ganha"', async () => {
    show();
    await userEvent.click(screen.getByText('Modalidades', { selector: 'summary span' }));
    const list = screen.getByRole('list', { name: 'Modalidades' });
    const names = within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('summary')!.textContent);
    expect(names).toHaveLength(42);
    expect(names.slice(0, 3)).toEqual(['Centena', 'Centena Invertida', 'Centena 3X']);
    expect(names.at(-1)).toBe('Passe Vai e Vem');

    const seninha = screen.getByText('Seninha').closest('details')!;
    expect(seninha).not.toHaveAttribute('open');
    await userEvent.click(screen.getByText('Seninha'));
    expect(seninha).toHaveAttribute('open');
    // Rótulos só para leitor de tela: "Como joga" e "Observação".
    expect(seninha).toHaveTextContent(
      'Como jogaJoga-se a partir de 14 dezenas.Ganha: Acertando 06 dezenas.ObservaçãoSorte Extra: ganhe com 4, 5 e 6 acertos.',
    );
  });

  it('Tabela de Inversão: cada tabela abre com cabeçalho e linhas', async () => {
    show();
    await userEvent.click(screen.getByText('Tabela de Inversão', { selector: 'summary span' }));
    const tables = screen.getByRole('list', { name: 'Tabelas' });
    expect(within(tables).getAllByRole('listitem')).toHaveLength(6);

    await userEvent.click(within(tables).getByText('Centena Invertida', { selector: 'summary span' }));
    const table = screen.getByRole('table', { name: 'Centena Invertida' });
    const rows = within(table).getAllByRole('row');
    expect(rows[0]).toHaveTextContent('AlgarismosExemploInversões');
    expect(rows[1]).toHaveTextContent('31236');
    expect(rows).toHaveLength(1 + 63);
  });

  it('todo atalho leva a uma rota do app', () => {
    const routes = new Set<string>(Object.values(ROUTES));
    for (const topic of HOW_TO_PLAY_TOPICS) {
      if (topic.link) expect(routes.has(topic.link.href), topic.id).toBe(true);
      expect((topic.steps?.length ?? 0) + (topic.notes?.length ?? 0), topic.id).toBeGreaterThan(0);
    }
  });
});
