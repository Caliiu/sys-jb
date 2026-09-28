import {
  AUDIT_ACTIONS,
  FAZENDINHA_MODE_IDS,
  FAZENDINHA_STAKES_CENTS,
  MAX_QUOTE_PRIZE_CENTS,
  TRADITIONAL_QUOTE_MODALITIES,
  type TraditionalQuoteModality,
  MAX_COMMISSION_BPS,
  MAX_WALLET_CREDIT_CENTS,
  MIN_COMMISSION_BPS,
  USER_STATUSES,
  WALLET_CREDIT_BUCKETS,
} from '@sysjb/contracts';
import { z } from 'zod';

/** Login do operador por e-mail + senha. Mensagens genéricas: a credencial é decidida no serviço. */
export const operatorLoginSchema = z.strictObject({
  email: z
    .string({ error: 'Informe o e-mail.' })
    .trim()
    .toLowerCase()
    .min(1, 'Informe o e-mail.')
    .max(254, 'E-mail inválido.'),
  password: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.').max(128, 'Senha inválida.'),
});

export const operatorTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Query da lista: página (padrão 1), tamanho (padrão 20, máx. 100), busca e status. Chaves desconhecidas são rejeitadas. */
export const listUsersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z
    .string()
    .trim()
    .max(100, 'Busca muito longa.')
    .optional()
    .transform((value) => value || undefined),
  status: z.enum(USER_STATUSES).optional(),
});

/** Lista de promotores (e de jogadores de um promotor): paginação e, na lista de promotores, busca. */
export const listPromotersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z
    .string()
    .trim()
    .max(100, 'Busca muito longa.')
    .optional()
    .transform((value) => value || undefined),
});

export const referralsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Comissão em centésimos de %: inteiro de 1 a 10000 (nunca ponto flutuante). */
export const setPromoterSchema = z.strictObject({
  commissionBps: z
    .number({ error: 'Informe a comissão.' })
    .int('A comissão deve ser um inteiro (centésimos de %).')
    .min(MIN_COMMISSION_BPS, 'A comissão mínima é 0,01%.')
    .max(MAX_COMMISSION_BPS, 'A comissão máxima é 100%.'),
});

export const setUserStatusSchema = z.strictObject({ status: z.enum(USER_STATUSES) });

/** Crédito de carteira pelo painel: bolsa, valor em centavos (até R$ 100.000,00), motivo e chave anti-repetição. */
export const walletCreditSchema = z.strictObject({
  idempotencyKey: z.uuid({ error: 'Chave inválida.' }),
  bucket: z.enum(WALLET_CREDIT_BUCKETS, { error: 'Escolha saldo, bônus ou games.' }),
  amountCents: z
    .number({ error: 'Informe o valor.' })
    .int('Valor em centavos.')
    .min(1, 'Informe um valor maior que zero.')
    .max(MAX_WALLET_CREDIT_CENTS, 'O valor máximo por crédito é R$ 100.000,00.'),
  note: z
    .string({ error: 'Informe o motivo.' })
    .trim()
    .min(3, 'Informe o motivo (3 a 200 caracteres).')
    .max(200, 'Motivo muito longo.'),
});

/** % do "Indique e ganhe": inteiro de 0 (desligado) a 10000 (100%), em centésimos de %. */
export const setCommissionSettingsSchema = z.strictObject({
  referralCommissionBps: z
    .number({ error: 'Informe o percentual.' })
    .int('O percentual deve ser um inteiro (centésimos de %).')
    .min(0, 'O percentual mínimo é 0%.')
    .max(MAX_COMMISSION_BPS, 'O percentual máximo é 100%.'),
});

const prizeCents = z
  .number({ error: 'Informe o prêmio.' })
  .int('O prêmio deve ser em centavos.')
  .min(0, 'O prêmio não pode ser negativo.')
  .max(MAX_QUOTE_PRIZE_CENTS, 'O prêmio máximo é R$ 1.000.000,00.');

/** Itens alterados do Tradicional: ao menos um; o serviço recusa modalidade repetida. */
export const setTraditionalQuotesSchema = z.strictObject({
  quotes: z
    .array(
      z.strictObject({
        modality: z.enum(
          TRADITIONAL_QUOTE_MODALITIES.map((m) => m.id) as [TraditionalQuoteModality, ...TraditionalQuoteModality[]],
        ),
        prizeCents,
      }),
    )
    .min(1, 'Nenhuma alteração.')
    .max(TRADITIONAL_QUOTE_MODALITIES.length),
});

/** Itens alterados da Fazendinha: ao menos um; o serviço recusa item repetido. */
export const setFazendinhaQuotesSchema = z.strictObject({
  quotes: z
    .array(
      z.strictObject({
        mode: z.enum(FAZENDINHA_MODE_IDS),
        stakeCents: z
          .number()
          .int()
          .refine((v) => FAZENDINHA_STAKES_CENTS.includes(v), 'Valor de aposta inválido.'),
        prizeCents,
      }),
    )
    .min(1, 'Nenhuma alteração.')
    .max(FAZENDINHA_MODE_IDS.length * FAZENDINHA_STAKES_CENTS.length),
});

/** Mês das comissões: YYYY-MM (2000-01 a 2099-12). */
export const commissionMonthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM).');

/** Auditoria: página, tamanho e filtros opcionais por ação e por usuário afetado. */
export const listAuditQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.enum(AUDIT_ACTIONS, { error: 'Ação inválida.' }).optional(),
  userId: z.uuid({ error: 'userId deve ser um UUID.' }).optional(),
});

export type OperatorLoginInput = z.output<typeof operatorLoginSchema>;
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
export type ListPromotersQuery = z.output<typeof listPromotersQuerySchema>;
export type ReferralsQuery = z.output<typeof referralsQuerySchema>;
export type SetPromoterInput = z.output<typeof setPromoterSchema>;
export type SetUserStatusInput = z.output<typeof setUserStatusSchema>;
export type ListAuditQuery = z.output<typeof listAuditQuerySchema>;
export type WalletCreditInput = z.output<typeof walletCreditSchema>;
export type SetCommissionSettingsInput = z.output<typeof setCommissionSettingsSchema>;
export type SetTraditionalQuotesInput = z.output<typeof setTraditionalQuotesSchema>;
export type SetFazendinhaQuotesInput = z.output<typeof setFazendinhaQuotesSchema>;
