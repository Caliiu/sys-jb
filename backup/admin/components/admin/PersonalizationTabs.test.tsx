import { ROLE_PERMISSIONS } from '@sysjb/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PersonalizationTabs, { firstPersonalizationTab } from './PersonalizationTabs';

const tabs = () =>
  within(screen.getByRole('navigation', { name: 'Personalização' }))
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);

describe('abas da Personalização', () => {
  it('Gerente: Identidade visual, Cards do início, Valores e Bônus, com a aba atual marcada', () => {
    render(<PersonalizationTabs active="values" permissions={ROLE_PERMISSIONS.MANAGER} />);
    expect(tabs()).toEqual([
      ['Identidade visual', '/personalizacao'],
      ['Cards do início', '/personalizacao/cards-inicio'],
      ['Valores', '/personalizacao/valores'],
      ['Bônus', '/personalizacao/bonus'],
    ]);
    expect(screen.getByRole('link', { name: 'Valores' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Identidade visual' })).not.toHaveAttribute('aria-current');
  });

  it('Financeiro: só Valores e Bônus (sem a identidade visual)', () => {
    render(<PersonalizationTabs active="bonus" permissions={ROLE_PERMISSIONS.FINANCE} />);
    expect(tabs()).toEqual([
      ['Valores', '/personalizacao/valores'],
      ['Bônus', '/personalizacao/bonus'],
    ]);
    expect(screen.getByRole('link', { name: 'Bônus' })).toHaveAttribute('aria-current', 'page');
  });

  it('a primeira aba que o perfil pode abrir', () => {
    expect(firstPersonalizationTab(ROLE_PERMISSIONS.MANAGER)?.key).toBe('branding');
    expect(firstPersonalizationTab(ROLE_PERMISSIONS.FINANCE)?.href).toBe('/personalizacao/valores');
    expect(firstPersonalizationTab(ROLE_PERMISSIONS.SUPPORT)).toBeNull();
  });
});
