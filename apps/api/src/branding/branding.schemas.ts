import { BRANDING_LIMITS, HEX_COLOR, digitsOnly, isValidBrPhone } from '@sysjb/contracts';
import { z } from 'zod';

/** Tamanho máximo do base64 de uma logo de BRANDING_LIMITS.logoMaxBytes. */
const LOGO_BASE64_MAX = Math.ceil(BRANDING_LIMITS.logoMaxBytes / 3) * 4;

const color = (label: string) =>
  z
    .string()
    .regex(HEX_COLOR, `${label}: use o formato #RRGGBB.`)
    .transform((value) => value.toUpperCase());

/** Identidade visual. O conteúdo da logo (formato e tamanho) é conferido no serviço (e no banco). */
export const saveBrandingSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(BRANDING_LIMITS.nameMin, `No mínimo ${BRANDING_LIMITS.nameMin} caracteres.`)
    .max(BRANDING_LIMITS.nameMax, `No máximo ${BRANDING_LIMITS.nameMax} caracteres.`),
  primaryColor: color('Cor principal'),
  secondaryColor: color('Cor secundária'),
  inviteBarText: z
    .string()
    .trim()
    .min(1, 'Informe o texto da barra.')
    .max(BRANDING_LIMITS.inviteBarMax, `No máximo ${BRANDING_LIMITS.inviteBarMax} caracteres.`),
  inviteBarEnabled: z.boolean(),
  // Mesmo formato do telefone do jogador; aceita máscara. null ou vazio = sem número.
  supportPhone: z
    .string()
    .max(32, 'Telefone inválido.')
    .regex(/^[\d\s().-]*$/, 'Use só números.')
    .nullable()
    .transform((value) => (value === null ? null : digitsOnly(value) || null))
    .refine((value) => value === null || isValidBrPhone(value), 'Informe DDD + número (10 ou 11 dígitos).'),
  logo: z
    .string()
    .max(LOGO_BASE64_MAX, 'Logo acima de 1 MB.')
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 'Logo inválida.')
    .nullable()
    .optional(),
});
export type SaveBrandingInput = z.infer<typeof saveBrandingSchema>;
