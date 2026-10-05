import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminErrorScreen from '@/components/admin/AdminErrorScreen';
import { isEntryPath } from '@/lib/request-path';
import { tenant } from '@/test/render';
import ErrorScreen from './ErrorScreen';

describe('páginas de erro', () => {
  it('jogador: código, mensagem, logo da banca e os caminhos de volta', () => {
    render(
      <ErrorScreen
        tenant={tenant}
        code="401"
        title="Entre para continuar"
        primary={{ label: 'Entrar', href: '/login' }}
        secondary={{ label: 'Criar conta', href: '/cadastro' }}
      >
        <p>Sua sessão pode ter terminado.</p>
      </ErrorScreen>,
    );
    expect(screen.getByText('401')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entre para continuar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastro');
  });

  it('painel: cartão com a marca da plataforma e o atalho', () => {
    render(
      <AdminErrorScreen code="404" title="Página não encontrada" primary={{ label: 'Voltar ao painel', href: '/' }}>
        O endereço não existe.
      </AdminErrorScreen>,
    );
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Fenix iGaming' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao painel' })).toHaveAttribute('href', '/');
  });

  it('só a entrada (/) vai direto ao login; o resto mostra 401', () => {
    expect(isEntryPath('/')).toBe(true);
    expect(isEntryPath(null)).toBe(true);
    expect(isEntryPath('/usuarios')).toBe(false);
    expect(isEntryPath('/cassino/jogo/1')).toBe(false);
  });
});
