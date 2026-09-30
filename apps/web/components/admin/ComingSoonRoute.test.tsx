import { type Permission, ROLE_PERMISSIONS } from '@sysjb/contracts';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.fn();
vi.mock('@/lib/admin/admin-context', () => ({
  requireAdmin: () => gate(),
  can: (operator: { permissions: readonly Permission[] }, permission: Permission) =>
    operator.permissions.includes(permission),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const { default: ComingSoonRoute, comingSoonMetadata } = await import('./ComingSoonRoute');

const as = (permissions: readonly Permission[]) =>
  gate.mockResolvedValue({ ok: true, session: { operator: { permissions } } });

beforeEach(() => vi.clearAllMocks());

describe('páginas "Em breve"', () => {
  it('com a permissão do item: título, ícone e o aviso', async () => {
    as(ROLE_PERMISSIONS.FINANCE);
    render(await ComingSoonRoute({ href: '/saques' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Saques' })).toBeInTheDocument();
    expect(screen.getByText('Em breve')).toBeInTheDocument();
    expect(comingSoonMetadata('/saques')).toEqual({ title: 'Saques' });
  });

  it('sem a permissão (endereço digitado): bloqueia no servidor', async () => {
    as(ROLE_PERMISSIONS.SUPPORT);
    render(await ComingSoonRoute({ href: '/configuracoes/rotas' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sem permissão');
    expect(screen.queryByText('Em breve')).toBeNull();
  });

  it('fora do painel disponível: mostra o aviso de indisponível', async () => {
    gate.mockResolvedValue({ ok: false, hostname: null, message: 'Indisponível neste endereço.' });
    render(await ComingSoonRoute({ href: '/premios' }));
    expect(screen.getByText('Indisponível neste endereço.')).toBeInTheDocument();
  });

  it('rota fora do menu ou que já tem tela: 404 (antes de consultar a sessão)', async () => {
    await expect(ComingSoonRoute({ href: '/nao-existe' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(ComingSoonRoute({ href: '/usuarios' })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(gate).not.toHaveBeenCalled();
  });
});
