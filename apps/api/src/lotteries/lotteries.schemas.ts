import { LOTTERY_LIMITS, LOTTERY_SPLITS } from '@sysjb/contracts';
import { z } from 'zod';

/**
 * Compra de loterias: só o formato aqui. Catálogo (extrações, modalidades, colocações), palpites, horário
 * e cotação são conferidos no serviço, com as mesmas regras da tela (@sysjb/contracts).
 */
export const placeLotteryTicketsSchema = z.strictObject({
  idempotencyKey: z.uuid('Chave inválida.'),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  draws: z
    .array(z.strictObject({ name: z.string().min(1).max(40), hour: z.number().int().min(0).max(23) }))
    .min(1, 'Escolha pelo menos uma loteria.')
    .max(LOTTERY_LIMITS.maxDraws, `No máximo ${LOTTERY_LIMITS.maxDraws} loterias por compra.`),
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
