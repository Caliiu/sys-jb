/**
 * Cassino (jogos do provedor PlayFivers). O saldo do cassino é o Disponível Games da carteira (totalAvailableGames): a
 * aposta sai do saldo de games e depois dos prêmios de games; o prêmio entra nos prêmios de games. Valores em centavos.
 */

/** Jogo na vitrine (id curto do nosso catálogo: vai no endereço da tela do jogo). */
export interface CasinoGameCard {
  id: number;
  name: string;
  provider: string;
  /** Imagem do provedor (https); null = sem imagem. */
  imageUrl: string | null;
}

/** Seção do lobby: um provedor, os primeiros jogos e quantos ele tem ao todo ("Ver todos"). */
export interface CasinoProviderSection {
  provider: string;
  total: number;
  games: CasinoGameCard[];
}

/** Maior prêmio recente da banca ("Top ganhos"), com o nome do jogador mascarado. */
export interface CasinoTopWin {
  /** "Gustavo***27": primeiro nome e os 2 últimos dígitos do ID. */
  playerLabel: string;
  game: CasinoGameCard;
  winCents: number;
}

/** GET /v1/casino/lobby. `available: false` = cassino desligado (sem credencial do provedor): a tela avisa. */
export interface CasinoLobby {
  available: boolean;
  sections: CasinoProviderSection[];
  topWins: CasinoTopWin[];
}

/** GET /v1/casino/games?provider=&search=&page=: lista paginada ("Ver todos" e busca). */
export interface CasinoGamesPage {
  items: CasinoGameCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** POST /v1/casino/games/:id/launch: endereço do jogo no provedor (abre dentro da tela do jogo). */
export interface CasinoLaunchResponse {
  game: CasinoGameCard;
  launchUrl: string;
}

export const CASINO_LIMITS = {
  /** Jogos por seção do lobby. */
  sectionSize: 12,
  /** Jogos por página em "Ver todos" e na busca. */
  pageSize: 30,
  /** Busca: de 2 a 60 caracteres. */
  searchMin: 2,
  searchMax: 60,
  /** "Top ganhos": quantos e de quantas horas para trás. */
  topWins: 10,
  topWinsHours: 24,
} as const;

/** Tela do jogo (id do catálogo). */
export const casinoGamePath = (id: number) => `/cassino/jogo/${id}`;

/** "Gustavo***27": só o primeiro nome (até 12 letras) e os 2 últimos dígitos do ID exibido. */
export function maskPlayerName(name: string, displayId: number): string {
  const first = (name.trim().split(/\s+/)[0] ?? '').slice(0, 12) || 'Jogador';
  return `${first}***${String(displayId).slice(-2).padStart(2, '0')}`;
}
