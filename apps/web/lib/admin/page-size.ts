/** Opções de "resultados por página" das listas do painel (a API aceita até 100). */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Tamanho da URL com tolerância: fora das opções vira o padrão, nunca erro (a URL é digitável). */
export function parsePageSize(raw: string | string[] | undefined): number {
  const size = Number(first(raw));
  return PAGE_SIZES.find((option) => option === size) ?? DEFAULT_PAGE_SIZE;
}
