/**
 * Ordem e visibilidade dos blocos (e dos cards dentro deles) do início do app do jogador, definidas pelo Gerente
 * em Personalização > Cards do início. Os cards nunca mudam de bloco.
 */

export const HOME_BLOCK_IDS = ['draw', 'primary', 'utility', 'casino', 'games', 'support'] as const;
export type HomeBlockId = (typeof HOME_BLOCK_IDS)[number];

interface HomeBlockDefinition {
  id: HomeBlockId;
  label: string;
  /** Cards do bloco, na ordem padrão (vazio = o bloco é um card só). */
  cards: ReadonlyArray<{ id: string; label: string }>;
}

/** Catálogo, na ordem padrão (a do app original). */
export const HOME_BLOCKS: readonly HomeBlockDefinition[] = [
  { id: 'draw', label: 'Próximo sorteio', cards: [] },
  {
    id: 'primary',
    label: 'Loterias e Fazendinha',
    cards: [
      { id: 'loterias', label: 'Loterias' },
      { id: 'fazendinha', label: 'Fazendinha' },
    ],
  },
  {
    id: 'utility',
    label: 'Atalhos',
    cards: [
      { id: 'horoscopo', label: 'Horóscopo' },
      { id: 'calcular', label: 'Calcular' },
      { id: 'sonhos', label: 'Sonhos' },
      { id: 'atrasados', label: 'Atrasados' },
    ],
  },
  { id: 'casino', label: 'Cassino', cards: [] },
  {
    id: 'games',
    label: 'Raspadinha e Bingo',
    cards: [
      { id: 'raspadinha', label: 'Raspadinha' },
      { id: 'bingo', label: 'Bingo' },
    ],
  },
  { id: 'support', label: 'Atendimento', cards: [] },
];

export interface HomeLayoutCard {
  id: string;
  visible: boolean;
}

export interface HomeLayoutBlock {
  id: HomeBlockId;
  visible: boolean;
  cards: HomeLayoutCard[];
}

/** GET/PUT /v1/admin/branding/home e GET /v1/tenant/home-layout. Sempre completo: todos os blocos e cards. */
export interface HomeLayout {
  blocks: HomeLayoutBlock[];
}

export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  blocks: HOME_BLOCKS.map((block) => ({
    id: block.id,
    visible: true,
    cards: block.cards.map((card) => ({ id: card.id, visible: true })),
  })),
};

/**
 * Layout completo a partir do que está guardado: mantém a ordem e a visibilidade gravadas, descarta o que não
 * existe mais e acrescenta no fim (visível) o que surgiu depois. Sem nada guardado, vale o padrão.
 */
export function normalizeHomeLayout(raw: unknown): HomeLayout {
  const stored = isLayoutLike(raw) ? raw.blocks : [];
  const byId = new Map(stored.map((block) => [block.id, block]));
  const ordered = [
    ...stored.map((block) => block.id).filter((id, i, all) => all.indexOf(id) === i),
    ...HOME_BLOCK_IDS,
  ].filter(
    (id, i, all): id is HomeBlockId => (HOME_BLOCK_IDS as readonly string[]).includes(id) && all.indexOf(id) === i,
  );

  return {
    blocks: ordered.map((id) => {
      const definition = HOME_BLOCKS.find((block) => block.id === id)!;
      const saved = byId.get(id);
      const known = definition.cards.map((card) => card.id);
      const savedCards = (saved?.cards ?? []).filter(
        (card, i, all) => known.includes(card.id) && all.findIndex((c) => c.id === card.id) === i,
      );
      const cards = [
        ...savedCards.map((card) => ({ id: card.id, visible: card.visible !== false })),
        ...known
          .filter((cardId) => !savedCards.some((card) => card.id === cardId))
          .map((cardId) => ({ id: cardId, visible: true })),
      ];
      return { id, visible: saved ? saved.visible !== false : true, cards };
    }),
  };
}

function isLayoutLike(
  raw: unknown,
): raw is { blocks: Array<{ id: string; visible?: unknown; cards?: Array<{ id: string; visible?: unknown }> }> } {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { blocks?: unknown }).blocks)) return false;
  return (raw as { blocks: unknown[] }).blocks.every(
    (block) =>
      !!block &&
      typeof block === 'object' &&
      typeof (block as { id?: unknown }).id === 'string' &&
      (!('cards' in block) ||
        (Array.isArray((block as { cards?: unknown }).cards) &&
          (block as { cards: unknown[] }).cards.every(
            (card) => !!card && typeof card === 'object' && typeof (card as { id?: unknown }).id === 'string',
          ))),
  );
}

/** Rótulos para a tela e a auditoria. */
export const homeBlockLabel = (id: HomeBlockId) => HOME_BLOCKS.find((block) => block.id === id)!.label;
export const homeCardLabel = (blockId: HomeBlockId, cardId: string) =>
  HOME_BLOCKS.find((block) => block.id === blockId)!.cards.find((card) => card.id === cardId)?.label ?? cardId;
