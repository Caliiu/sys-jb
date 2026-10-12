// Relatório em tabela do painel (ex.: Pules Premiadas > PDF), gerado sem biblioteca, como o comprovante
// (lib/receipt-pdf.ts): A4 deitado, fontes padrão do PDF (Helvetica, sem embutir, WinAnsiEncoding), título e
// linhas de cabeçalho na primeira página, a tabela quebrando em quantas páginas precisar (com o cabeçalho das
// colunas repetido) e o rodapé "Gerado em ... · Página X de Y".

export interface TablePdfColumn {
  header: string;
  /** Largura em pontos (a soma deve caber em CONTENT_WIDTH). */
  width: number;
  align?: 'left' | 'right';
}

export interface TablePdfInput {
  /** Título no topo e na aba do visualizador. */
  title: string;
  /** Linhas de informação abaixo do título (banca, período, filtros, totais, avisos). */
  lines: string[];
  columns: TablePdfColumn[];
  /** Células já formatadas; texto maior que a coluna é cortado com "…". */
  rows: string[][];
  /** Texto quando não há linhas. */
  emptyText: string;
  /** Rodapé à esquerda (ex.: "Gerado em 09/10/2026 14:30"). */
  footer: string;
}

export const PAGE_WIDTH = 842;
export const PAGE_HEIGHT = 595;
const MARGIN = 28;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const TITLE_SIZE = 16;
const LINE_SIZE = 10;
const LINE_HEIGHT = 14;
const CELL_SIZE = 8;
const HEADER_ROW_HEIGHT = 18;
const ROW_HEIGHT = 15;
const CELL_PADDING = 4;
const FOOTER_SPACE = 24;

// Larguras (1/1000 em) de Helvetica e Helvetica-Bold, do espaço (32) ao til (126). Letras acentuadas medem o mesmo
// que a letra base.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389,
  280, 389, 584,
];

/** Caracteres fora de Latin-1 que o WinAnsiEncoding tem: código no encoding e largura. */
const WINANSI_EXTRA: Record<string, [code: number, width: number]> = {
  '…': [0x85, 1000],
  '–': [0x96, 556],
  '—': [0x97, 1000],
  '•': [0x95, 350],
  '›': [0x9b, 333],
};

function charWidth(char: string, bold: boolean): number {
  const extra = WINANSI_EXTRA[char];
  if (extra) return extra[1];
  if (char === '·') return 278;
  const code = char.normalize('NFD').charCodeAt(0);
  return code >= 32 && code <= 126 ? (bold ? BOLD : REGULAR)[code - 32]! : 556;
}

/** Largura do texto em pontos. */
export function textWidth(text: string, bold: boolean, size: number): number {
  let total = 0;
  for (const char of text) total += charWidth(char, bold);
  return (total * size) / 1000;
}

