import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminLoading from '../admin/AdminLoading';
import PlayerLoading from './PlayerLoading';

describe('telas de carregamento', () => {
  it('app do jogador: anuncia "Carregando…", formas decorativas escondidas e pulsação só sem "menos movimento"', () => {
    const { container } = render(<PlayerLoading />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Carregando…');
    expect(status).toHaveClass('bg-[#F4F6F6]');
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(container.querySelector('.animate-pulse')).toBeNull();
    expect(container.querySelector('[class*="motion-safe:animate-pulse"]')).not.toBeNull();
  });

  it('cassino: fundo escuro', () => {
    render(<PlayerLoading tone="dark" />);
    expect(screen.getByRole('status')).toHaveClass('bg-[#14151c]');
  });

  it('painel: só o conteúdo, anunciado aos leitores de tela', () => {
    render(<AdminLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
  });
});
