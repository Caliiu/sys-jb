export interface SectionMenuItem {
  label: string;
  /** Rota da página. Sem rota, o item avisa que a funcionalidade vem em breve. */
  href?: string;
}

export interface SectionMenu {
  title: string;
  items: readonly SectionMenuItem[];
}

/** Telas de listas de atalhos (Resultados, Relatórios e Premiadas). */
export const RESULTS_MENU: SectionMenu = {
  title: 'Resultados',
  items: [{ label: 'Resultado loterias' }],
};

export const REPORTS_MENU: SectionMenu = {
  title: 'Relatórios',
  items: [
    { label: 'Consultar saldo' },
    { label: 'Consultar pule' },
    { label: 'Movimento loterias' },
    { label: 'Cotações' },
    { label: 'Cotadas' },
  ],
};

export const PRIZES_MENU: SectionMenu = {
  title: 'Premiadas',
  items: [{ label: 'Consultar premiadas' }, { label: 'Reclame' }],
};
