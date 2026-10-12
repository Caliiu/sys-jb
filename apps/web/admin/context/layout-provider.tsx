'use client';

import { createContext, useContext, useState } from 'react';
import { setCookie } from '@/admin/lib/cookies';
import {
  type Collapsible,
  DEFAULT_COLLAPSIBLE,
  DEFAULT_VARIANT,
  LAYOUT_COLLAPSIBLE_COOKIE_NAME,
  LAYOUT_COOKIE_MAX_AGE,
  LAYOUT_VARIANT_COOKIE_NAME,
  type Variant,
} from '@/admin/lib/layout';

export type { Collapsible, Variant };

type LayoutContextType = {
  resetLayout: () => void;

  defaultCollapsible: Collapsible;
  collapsible: Collapsible;
  setCollapsible: (collapsible: Collapsible) => void;

  defaultVariant: Variant;
  variant: Variant;
  setVariant: (variant: Variant) => void;
};

const LayoutContext = createContext<LayoutContextType | null>(null);

type LayoutProviderProps = {
  children: React.ReactNode;
  /** Valores dos cookies, lidos no servidor: servidor e cliente começam iguais. */
  initialCollapsible?: Collapsible;
  initialVariant?: Variant;
};

export function LayoutProvider({
  children,
  initialCollapsible = DEFAULT_COLLAPSIBLE,
  initialVariant = DEFAULT_VARIANT,
}: LayoutProviderProps) {
  const [collapsible, _setCollapsible] = useState<Collapsible>(initialCollapsible);
  const [variant, _setVariant] = useState<Variant>(initialVariant);

  const setCollapsible = (newCollapsible: Collapsible) => {
    _setCollapsible(newCollapsible);
    setCookie(LAYOUT_COLLAPSIBLE_COOKIE_NAME, newCollapsible, LAYOUT_COOKIE_MAX_AGE);
  };

  const setVariant = (newVariant: Variant) => {
    _setVariant(newVariant);
    setCookie(LAYOUT_VARIANT_COOKIE_NAME, newVariant, LAYOUT_COOKIE_MAX_AGE);
  };

  const resetLayout = () => {
    setCollapsible(DEFAULT_COLLAPSIBLE);
    setVariant(DEFAULT_VARIANT);
  };

  const contextValue: LayoutContextType = {
    resetLayout,
    defaultCollapsible: DEFAULT_COLLAPSIBLE,
    collapsible,
    setCollapsible,
    defaultVariant: DEFAULT_VARIANT,
    variant,
    setVariant,
  };

  return <LayoutContext value={contextValue}>{children}</LayoutContext>;
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}