/** Corta o texto para caber em `width` (com "…" no fim). */
export function fitText(text: string, width: number, bold: boolean, size: number): string {
  if (textWidth(text, bold, size) <= width) return text;
  const chars = [...text];
  while (chars.length > 0 && textWidth(`${chars.join('')}…`, bold, size) > width) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

/**
 * String literal do PDF: só o que o WinAnsiEncoding cobre (o resto vira "?"), com ( ) \ escapados e os caracteres
 * acima de 0x7E em octal (o arquivo fica só com ASCII).
 */
function pdfString(text: string): string {
  let escaped = '';
  for (const char of text) {
    const code = WINANSI_EXTRA[char]?.[0] ?? char.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) escaped += '\\()'.includes(char) ? `\\${char}` : char;
    else if ((code >= 0xa0 && code <= 0xff) || char in WINANSI_EXTRA) escaped += `\\${code.toString(8)}`;
    else escaped += '?';
  }
  return `(${escaped})`;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Páginas: o conteúdo de cada uma (operadores do PDF). */
function drawPages(input: TablePdfInput): string[] {
  const pages: string[][] = [];
  let ops: string[] = [];
  // Coordenadas contadas do topo (como na tela); o PDF conta de baixo.
  const y = (top: number) => num(PAGE_HEIGHT - top);
  const text = (x: number, baseline: number, value: string, size: number, bold = false) =>
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${num(x)} ${y(baseline)} Td ${pdfString(value)} Tj ET`);

  let top = MARGIN;
  ops.push('0.1 g');
  text(MARGIN, top + TITLE_SIZE, fitText(input.title, CONTENT_WIDTH, true, TITLE_SIZE), TITLE_SIZE, true);
  top += TITLE_SIZE + 10;
  ops.push('0.3 g');
  for (const line of input.lines) {
    text(MARGIN, top + LINE_SIZE, fitText(line, CONTENT_WIDTH, false, LINE_SIZE), LINE_SIZE);
    top += LINE_HEIGHT;
  }
  top += 8;

  const bottom = PAGE_HEIGHT - MARGIN - FOOTER_SPACE;
  const cells = (values: string[], baselineTop: number, bold: boolean) => {
    let x = MARGIN;
    input.columns.forEach((column, i) => {
      const value = fitText(values[i] ?? '', column.width - 2 * CELL_PADDING, bold, CELL_SIZE);
      const left =
        column.align === 'right'
          ? x + column.width - CELL_PADDING - textWidth(value, bold, CELL_SIZE)
          : x + CELL_PADDING;
      text(left, baselineTop, value, CELL_SIZE, bold);
      x += column.width;
    });
  };
  const header = () => {
    ops.push(`0.94 g ${MARGIN} ${y(top + HEADER_ROW_HEIGHT)} ${CONTENT_WIDTH} ${HEADER_ROW_HEIGHT} re f`);
    ops.push('0.1 g');
    cells(
      input.columns.map((c) => c.header),
      top + 12,
      true,
    );
    top += HEADER_ROW_HEIGHT;
  };
  const newPage = () => {
    pages.push(ops);
    ops = [];
    top = MARGIN;
    header();
  };

  header();
  if (input.rows.length === 0) {
    ops.push('0.4 g');
    text(MARGIN + CELL_PADDING, top + 14, input.emptyText, LINE_SIZE);
  }
  for (const row of input.rows) {
    if (top + ROW_HEIGHT > bottom) newPage();
    ops.push('0.15 g');
    cells(row, top + 10.5, false);
    top += ROW_HEIGHT;
    ops.push(`0.88 G 0.5 w ${MARGIN} ${y(top)} m ${MARGIN + CONTENT_WIDTH} ${y(top)} l S`);
  }
  pages.push(ops);

  // Rodapé de cada página, já sabendo o total.
  return pages.map((pageOps, i) => {
    const pageLabel = `Página ${i + 1} de ${pages.length}`;
    const baseline = PAGE_HEIGHT - MARGIN + 4;
    const footer = [
      '0.45 g',
      `BT /F1 ${CELL_SIZE} Tf ${MARGIN} ${y(baseline)} Td ${pdfString(input.footer)} Tj ET`,
      `BT /F1 ${CELL_SIZE} Tf ${num(PAGE_WIDTH - MARGIN - textWidth(pageLabel, false, CELL_SIZE))} ${y(baseline)} Td ${pdfString(pageLabel)} Tj ET`,
    ];
    return [...pageOps, ...footer].join('\n');
  });
}

/** Monta o PDF; retorna os bytes do arquivo. */
export function buildTablePdf(input: TablePdfInput): Uint8Array<ArrayBuffer> {
  const contents = drawPages(input);
  const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;

  // 1 catálogo, 2 páginas, 3 e 4 fontes, 5 info; depois página e conteúdo de cada página.
  const pageIds = contents.map((_, i) => 6 + 2 * i);
  const objects: Array<Array<string | Uint8Array>> = [
    ['<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>'],
    [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${contents.length} >>`],
    [font('Helvetica')],
    [font('Helvetica-Bold')],
    [`<< /Title ${pdfString(input.title)} /Producer (sysjb) >>`],
  ];
  contents.forEach((content, i) => {
    const bytes = latin1(content);
    objects.push([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`,
    ]);
    objects.push([`<< /Length ${bytes.length} >>\nstream\n`, bytes, '\nendstream']);
  });

  const chunks: Uint8Array[] = [];
  let length = 0;
  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? latin1(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets: number[] = [];
  objects.forEach((parts, i) => {
    offsets.push(length);
    write(`${i + 1} 0 obj\n`);
    parts.forEach(write);
    write('\nendobj\n');
  });
  const xref = length;
  write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) write(`${String(offset).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
