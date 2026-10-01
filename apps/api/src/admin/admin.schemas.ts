import {
  ADMIN_PRIZE_FILTER_MAX_CENTS,
  ADMIN_PRIZES_MAX_DAYS,
  AUDIT_ACTIONS,
  AUDIT_PERIODS,
  dayOffsetOf,
  DRAW_MAX_DAY_OFFSET,
  GENERAL_REPORT_SORTS,
  GENERAL_REPORT_TYPES,
  OPERATION_SUMMARY_MAX_DAYS,
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

/** Query da lista: página (padrão 1), tamanho (padrão 20, máx. 100), busca, status e promotor. Chaves desconhecidas são rejeitadas. */
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
  promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
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

/** Auditoria: página, tamanho e filtros opcionais por ação, usuário afetado e período. */
export const listAuditQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.enum(AUDIT_ACTIONS, { error: 'Ação inválida.' }).optional(),
  userId: z.uuid({ error: 'userId deve ser um UUID.' }).optional(),
  period: z.enum(AUDIT_PERIODS, { error: 'Período inválido.' }).optional(),
});

/**
 * Bilhetes: dia da venda (data real, de 2000 até hoje em Brasília), página, tamanho (padrão 25) e filtros opcionais
 * por promotor, apostador e sorteio. Chaves desconhecidas são rejeitadas.
 */
export const listTicketsQuerySchema = z.strictObject({
  date: z.string({ error: 'Informe a data.' }).refine((date) => {
    const offset = dayOffsetOf(new Date().toISOString(), date);
    return offset !== null && offset <= 0 && date >= '2000-01-01';
  }, 'Data inválida ou futura.'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
  userId: z.uuid({ error: 'userId deve ser um UUID.' }).optional(),
  drawId: z.uuid({ error: 'drawId deve ser um UUID.' }).optional(),
});

const prizeFilterCents = z.coerce
  .number({ error: 'Valor de prêmio inválido.' })
  .int('Valor de prêmio inválido.')
  .min(0, 'Valor de prêmio inválido.')
  .max(ADMIN_PRIZE_FILTER_MAX_CENTS, 'Valor de prêmio alto demais.');

/** Pules premiadas: período pela data do jogo (até hoje, no máximo ADMIN_PRIZES_MAX_DAYS dias) e faixa de prêmio. */
export const listPrizesQuerySchema = z
  .strictObject({
    from: z.string({ error: 'Informe o início do período.' }),
    to: z.string({ error: 'Informe o fim do período.' }),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
    userId: z.uuid({ error: 'userId deve ser um UUID.' }).optional(),
    drawId: z.uuid({ error: 'drawId deve ser um UUID.' }).optional(),
    minPrizeCents: prizeFilterCents.optional(),
    maxPrizeCents: prizeFilterCents.optional(),
  })
  .superRefine((query, ctx) => {
    const now = new Date().toISOString();
    const from = dayOffsetOf(now, query.from);
    const to = dayOffsetOf(now, query.to);
    if (from === null || query.from < '2000-01-01')
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Data inválida.' });
    if (to === null || to > 0) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Data inválida ou futura.' });
    if (from !== null && to !== null) {
      if (from > to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'O início vem depois do fim.' });
      else if (to - from + 1 > ADMIN_PRIZES_MAX_DAYS) {
        ctx.addIssue({
          code: 'custom',
          path: ['from'],
          message: `Escolha um período de até ${ADMIN_PRIZES_MAX_DAYS} dias.`,
        });
      }
    }
    if (
      query.minPrizeCents !== undefined &&
      query.maxPrizeCents !== undefined &&
      query.minPrizeCents > query.maxPrizeCents
    ) {
      ctx.addIssue({ code: 'custom', path: ['minPrizeCents'], message: 'O prêmio mínimo passa do máximo.' });
    }
  });
export type ListPrizesQuery = z.output<typeof listPrizesQuerySchema>;

/**
 * Período de dias de Brasília: datas reais, início antes do fim, até `maxDays` dias (contando os dois) e fim até hoje
 * (ou até `futureDays` dias à frente, para o que é pela data do jogo).
 */
