/**
 * Modalidades exibidas no dashboard. No app original vinham da API (ativas + banner);
 * aqui ainda não há cadastro de modalidades, então a lista é fixa e sem banner.
 * Quando existir o endpoint, basta trocar DEFAULT_MODALITIES pelo retorno dele.
 */
export interface GameModalityResponse {
  slug: string;
  bannerUrl?: string | null;
}

export const DEFAULT_MODALITIES: GameModalityResponse[] = [
  { slug: 'loterias' },
  { slug: 'fazendinha' },
  { slug: 'cassino' },
  { slug: 'raspadinha' },
  { slug: 'bingo' },
];
