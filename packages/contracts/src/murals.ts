/**
 * Mural: aviso com imagem que aparece para o jogador ao abrir o app (folha inferior do Dashboard), dentro da
 * vigência. Cadastrado por banca no painel. Datas em YYYY-MM-DD, dias de Brasília, inclusivos.
 */

/** ONCE: cada jogador vê uma vez só (registrado no servidor). ALWAYS: a cada vez que o jogador abre o app. */
export const MURAL_DISPLAY_MODES = ['ONCE', 'ALWAYS'] as const;
export type MuralDisplayMode = (typeof MURAL_DISPLAY_MODES)[number];

export const MURAL_DISPLAY_LABELS: Record<MuralDisplayMode, string> = {
  ONCE: 'Apenas uma vez',
  ALWAYS: 'Sempre',
};

/** Formatos aceitos (o servidor confere pelo conteúdo do arquivo, não pelo nome nem pelo tipo informado). */
export const MURAL_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type MuralImageType = (typeof MURAL_IMAGE_TYPES)[number];

export const MURAL_LIMITS = {
  nameMax: 60,
  /** 3 MB. O banco confere o mesmo limite. */
  imageMaxBytes: 3 * 1024 * 1024,
} as const;

/** Formato da imagem pelos primeiros bytes (PNG, JPEG ou WebP); null = formato não aceito. */
export function detectMuralImageType(bytes: Uint8Array): MuralImageType | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

/** SCHEDULED: ainda não começou; ACTIVE: aparece hoje; ENDED: vigência encerrada. */
export type MuralStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED';

export const MURAL_STATUS_LABELS: Record<MuralStatus, string> = {
  SCHEDULED: 'Agendado',
  ACTIVE: 'No ar',
  ENDED: 'Encerrado',
};

/** Situação do mural no dia `today` (YYYY-MM-DD, Brasília). */
export function muralStatus(mural: { startsOn: string; endsOn: string }, today: string): MuralStatus {
  if (today < mural.startsOn) return 'SCHEDULED';
  if (today > mural.endsOn) return 'ENDED';
  return 'ACTIVE';
}

/** Mural no painel. A imagem vem por rota própria (`version` muda a cada alteração, para o cache). */
export interface AdminMural {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  displayMode: MuralDisplayMode;
  imageType: MuralImageType;
  imageBytes: number;
  /** Jogadores que já viram (conta só para "Apenas uma vez"). */
  viewsCount: number;
  version: string;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601. */
  updatedAt: string;
}

/**
 * POST /v1/admin/murals (imagem obrigatória) e PUT /v1/admin/murals/:id (sem `image` = mantém a atual).
 * A imagem vai em base64.
 */
export interface SaveMuralRequest {
  name: string;
  startsOn: string;
  endsOn: string;
  displayMode: MuralDisplayMode;
  image?: string;
}

/** Mural para o jogador: os que estão na vigência e que ele ainda deve ver, na ordem de exibição. */
export interface PublicMural {
  id: string;
  name: string;
  displayMode: MuralDisplayMode;
  version: string;
}