function checkPeriod(query: { from: string; to: string }, ctx: z.RefinementCtx, maxDays: number, futureDays = 0): void {
  const now = new Date().toISOString();
  const from = dayOffsetOf(now, query.from);
  const to = dayOffsetOf(now, query.to);
  if (from === null || query.from < '2000-01-01') {
    ctx.addIssue({ code: 'custom', path: ['from'], message: 'Data inválida.' });
  }
  if (to === null || to > futureDays) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: 'Data inválida ou futura.' });
  }
  if (from !== null && to !== null) {
    if (from > to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'O início vem depois do fim.' });
    else if (to - from + 1 > maxDays) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: `Escolha um período de até ${maxDays} dias.` });
    }
  }
}

/** Resumo da operação: período (até hoje, no máximo OPERATION_SUMMARY_MAX_DAYS dias) e promotor. */
export const operationSummaryQuerySchema = z
  .strictObject({
    from: z.string({ error: 'Informe o início do período.' }),
    to: z.string({ error: 'Informe o fim do período.' }),
    promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
  })
  .superRefine((query, ctx) => checkPeriod(query, ctx, OPERATION_SUMMARY_MAX_DAYS));
export type OperationSummaryQuery = z.output<typeof operationSummaryQuerySchema>;

/** Relatório geral: o mesmo período do resumo da operação, mais paginação, filtros e ordenação. */
export const generalReportQuerySchema = z
  .strictObject({
    from: z.string({ error: 'Informe o início do período.' }),
    to: z.string({ error: 'Informe o fim do período.' }),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
    userId: z.uuid({ error: 'userId deve ser um UUID.' }).optional(),
    type: z.enum(GENERAL_REPORT_TYPES, { error: 'Tipo inválido.' }).optional(),
    sort: z.enum(GENERAL_REPORT_SORTS, { error: 'Ordenação inválida.' }).default('sales'),
    dir: z.enum(['asc', 'desc'], { error: 'Direção inválida.' }).default('desc'),
  })
  .superRefine((query, ctx) => checkPeriod(query, ctx, OPERATION_SUMMARY_MAX_DAYS));

export type GeneralReportQuery = z.output<typeof generalReportQuerySchema>;

/** Vendas por extração: período pela data do jogo (até o fim da janela de apostas), promotor e apostador. */
export const salesByDrawQuerySchema = z
  .strictObject({
    from: z.string({ error: 'Informe o início do período.' }),
    to: z.string({ error: 'Informe o fim do período.' }),
    promoterId: z.uuid({ error: 'promoterId deve ser um UUID.' }).optional(),
    userId: z.uuid({ error: 'userId deve ser um UUID.' }).optional(),
  })
  .superRefine((query, ctx) => checkPeriod(query, ctx, OPERATION_SUMMARY_MAX_DAYS, DRAW_MAX_DAY_OFFSET));
export type SalesByDrawQuery = z.output<typeof salesByDrawQuerySchema>;

/** Extrato do apostador: período (até hoje) e paginação. */
export const playerStatementQuerySchema = z
  .strictObject({
    from: z.string({ error: 'Informe o início do período.' }),
    to: z.string({ error: 'Informe o fim do período.' }),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .superRefine((query, ctx) => checkPeriod(query, ctx, OPERATION_SUMMARY_MAX_DAYS));
export type PlayerStatementQuery = z.output<typeof playerStatementQuerySchema>;

/** Número do bilhete (pule): inteiro positivo dentro do int do banco. */
export const ticketNumberSchema = z.coerce
  .number({ error: 'Número do bilhete inválido.' })
  .int('Número do bilhete inválido.')
  .min(1, 'Número do bilhete inválido.')
  .max(2_147_483_647, 'Número do bilhete inválido.');

export type OperatorLoginInput = z.output<typeof operatorLoginSchema>;
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
export type ListPromotersQuery = z.output<typeof listPromotersQuerySchema>;
export type ReferralsQuery = z.output<typeof referralsQuerySchema>;
export type SetPromoterInput = z.output<typeof setPromoterSchema>;
export type SetUserStatusInput = z.output<typeof setUserStatusSchema>;
export type ListAuditQuery = z.output<typeof listAuditQuerySchema>;
export type ListTicketsQuery = z.output<typeof listTicketsQuerySchema>;
export type WalletCreditInput = z.output<typeof walletCreditSchema>;
export type SetCommissionSettingsInput = z.output<typeof setCommissionSettingsSchema>;
export type SetTraditionalQuotesInput = z.output<typeof setTraditionalQuotesSchema>;
export type SetFazendinhaQuotesInput = z.output<typeof setFazendinhaQuotesSchema>;
