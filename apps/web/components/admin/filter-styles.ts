/** Classes do visual do painel (filtros, botões e etiquetas), usadas pelas listas. */
export const labelClass = 'mb-1.5 block text-[12px] font-medium text-admin-text';
/** Campo sem altura nem largura (para quem precisa de outras medidas, como o número do ticket). */
export const controlBaseClass =
  'rounded-md border border-admin-border bg-admin-surface px-3 text-[14px] text-admin-text outline-none placeholder:text-admin-muted focus:border-admin-accent focus:ring-2 focus:ring-admin-accent/20';
export const controlClass = `h-10 w-full ${controlBaseClass}`;
export const primaryButtonClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-admin-accent px-3 text-[14px] font-medium text-white hover:bg-admin-accent-dark disabled:opacity-60';
export const outlineButtonClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-admin-border bg-admin-surface px-3 text-[14px] font-medium text-admin-text hover:bg-admin-hover';
/** Botão pequeno contornado (ações da caixa de resultados, Editar na tabela). */
export const smallButtonClass =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-admin-border bg-admin-surface px-3 text-[13px] font-medium text-admin-text hover:bg-admin-hover';
/** Atalho de período (Hoje, 7D...): contornado; o escolhido, preenchido. */
export const chipClass = (active: boolean) =>
  `inline-flex h-10 items-center rounded-md border px-3.5 text-[14px] font-medium ${
    active
      ? 'border-admin-accent bg-admin-accent text-white'
      : 'border-admin-border bg-admin-surface text-admin-text hover:bg-admin-hover'
  }`;
