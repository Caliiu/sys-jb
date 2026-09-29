import { MURAL_DISPLAY_MODES, MURAL_LIMITS } from '@sysjb/contracts';
import { z } from 'zod';

const date = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: data inválida.`);

/** Tamanho máximo do base64 de uma imagem de MURAL_LIMITS.imageMaxBytes. */
const IMAGE_BASE64_MAX = Math.ceil(MURAL_LIMITS.imageMaxBytes / 3) * 4;

/**
 * Cadastro/alteração do mural. Datas reais, fim >= início e o conteúdo da imagem (formato e tamanho) são
 * conferidos no serviço (e no banco).
 */
export const saveMuralSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome.')
    .max(MURAL_LIMITS.nameMax, `No máximo ${MURAL_LIMITS.nameMax} caracteres.`),
  startsOn: date('Data inicial'),
  endsOn: date('Data final'),
  displayMode: z.enum(MURAL_DISPLAY_MODES),
  image: z
    .string()
    .max(IMAGE_BASE64_MAX, 'Imagem acima de 3 MB.')
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'Imagem inválida.')
    .optional(),
});
export type SaveMuralInput = z.infer<typeof saveMuralSchema>;

export const muralIdSchema = z.uuid('Id inválido.');
