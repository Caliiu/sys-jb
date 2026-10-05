import { ROLE_PERMISSIONS } from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_NAV,
  ADMIN_NAV_FOOTER,
  allNavLinks,
  breadcrumbOf,
  canSeeNavLink,
  findNavItem,
  isNavActive,
  isNavGroup,
  isNavSection,
  type NavGroup,
} from './admin-nav';

const labels = ADMIN_NAV.map((entry) => (isNavGroup(entry) ? entry.group : entry.label));
/** Itens do grupo: link pelo nome; subgrupo como { subgrupo: [itens] }. */
const shape = (group: NavGroup) =>
  group.items.map((item) => (isNavSection(item) ? { [item.section]: item.items.map((i) => i.label) } : item.label));

describe('menu do painel (configuração)', () => {
  it('na ordem da imagem, com os itens (e subgrupos) de cada grupo', () => {
    expect(labels).toEqual(['Início', 'Operação', 'Relatórios', 'Carteira', 'CRM', 'Configurações']);
    const items = Object.fromEntries(ADMIN_NAV.filter(isNavGroup).map((g) => [g.group, shape(g)]));
    expect(items).toEqual({
      Operação: ['Apostadores', 'Pules', 'Pules Premiadas', 'Resumo da Operação'],
      Relatórios: [
        'Relatório geral',
        { Cassino: ['Geral cassino', 'Fechamento cassino'] },
        { Loterias: ['Vendas por extração'] },
      ],
      Carteira: ['Depósitos', 'Extrato apostador', 'Saques'],
      CRM: ['Apostadores inativos', 'Nunca depositantes'],
      Configurações: ['Grupos de cobrança', 'Rotas', 'Seções', 'Cotações', 'Sorteios', 'Mural', 'Personalização'],
    });
    expect(
      ADMIN_NAV.filter(isNavGroup)
        .filter((g) => g.display === 'panel')
        .map((g) => g.group),
    ).toEqual(['Relatórios']);
    expect(ADMIN_NAV_FOOTER.map((g) => [g.group, shape(g)])).toEqual([
      ['Administração', ['Operadores', 'Log de auditoria']],
    ]);
  });

  it('endereços únicos e toda permissão existe em algum perfil', () => {
    const links = allNavLinks().map(({ item }) => item);
    expect(new Set(links.map((l) => l.href)).size).toBe(links.length);
    const granted = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const link of links) {
      const list = typeof link.permission === 'string' ? [link.permission] : link.permission;
      for (const permission of list) expect(granted.has(permission), link.label).toBe(true);
    }
  });

  it('relatórios são financeiros: Gerente e Financeiro, não o Suporte', () => {
    for (const { item } of allNavLinks().filter(({ group }) => group?.group === 'Relatórios')) {
      expect(canSeeNavLink(ROLE_PERMISSIONS.MANAGER, item), item.label).toBe(true);
      expect(canSeeNavLink(ROLE_PERMISSIONS.FINANCE, item), item.label).toBe(true);
      expect(canSeeNavLink(ROLE_PERMISSIONS.SUPPORT, item), item.label).toBe(false);
    }
  });

  it('cadastros "em breve" de Configurações são só do Gerente', () => {
    for (const href of ['/configuracoes/grupos-cobranca', '/configuracoes/rotas', '/configuracoes/secoes']) {
      const { permission } = findNavItem(href)!.item;
      expect(canSeeNavLink(ROLE_PERMISSIONS.MANAGER, { permission }), href).toBe(true);
      expect(canSeeNavLink(ROLE_PERMISSIONS.SUPPORT, { permission }), href).toBe(false);
      expect(canSeeNavLink(ROLE_PERMISSIONS.FINANCE, { permission }), href).toBe(false);
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

  it('trilha: grupo › subgrupo › item (subpágina conta como o item); rodapé também; fora do menu, vazia', () => {
    expect(breadcrumbOf('/')).toEqual(['Início']);
    expect(breadcrumbOf('/usuarios/abc')).toEqual(['Operação', 'Apostadores']);
    expect(breadcrumbOf('/relatorios/geral')).toEqual(['Relatórios', 'Relatório geral']);
    expect(breadcrumbOf('/relatorios/cassino/fechamento')).toEqual(['Relatórios', 'Cassino', 'Fechamento cassino']);
    expect(breadcrumbOf('/relatorios/loterias/vendas-por-extracao')).toEqual([
      'Relatórios',
      'Loterias',
      'Vendas por extração',
    ]);
    expect(breadcrumbOf('/personalizacao/valores')).toEqual(['Configurações', 'Personalização']);
    expect(breadcrumbOf('/auditoria')).toEqual(['Administração', 'Log de auditoria']);
    expect(breadcrumbOf('/personalizacao/cards-inicio')).toEqual(['Configurações', 'Personalização']);
    expect(breadcrumbOf('/login')).toEqual([]);
  });

  it('acha o item, o grupo e o subgrupo pela rota exata', () => {
    expect(findNavItem('/crm/inativos')).toMatchObject({
      item: { label: 'Apostadores inativos', soon: true },
      group: { group: 'CRM' },
      section: null,
    });
    expect(findNavItem('/saques')).toMatchObject({ item: { label: 'Saques' }, group: { group: 'Carteira' } });
    expect(findNavItem('/saques')!.item.soon).toBeUndefined();
    expect(findNavItem('/relatorios/cassino/fechamento')).toMatchObject({
      item: { label: 'Fechamento cassino', soon: true },
      group: { group: 'Relatórios' },
      section: { section: 'Cassino' },
    });
    expect(findNavItem('/relatorios/cassino/geral')!.item.soon).toBeUndefined();
    expect(findNavItem('/auditoria')).toMatchObject({ item: { label: 'Log de auditoria' } });
    expect(findNavItem('/')).toMatchObject({ item: { label: 'Início' }, group: null, section: null });
    expect(findNavItem('/nao-existe')).toBeNull();
  });
  it('Personalização: Gerente (identidade visual) e Financeiro (só Valores) veem; Suporte não', () => {
    const { item } = findNavItem('/personalizacao')!;
    expect(canSeeNavLink(ROLE_PERMISSIONS.MANAGER, item)).toBe(true);
    expect(canSeeNavLink(ROLE_PERMISSIONS.FINANCE, item)).toBe(true);
    expect(canSeeNavLink(ROLE_PERMISSIONS.SUPPORT, item)).toBe(false);
    expect(findNavItem('/comissoes')).toBeNull();
  });
});
