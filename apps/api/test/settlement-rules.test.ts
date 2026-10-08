import {
  LOTTERY_MODALITIES,
  type LotterySettlementItem,
  SettlementRuleError,
  defaultQuotes,
  findLotteryModality,
  lotteryCentenaQuoteCents,
  lotteryItemPositions,
  lotteryPossiblePrizeCents,
  lotteryQuoteCents,
  placementsFor,
  resultFullPrizes,
  settleFazendinhaBet,
  settleLotteryItem,
  settleLotteryTicket,
} from '@sysjb/contracts';
import { describe, expect, it } from 'vitest';

const QUOTES = defaultQuotes();
const quoteOf = (modality: string) => lotteryQuoteCents(findLotteryModality(modality)!, QUOTES);

/** Item com a cotação padrão (R$ 1,00 no 1º prêmio, "Todos"), sobrescrevendo o que o caso pedir. */
function item(over: Partial<LotterySettlementItem> & Pick<LotterySettlementItem, 'modality'>): LotterySettlementItem {
  const modality = findLotteryModality(over.modality)!;
  return {
    position: 1,
    placement: modality.fixedPlacement ?? 'p1',
    guesses: ['0000'],
    amountCents: 100,
    split: 'total',
    quoteCents: quoteOf(over.modality),
    centenaQuoteCents: lotteryCentenaQuoteCents(modality, QUOTES),
    ...over,
  };
}

/** 7 prêmios (o 7º só com a centena, como o da multiplicação). */
const SEVEN = ['1234', '5678', '9012', '3456', '7890', '2345', '678'];
const prizeOf = (i: LotterySettlementItem, prizes: readonly string[] = SEVEN) =>
  settleLotteryItem(i, prizes)?.prizeCents ?? 0;

describe('modalidades de um número', () => {
  it('milhar, centena, dezena e unidade pelos dígitos da direita; cotação × valor', () => {
    expect(prizeOf(item({ modality: 'milhar', guesses: ['1234'] }))).toBe(800_000);
    expect(prizeOf(item({ modality: 'centena', guesses: ['234'] }))).toBe(80_000);
    expect(prizeOf(item({ modality: 'dezena', guesses: ['34'] }))).toBe(8_000);
    expect(prizeOf(item({ modality: 'unidade', guesses: ['4'] }))).toBe(800);
    expect(prizeOf(item({ modality: 'milhar', guesses: ['1235'] }))).toBe(0);
    expect(settleLotteryItem(item({ modality: 'milhar', guesses: ['1235'] }), SEVEN)).toBeNull();
  });

  it('zero à esquerda faz parte da milhar: 0873 sorteado paga o palpite 0873, não o 873 da centena por engano', () => {
    const prizes = ['0873', '3718', '8192', '0186', '1020', '3989', '245'];
    expect(prizeOf(item({ modality: 'milhar', guesses: ['0873'] }), prizes)).toBe(800_000);
    expect(prizeOf(item({ modality: 'milhar', guesses: ['8730'] }), prizes)).toBe(0);
    expect(prizeOf(item({ modality: 'centena', guesses: ['873'] }), prizes)).toBe(80_000);
    expect(prizeOf(item({ modality: 'centena_esquerda', guesses: ['087'] }), prizes)).toBe(80_000);
    expect(prizeOf(item({ modality: 'dezena_esq', guesses: ['08'] }), prizes)).toBe(8_000);
    expect(prizeOf(item({ modality: 'milhar', placement: 'p4', guesses: ['0186'] }), prizes)).toBe(800_000);
  });

  it('esquerda e meio pelos dígitos da milhar', () => {
    expect(prizeOf(item({ modality: 'centena_esquerda', guesses: ['123'] }))).toBe(80_000);
    expect(prizeOf(item({ modality: 'centena_esquerda', guesses: ['234'] }))).toBe(0);
    expect(prizeOf(item({ modality: 'dezena_esq', guesses: ['12'] }))).toBe(8_000);
    expect(prizeOf(item({ modality: 'dezena_meio', guesses: ['23'] }))).toBe(8_000);
    expect(prizeOf(item({ modality: 'dezena_meio', guesses: ['34'] }))).toBe(0);
  });

  it('grupo pela dezena da direita (00 = 25)', () => {
    // 1234 -> dezena 34 -> grupo 9.
    expect(prizeOf(item({ modality: 'grupo', guesses: ['09'] }))).toBe(2_000);
    expect(prizeOf(item({ modality: 'grupo', guesses: ['25'] }), ['5600', '1', '1', '1', '1'])).toBe(2_000);
    expect(prizeOf(item({ modality: 'grupo', guesses: ['01'] }), ['5601', '1', '1', '1', '1'])).toBe(2_000);
  });

  it('Federal (5 dígitos): a milhar são os 4 últimos', () => {
    const federal = ['01234', '56789', '90123', '34567', '78901'];
    expect(prizeOf(item({ modality: 'milhar', guesses: ['1234'] }), federal)).toBe(800_000);
    expect(prizeOf(item({ modality: 'centena_esquerda', guesses: ['123'] }), federal)).toBe(80_000);
    expect(prizeOf(item({ modality: 'dezena_esq', guesses: ['01'] }), federal)).toBe(0);
  });

  it('invertidas: qualquer ordem, valor dividido pelas permutações distintas', () => {
    // 6 permutações: 80.000 ÷ 6 = 13.333,33 -> 13.333.
    expect(prizeOf(item({ modality: 'centena_invertida', guesses: ['432'] }))).toBe(13_333);
    expect(prizeOf(item({ modality: 'milhar_invertida', guesses: ['4321'] }))).toBe(33_333);
    // Centena invertida da esquerda: 123 em qualquer ordem.
    expect(prizeOf(item({ modality: 'centena_inv_esq', guesses: ['321'] }))).toBe(13_333);
    expect(prizeOf(item({ modality: 'centena_invertida', guesses: ['431'] }))).toBe(0);
    // Dígito repetido: 3 permutações.
    expect(prizeOf(item({ modality: 'centena_invertida', guesses: ['121'] }), ['5112', '1', '1', '1', '1'])).toBe(
      26_666,
    );
  });

  it('MILHAR E CENTENA: metade em cada; acertou a milhar ganha as duas, só a centena ganha a metade dela', () => {
    expect(prizeOf(item({ modality: 'milhar_centena', guesses: ['1234'] }))).toBe(440_000);
    expect(prizeOf(item({ modality: 'milhar_centena', guesses: ['9234'] }))).toBe(40_000);
    expect(prizeOf(item({ modality: 'milhar_centena', guesses: ['9235'] }))).toBe(0);
    expect(() => settleLotteryItem(item({ modality: 'milhar_centena', centenaQuoteCents: null }), SEVEN)).toThrow(
      SettlementRuleError,
    );
  });
});

