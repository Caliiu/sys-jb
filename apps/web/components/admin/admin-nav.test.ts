import { ROLE_PERMISSIONS } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, breadcrumbOf, findNavItem, isNavActive, isNavGroup } from './admin-nav';

const labels = ADMIN_NAV.map((entry) => (isNavGroup(entry) ? entry.group : entry.label));

describe('menu do painel (configuração)', () => {
  it('na ordem da imagem, com os itens de cada grupo', () => {
    expect(labels).toEqual(['Início', 'Operação', 'Relatórios', 'Carteira', 'CRM', 'Configurações']);
    const items = Object.fromEntries(ADMIN_NAV.filter(isNavGroup).map((g) => [g.group, g.items.map((i) => i.label)]));
    expect(items).toEqual({
      Operação: ['Apostadores', 'Bilhetes', 'Prêmios', 'Resumo da Operação'],
      Relatórios: ['Relatório geral', 'Comissões', 'Auditoria'],
      Carteira: ['Depósitos', 'Extrato apostador', 'Saques'],
      CRM: ['Apostadores inativos', 'Nunca depositantes'],
      Configurações: ['Grupos de cobrança', 'Rotas', 'Seções', 'Cotações', 'Sorteios', 'Mural', 'Personalização'],
    });
  });

  it('endereços únicos e toda permissão existe em algum perfil', () => {
    const links = ADMIN_NAV.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]));
    expect(new Set(links.map((l) => l.href)).size).toBe(links.length);
    const granted = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const link of links) expect(granted.has(link.permission), link.label).toBe(true);
  });

  it('cadastros "em breve" de Configurações são só do Gerente', () => {
    for (const href of ['/configuracoes/grupos-cobranca', '/configuracoes/rotas', '/configuracoes/secoes']) {
      const { permission } = findNavItem(href)!.item;
      expect(ROLE_PERMISSIONS.MANAGER.includes(permission), href).toBe(true);
      expect(ROLE_PERMISSIONS.SUPPORT.includes(permission), href).toBe(false);
      expect(ROLE_PERMISSIONS.FINANCE.includes(permission), href).toBe(false);
    }
  });

  it('página ativa: a própria rota e as subpáginas; Início só na raiz', () => {
    expect(isNavActive('/usuarios', '/usuarios')).toBe(true);
    expect(isNavActive('/usuarios/abc', '/usuarios')).toBe(true);
    expect(isNavActive('/usuarios-x', '/usuarios')).toBe(false);
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/usuarios', '/')).toBe(false);
    expect(isNavActive('/personalizacao/cards-inicio', '/personalizacao')).toBe(true);
  });

  it('trilha: grupo › item (subpágina conta como o item); fora do menu, vazia', () => {
    expect(breadcrumbOf('/')).toEqual(['Início']);
    expect(breadcrumbOf('/usuarios/abc')).toEqual(['Operação', 'Apostadores']);
    expect(breadcrumbOf('/relatorios/geral')).toEqual(['Relatórios', 'Relatório geral']);
    expect(breadcrumbOf('/personalizacao/cards-inicio')).toEqual(['Configurações', 'Personalização']);
    expect(breadcrumbOf('/login')).toEqual([]);
  });

  it('acha o item e o grupo pela rota exata', () => {
    expect(findNavItem('/saques')).toMatchObject({
      item: { label: 'Saques', soon: true },
      group: { group: 'Carteira' },
    });
    expect(findNavItem('/')).toMatchObject({ item: { label: 'Início' }, group: null });
    expect(findNavItem('/nao-existe')).toBeNull();
  });
});
