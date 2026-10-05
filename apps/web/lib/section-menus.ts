import { ROUTES } from './routes';

export interface SectionMenuItem {
  label: string;
  /** Rota da página. Sem rota (e sem `onSelect`), o item avisa que a funcionalidade vem em breve. */
  href?: string;
  /** Etapa da própria tela (sem trocar de página): só em listas montadas por componentes de cliente. */
  onSelect?: () => void;
}

export interface SectionMenu {
  title: string;
  items: readonly SectionMenuItem[];
}

/** Telas de listas de atalhos (Resultados, Relatórios e Premiadas). */
export const RESULTS_MENU: SectionMenu = {
  title: 'Resultados',
  items: [{ label: 'Resultado loterias', href: ROUTES.lotteryResults }],
};

export const REPORTS_MENU: SectionMenu = {
  title: 'Relatórios',
  items: [
    { label: 'Consultar saldo', href: ROUTES.balanceReport },
    { label: 'Consultar pule', href: ROUTES.puleLookup },
    { label: 'Movimento loterias', href: ROUTES.lotteryMovement },
    { label: 'Cotações', href: ROUTES.quotes },
    { label: 'Cotadas' },
  ],
};

export const PRIZES_MENU: SectionMenu = {
  title: 'Premiadas',
  items: [
    { label: 'Consultar premiadas', href: ROUTES.prizesCheck },
    { label: 'Reclame', href: ROUTES.prizeClaim },
  ],
};

export const PULE_LOOKUP_MENU: SectionMenu = {
  title: 'Consultar pule',
  items: [
    { label: 'Consultar por código', href: ROUTES.puleByCode },
    { label: 'Consultar por data', href: ROUTES.puleByDate },
  ],
};
