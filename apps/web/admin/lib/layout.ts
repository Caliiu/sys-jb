// Preferências de layout do painel guardadas em cookie (sem 'use client': o layout do servidor lê os cookies e passa
// os valores iniciais; o LayoutProvider e o menu lateral gravam).

export type Collapsible = 'offcanvas' | 'icon' | 'none';
export type Variant = 'inset' | 'sidebar' | 'floating';

export const LAYOUT_COLLAPSIBLE_COOKIE_NAME = 'layout_collapsible';
export const LAYOUT_VARIANT_COOKIE_NAME = 'layout_variant';
/** Menu aberto ou recolhido (gravado pelo componente Sidebar do shadcn). */
export const SIDEBAR_COOKIE_NAME = 'sidebar_state';
export const LAYOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export const DEFAULT_VARIANT: Variant = 'inset';
export const DEFAULT_COLLAPSIBLE: Collapsible = 'icon';

export const parseCollapsible = (value: string | undefined): Collapsible =>
  value === 'offcanvas' || value === 'icon' || value === 'none' ? value : DEFAULT_COLLAPSIBLE;

export const parseVariant = (value: string | undefined): Variant =>
  value === 'inset' || value === 'sidebar' || value === 'floating' ? value : DEFAULT_VARIANT;