describe('colocações', () => {
  it('faixa: prêmio dividido pelas posições; cada posição que o palpite acerta paga', () => {
    const prizes = ['1209', '5678', '3309', '4444', '7809'];
    // Grupo 03 (dezena 09) no 1º, 3º e 5º: 3 acertos de 2.000 ÷ 5.
    expect(prizeOf(item({ modality: 'grupo', placement: 'p1_5', guesses: ['03'] }), prizes)).toBe(1_200);
    expect(prizeOf(item({ modality: 'grupo', placement: 'p2_4', guesses: ['03'] }), prizes)).toBe(666);
    expect(prizeOf(item({ modality: 'grupo', placement: 'p2', guesses: ['03'] }), prizes)).toBe(0);
  });

  it('"1 e 1/5": 3/5 no 1º prêmio (as duas metades) e 1/10 do 2º ao 5º', () => {
    const prizes = ['1209', '5678', '3309', '4444', '7809'];
    // 2.000 × (3/5 + 1/10 + 1/10).
    expect(prizeOf(item({ modality: 'grupo', placement: 'p1_e_1_5', guesses: ['03'] }), prizes)).toBe(
      1_200 + 200 + 200,
    );
    expect(prizeOf(item({ modality: 'grupo', placement: 'p1_e_1_5', guesses: ['20'] }), prizes)).toBe(200);
  });

  it('"Todos" divide o valor entre os palpites; "Cada" vale por palpite', () => {
    // 34 no 1º prêmio e 78 no 2º, na colocação 1/2 (cada acerto vale metade).
    const total = item({ modality: 'dezena', placement: 'p1_2', guesses: ['34', '78', '99'], amountCents: 1_000 });
    const won = settleLotteryItem(total, SEVEN)!;
    expect(won.guesses).toEqual(['34', '78']);
    // 1.000 ÷ 3 × 80 ÷ 2 = 13.333,33 por acerto.
    expect(won.prizeCents).toBe(13_333 * 2);
    expect(prizeOf({ ...total, split: 'each' })).toBe(40_000 * 2);
  });

  it('7º prêmio só com a centena: milhar não acerta, centena acerta', () => {
    expect(prizeOf(item({ modality: 'milhar', placement: 'p7', guesses: ['0678'] }))).toBe(0);
    expect(prizeOf(item({ modality: 'centena', placement: 'p7', guesses: ['678'] }))).toBe(80_000);
  });

  it('pule que precisa de uma posição que o resultado ainda não tem fica pendente', () => {
    const sixth = [item({ modality: 'milhar', placement: 'p6', guesses: ['2345'] })];
    expect(settleLotteryTicket(sixth, SEVEN.slice(0, 5))).toEqual({ status: 'incomplete' });
    expect(settleLotteryTicket(sixth, SEVEN)).toMatchObject({ status: 'settled', prizeCents: 800_000 });
    // O 6º vem da soma enviada pelo provedor.
    const full = resultFullPrizes({
      lottery: 'rj',
      extraction: 9,
      prizes: SEVEN.slice(0, 5),
      sum: '12345',
      multiplication: '987654321',
    });
    expect(full).toEqual([...SEVEN.slice(0, 5), '2345', '321']);
  });
});

