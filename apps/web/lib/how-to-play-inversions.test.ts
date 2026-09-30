import { describe, expect, it } from 'vitest';
import { COMBINATION_TABLES, INVERSION_TABLES, INVERSION_TOPIC_TABLES } from './how-to-play-inversions';

/** Combinações simples: n números tomados k a k. */
function combinations(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return result;
}

/** Sequências distintas de `size` algarismos formadas com os algarismos do palpite (cada um usado uma vez). */
function arrangements(digits: string, size: number): number {
  const seen = new Set<string>();
  const walk = (prefix: string, rest: string[]) => {
    if (prefix.length === size) {
      seen.add(prefix);
      return;
    }
    rest.forEach((digit, i) =>
      walk(
        prefix + digit,
        rest.filter((_, j) => j !== i),
      ),
    );
  };
  walk('', [...digits]);
  return seen.size;
}

describe('Tabela de Inversão (conferida pela conta)', () => {
  it.each(COMBINATION_TABLES.map((t) => [t.title, t] as const))(
    '%s: combinações = C(palpites, tamanho)',
    (_, table) => {
      for (const [guesses, total] of table.rows)
        expect(total, `${guesses} palpites`).toBe(combinations(guesses, table.size));
    },
  );

  it.each(INVERSION_TABLES.map((t) => [t.title, t] as const))('%s: inversões = sequências distintas', (_, table) => {
    const examples = table.rows.map(([example]) => example);
    expect(new Set(examples).size, 'exemplos repetidos').toBe(examples.length);
    for (const [example, total] of table.rows) {
      expect(example).toMatch(/^\d{3,10}$/);
      expect(total, example).toBe(arrangements(example, table.digits));
    }
  });

  it('as três linhas corrigidas do texto original', () => {
    const centena = new Map(INVERSION_TABLES[0]!.rows);
    const milhar = new Map(INVERSION_TABLES[1]!.rows);
    expect(centena.get('11112')).toBe(4);
    expect(centena.get('1122345678')).toBe(378);
    expect(milhar.get('1111222234')).toBe(128);
    expect(milhar.has('1111222333')).toBe(false);
  });

  it('formato da tela: combinadas com 2 colunas, invertidas com algarismos, exemplo e inversões', () => {
    expect(INVERSION_TOPIC_TABLES.map((t) => t.title)).toEqual([
      'Duque de Grupo/Dezena',
      'Terno de Grupo/Dezena',
      'Quadra de Grupo',
      'Quina de Grupo',
      'Centena Invertida',
      'Milhar Invertida',
    ]);
    expect(INVERSION_TOPIC_TABLES[4]!.rows[0]).toEqual(['3', '123', '6']);
    expect(INVERSION_TOPIC_TABLES[0]!.columns).toEqual(['Palpites', 'Combinações']);
  });
});
