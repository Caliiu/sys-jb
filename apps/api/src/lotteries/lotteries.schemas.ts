import { LOTTERY_GAMES, LOTTERY_LIMITS, LOTTERY_SPLITS, MAX_PULE_NUMBER } from '@sysjb/contracts';
import { z } from 'zod';

/**
 * Compra de loterias: só o formato aqui. Catálogo (extrações, modalidades, colocações), palpites, horário
 * e cotação são conferidos no serviço, com as mesmas regras da tela (@sysjb/contracts).
 */
const idempotencyKey = z.uuid('Chave inválida.');
const drawDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
/** Jogo: Tradicional 1/7 (padrão: clientes antigos não mandam) ou 1/10. */
const game = z.enum(LOTTERY_GAMES, { error: 'Jogo inválido.' }).default('tradicional');
const draws = z
  .array(z.strictObject({ name: z.string().min(1).max(40), hour: z.number().int().min(0).max(23) }))
  .min(1, 'Escolha pelo menos uma loteria.')
  .max(LOTTERY_LIMITS.maxDraws, `No máximo ${LOTTERY_LIMITS.maxDraws} loterias por compra.`);

export const placeLotteryTicketsSchema = z.strictObject({
  idempotencyKey,
  game,
  drawDate,
  draws,
  items: z
    .array(
      z.strictObject({
        modality: z.string().min(1).max(40),
        placement: z.string().min(1).max(20),
        guesses: z
          .array(z.string().regex(/^\d{1,20}$/, 'Palpite inválido.'))
          .min(1, 'Informe pelo menos um palpite.')
          .max(LOTTERY_LIMITS.maxGuessesPerItem, `No máximo ${LOTTERY_LIMITS.maxGuessesPerItem} palpites por aposta.`),
        amountCents: z.number().int().min(1).max(LOTTERY_LIMITS.maxAmountCents, 'O valor máximo é R$ 10.000,00.'),
        split: z.enum(LOTTERY_SPLITS),
        quoteCents: z.number().int().min(1).max(200_000_000),
      }),
    )
    .min(1, 'Adicione pelo menos uma aposta.')
    .max(LOTTERY_LIMITS.maxItems, `No máximo ${LOTTERY_LIMITS.maxItems} apostas por compra.`),
});
export type PlaceLotteryTicketsInput = z.infer<typeof placeLotteryTicketsSchema>;

/** Repetir pule: as apostas vêm da pule (do próprio jogador); aqui só a pule, a data e as loterias. */
export const repeatLotteryTicketSchema = z.strictObject({
  idempotencyKey,
  puleNumber: z.number().int().min(1, 'Pule inválida.').max(MAX_PULE_NUMBER, 'Pule inválida.'),
  game,
  drawDate,
  draws,
});
export type RepeatLotteryTicketInput = z.infer<typeof repeatLotteryTicketSchema>;