describe('combos (uma vez por palpite, pela cotação da modalidade)', () => {
  const groupsOf = (...groups: number[]) => groups.map((g) => String(g * 4).padStart(4, '0'));

  it('duque e terno de grupo: todos os grupos do palpite do 1º ao 5º', () => {
    const prizes = groupsOf(5, 12, 7, 12, 20);
    expect(prizeOf(item({ modality: 'duque_gp', guesses: ['0512'] }), prizes)).toBe(18_000);
    expect(prizeOf(item({ modality: 'duque_gp', guesses: ['0513'] }), prizes)).toBe(0);
    expect(prizeOf(item({ modality: 'terno_gp', guesses: ['050720'] }), prizes)).toBe(180_000);
    expect(prizeOf(item({ modality: 'quadra_gp', guesses: ['05071220'] }), prizes)).toBe(100_000);
    // Fora do 1/5 não vale (o 6º prêmio não entra).
    expect(prizeOf(item({ modality: 'duque_gp', guesses: ['0525'] }), [...prizes, groupsOf(25)[0]!])).toBe(0);
  });

  it('quina 8/5: 5 grupos diferentes do palpite; grupo repetido no resultado conta uma vez', () => {
    const guess = ['0102030405060708'];
    expect(prizeOf(item({ modality: 'quina_gp_8_5', guesses: guess }), groupsOf(1, 3, 5, 7, 8))).toBe(60_000);
    expect(prizeOf(item({ modality: 'quina_gp_8_5', guesses: guess }), groupsOf(1, 3, 5, 7, 7))).toBe(0);
    expect(prizeOf(item({ modality: 'quina_gp_8_5', guesses: guess }), groupsOf(1, 3, 5, 7, 9))).toBe(0);
  });

  it('sena 10/6: 6 dos 10 grupos do 1º ao 6º (precisa do 6º prêmio)', () => {
    const sena = item({ modality: 'sena_gp_10_6', guesses: ['01020304050607080910'] });
    expect(lotteryItemPositions(sena)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(prizeOf(sena, groupsOf(1, 2, 3, 4, 5, 6))).toBe(60_000);
    expect(prizeOf(sena, groupsOf(1, 2, 3, 4, 5, 11))).toBe(0);
    expect(settleLotteryTicket([sena], groupsOf(1, 2, 3, 4, 5))).toEqual({ status: 'incomplete' });
    // Pule antiga gravada com 1/5 segue a regra atual.
    expect(prizeOf({ ...sena, placement: 'p1_5' }, groupsOf(1, 2, 3, 4, 5, 6))).toBe(60_000);
  });

  it('dezenas: duque e terno do 1º ao 5º; terno seco do 1º ao 3º, em qualquer ordem', () => {
    expect(prizeOf(item({ modality: 'duque_dez', guesses: ['3478'] }))).toBe(30_000);
    expect(prizeOf(item({ modality: 'terno_dez', guesses: ['341290'] }))).toBe(500_000);
    expect(prizeOf(item({ modality: 'terno_dez_seco', guesses: ['127834'] }))).toBe(1_000_000);
    // 56 só no 4º prêmio: fora do 1/3.
    expect(prizeOf(item({ modality: 'terno_dez_seco', guesses: ['123456'] }))).toBe(0);
  });

  it('passe vai: o 1º grupo no 1º prêmio e o outro do 2º ao 5º; vai e vem: em qualquer ordem', () => {
    const prizes = groupsOf(5, 1, 2, 12, 3);
    expect(prizeOf(item({ modality: 'passe_vai', guesses: ['0512'] }), prizes)).toBe(9_000);
    expect(prizeOf(item({ modality: 'passe_vai', guesses: ['1205'] }), prizes)).toBe(0);
    expect(prizeOf(item({ modality: 'passe_vai_vem', guesses: ['1205'] }), prizes)).toBe(4_500);
    expect(prizeOf(item({ modality: 'passe_vai', guesses: ['0525'] }), [...prizes, groupsOf(25)[0]!])).toBe(0);
  });

  it('vários palpites: cada palpite premiado paga uma vez', () => {
    const prizes = groupsOf(5, 12, 7, 12, 20);
    const won = settleLotteryItem(item({ modality: 'duque_gp', guesses: ['0512', '0720', '0102'] }), prizes)!;
    expect(won.guesses).toEqual(['0512', '0720']);
    expect(won.prizeCents).toBe(6_000 * 2);
  });
});

describe('regras de toda a tabela', () => {
  it('toda modalidade vendida tem regra de apuração', () => {
    for (const modality of LOTTERY_MODALITIES) {
      const guess = '1'.repeat(modality.digits * modality.parts);
      const placement = placementsFor(modality)[0]!.id;
      expect(() =>
        settleLotteryItem(item({ modality: modality.id, placement, guesses: [guess] }), SEVEN),
      ).not.toThrow();
    }
  });

  it('o acerto na melhor posição paga exatamente o "possível prêmio" do recibo', () => {
    // Palpite que acerta o número 1234 em cada modalidade de um número.
    const HIT: Record<string, string> = {
      centena_esquerda: '123',
      centena_inv_esq: '321',
      dezena_esq: '12',
      dezena_meio: '23',
    };
    for (const modality of LOTTERY_MODALITIES.filter((m) => m.kind !== 'combo')) {
      for (const placement of placementsFor(modality, 'tradicional_10')) {
        const guess = HIT[modality.id] ?? (modality.groups ? '09' : '1234'.slice(-modality.digits));
        const bet = item({ modality: modality.id, placement: placement.id, guesses: [guess], amountCents: 700 });
        // 1234 só na primeira posição da colocação; nas outras, um número que não acerta nada.
        const prizes = Array.from({ length: 10 }, (_, i) => (i + 1 === placement.positions[0] ? '1234' : '5555'));
        const possible = lotteryPossiblePrizeCents(modality, placement, [guess], 700, 'total', bet.quoteCents);
        expect(possible, `${modality.id} ${placement.id}`).toBeGreaterThan(0);
        expect(prizeOf(bet, prizes), `${modality.id} ${placement.id}`).toBe(possible);
      }
    }
  });

  it('modalidade desconhecida não é dada como perdida: erro de regra (o pule fica pendente)', () => {
    expect(() => settleLotteryItem({ ...item({ modality: 'milhar' }), modality: 'palpitao' }, SEVEN)).toThrow(
      SettlementRuleError,
    );
  });
});

describe('Fazendinha', () => {
  const bet = (mode: 'grupo' | 'dezena' | 'centena', numbers: number[]) => ({ mode, numbers, prizeCents: 2_200 });

  it('vale só o 1º prêmio, pelo prêmio gravado na compra', () => {
    expect(settleFazendinhaBet(bet('grupo', [9, 10]), SEVEN)).toEqual({
      status: 'settled',
      prizeCents: 2_200,
      items: [{ position: 1, guesses: ['09'], prizeCents: 2_200 }],
    });
    expect(settleFazendinhaBet(bet('dezena', [34]), SEVEN)).toMatchObject({ prizeCents: 2_200 });
    expect(settleFazendinhaBet(bet('centena', [234]), SEVEN)).toMatchObject({
      items: [{ guesses: ['234'] }],
    });
    // 78 está no 2º prêmio: não vale.
    expect(settleFazendinhaBet(bet('dezena', [78]), SEVEN)).toEqual({ status: 'settled', prizeCents: 0, items: [] });
    expect(settleFazendinhaBet(bet('grupo', [25]), ['1200'])).toMatchObject({ prizeCents: 2_200 });
    expect(settleFazendinhaBet(bet('centena', [5]), ['91005'])).toMatchObject({ items: [{ guesses: ['005'] }] });
  });
});
