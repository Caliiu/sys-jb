'use client';

import { ConfigDrawer } from '@/admin/components/config-drawer';
import { ProfileDropdown } from '@/admin/components/profile-dropdown';
import { Search } from '@/admin/components/search';
import { ThemeSwitch } from '@/admin/components/theme-switch';
import { Header } from './header';

/**
 * Cabeçalho padrão das páginas do template (busca, tema, aparência e conta). No template cada página o desenha; aqui
 * fica no layout do painel, para não sumir enquanto a próxima página carrega no servidor.
 */
export function AppHeader() {
  return (
    // Fora da impressão dos relatórios (Imprimir das listas).
    <Header fixed className="print:hidden">
      <Search />
      <div className="ms-auto flex items-center space-x-4">
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </div>
    </Header>
  );
}
