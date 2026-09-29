// Comprovante em PDF (Compartilhar de Cotações, Premiadas...), gerado no navegador sem biblioteca: uma
// página só, na largura de um recibo e na altura do conteúdo, com as fontes padrão do PDF (Helvetica, sem
// embutir) e o logo da banca como JPEG. Topo na cor da banca (logo, vendedor, data/hora) e, abaixo, blocos
// de linhas separados por um traço, com o texto em maiúsculas.
import type { PublicTenant } from '@sysjb/contracts';
import { tenantInitial } from './favicon';

export interface ReceiptPdfLogo {
  /** Bytes de um JPEG (baseline, RGB). */
  jpeg: Uint8Array;
  width: number;
  height: number;
}

/** Trecho de texto; `bold` para destacar (ex.: "PARA **DUQUE GP** E **TERNO GP**"). */
export interface ReceiptSegment {
  text: string;
  bold?: boolean;
}

/** Linha: texto à esquerda e, opcionalmente, valor alinhado à direita. */
export interface ReceiptLine {
  left: string | ReceiptSegment[];
  right?: string;
}

/** Bloco de linhas, separado do seguinte por um traço. */
export type ReceiptSection = ReceiptLine[];

export interface ReceiptPdfContent {
  /** Título do documento (aba do visualizador). */
  title: string;
  sellerId: number;
  /** "28/09/2026 19:34:36" */
  consultedAt: string;
  sections: ReceiptSection[];
}

export interface ReceiptPdfInput extends ReceiptPdfContent {
  /** Cor da faixa do topo, "#RRGGBB". */
  primaryColor: string;
  /** Logo da banca; sem ele, a inicial num selo branco. */
  logo: ReceiptPdfLogo | null;
  initial: string;
}

const PAGE_WIDTH = 320;
const MARGIN = 8;
const HEADER_HEIGHT = 38;
const FONT_SIZE = 10;
/** Bloco de uma linha só (as linhas de tabela). */
const SINGLE_LINE_HEIGHT = 37.5;
const SINGLE_LINE_BASELINE = 23;
/** Blocos de várias linhas: espaçamento entre linhas e respiro em cima e embaixo. */
const LINE_HEIGHT = 14;
const BLOCK_PADDING = 6;
const TEXT_GRAY = '0.13 g';
const LINE_GRAY = '0.9 G';

// Larguras (1/1000 em) das fontes padrão Helvetica e Helvetica-Bold, dos caracteres que a tabela usa
// (o texto sai todo em maiúsculas). Letras acentuadas medem o mesmo que a letra base.
const UPPER_REGULAR = [
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944,
  667, 667, 611,
];
const UPPER_BOLD = [
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944,
  667, 667, 611,
];
const SYMBOLS: Record<string, [regular: number, bold: number]> = {
  ' ': [278, 278],
  '!': [278, 333],
  '#': [556, 556],
  $: [556, 556],
  '%': [889, 889],
  '(': [333, 333],
  ')': [333, 333],
  '+': [584, 584],
  ',': [278, 278],
  '-': [333, 333],
  '.': [278, 278],
  '/': [278, 278],
  ':': [278, 333],
};

function charWidth(char: string, bold: boolean): number {
  const base = char.normalize('NFD').charAt(0);
  if (base >= '0' && base <= '9') return 556;
  if (base >= 'A' && base <= 'Z') return (bold ? UPPER_BOLD : UPPER_REGULAR)[base.charCodeAt(0) - 65]!;
  const symbol = SYMBOLS[base];
  return symbol ? symbol[bold ? 1 : 0] : 556;
}

/** Largura do texto em pontos. */
export function textWidth(text: string, bold: boolean, size = FONT_SIZE): number {
  let total = 0;
  for (const char of text) total += charWidth(char, bold);
  return (total * size) / 1000;
}

const upper = (text: string) => text.toLocaleUpperCase('pt-BR');

/**
 * String literal do PDF: só o que o WinAnsiEncoding cobre (o resto vira "?"), com ( ) \ escapados e os
 * caracteres acima de 0x7E em octal (o arquivo fica só com ASCII).
 */
function pdfString(text: string, uppercase = true): string {
  const value = (uppercase ? upper(text) : text).replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
  const escaped = value.replace(/[\\()]/g, '\\$&').replace(/[\xA0-\xFF]/g, (c) => `\\${c.charCodeAt(0).toString(8)}`);
  return `(${escaped})`;
}

function rgb(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = match ? parseInt(match[1]!, 16) : 0xdf2120;
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff];
  return channels.map((c) => (c / 255).toFixed(3)).join(' ');
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

const sectionHeight = (section: ReceiptSection) =>
  section.length <= 1 ? SINGLE_LINE_HEIGHT : 2 * BLOCK_PADDING + section.length * LINE_HEIGHT;

/** Monta o PDF; retorna os bytes do arquivo. */
export function buildReceiptPdf(input: ReceiptPdfInput): Uint8Array<ArrayBuffer> {
  const height = Math.ceil(HEADER_HEIGHT + input.sections.reduce((sum, s) => sum + sectionHeight(s), 0));
  const ops: string[] = [];
  // As coordenadas abaixo contam do topo (como na tela); o PDF conta de baixo.
  const y = (top: number) => num(height - top);

  const text = (x: number, baseline: number, value: string, bold = false) =>
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${FONT_SIZE} Tf ${num(x)} ${y(baseline)} Td ${pdfString(value)} Tj ET`);
  const textRight = (baseline: number, value: string, bold = false) =>
    text(PAGE_WIDTH - MARGIN - textWidth(upper(value), bold), baseline, value, bold);
  const separator = (top: number) => ops.push(`${LINE_GRAY} 0.75 w 0 ${y(top)} m ${PAGE_WIDTH} ${y(top)} l S`);

  // Faixa do topo: logo à esquerda, vendedor e data/hora à direita, em branco.
  ops.push(`${rgb(input.primaryColor)} rg 0 ${y(HEADER_HEIGHT)} ${PAGE_WIDTH} ${HEADER_HEIGHT} re f`);
  const logoBox = 30;
  const logoTop = (HEADER_HEIGHT - logoBox) / 2;
  if (input.logo) {
    const scale = Math.min(logoBox / input.logo.width, logoBox / input.logo.height);
    const w = input.logo.width * scale;
    const h = input.logo.height * scale;
    const top = logoTop + (logoBox - h) / 2;
    ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(MARGIN + (logoBox - w) / 2)} ${y(top + h)} cm /Im1 Do Q`);
  } else {
    ops.push(`1 g ${MARGIN} ${y(logoTop + logoBox)} ${logoBox} ${logoBox} re f`);
    ops.push(`${rgb(input.primaryColor)} rg`);
    const size = 16;
    const x = MARGIN + (logoBox - textWidth(input.initial, true, size)) / 2;
    ops.push(`BT /F2 ${size} Tf ${num(x)} ${y(logoTop + 21)} Td ${pdfString(input.initial)} Tj ET`);
  }
  ops.push('1 g');
  textRight(16, `VENDEDOR: ${input.sellerId}`, true);
  textRight(29, input.consultedAt);

  // Blocos (daqui em diante o texto é cinza-escuro; os traços só mudam a cor do contorno).
  ops.push(TEXT_GRAY);
  let top = HEADER_HEIGHT;
  for (const section of input.sections) {
    section.forEach((line, i) => {
      const baseline = section.length <= 1 ? top + SINGLE_LINE_BASELINE : top + BLOCK_PADDING + 10 + i * LINE_HEIGHT;
      let x = MARGIN;
      const segments = typeof line.left === 'string' ? [{ text: line.left }] : line.left;
      for (const segment of segments) {
        text(x, baseline, segment.text, segment.bold);
        x += textWidth(upper(segment.text), segment.bold ?? false);
      }
      if (line.right) textRight(baseline, line.right);
    });
    top += sectionHeight(section);
    separator(top);
  }

  return assemble(ops.join('\n'), height, input.logo, input.title);
}

/** Objetos do PDF, tabela xref e trailer. */
function assemble(
  content: string,
  height: number,
  logo: ReceiptPdfLogo | null,
  title: string,
): Uint8Array<ArrayBuffer> {
  const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  const resources = `<< /Font << /F1 5 0 R /F2 6 0 R >>${logo ? ' /XObject << /Im1 7 0 R >>' : ''} >>`;
  const font = (name: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  const contentBytes = latin1(content);

  const objects: Array<Array<string | Uint8Array>> = [
    ['<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${height}] /Resources ${resources} /Contents 4 0 R >>`],
    [`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, '\nendstream'],
    [font('Helvetica')],
    [font('Helvetica-Bold')],
  ];
  if (logo) {
    objects.push([
      `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.jpeg.length} >>\nstream\n`,
      logo.jpeg,
      '\nendstream',
    ]);
  }
  objects.push([`<< /Title ${pdfString(title, false)} /Producer (sysjb) >>`]);
  const infoId = objects.length;

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
  write(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/**
 * Logo da banca como JPEG sobre a cor da faixa (o JPEG não tem transparência). null se não houver
 * logo, se não der para lê-lo (ex.: URL externa sem CORS) ou se demorar mais que `timeoutMs`: o PDF
 * usa a inicial.
 */
export async function loadLogoJpeg(
  url: string | null,
  background: string,
  { size = 120, timeoutMs = 3000 } = {},
): Promise<ReceiptPdfLogo | null> {
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    const loaded = await Promise.race([
      img.decode().then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    if (!loaded) return null;
    const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
    const width = Math.round(ratio >= 1 ? size : size * ratio);
    const height = Math.round(ratio >= 1 ? size / ratio : size);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    // toDataURL é síncrono (toBlob pode demorar a responder com a aba em segundo plano).
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (!dataUrl.startsWith('data:image/jpeg;base64,')) return null;
    const jpeg = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    return { jpeg, width, height };
  } catch {
    return null;
  }
}

/**
 * Gera o comprovante e o abre numa aba nova. A aba é aberta já no clique (antes de carregar o logo), senão
 * o bloqueador de pop-ups a barraria; sem aba, o PDF abre na própria página. false = não deu para gerar.
 */
export async function openReceiptPdf(
  tenant: Pick<PublicTenant, 'name' | 'logoUrl' | 'primaryColor'>,
  content: ReceiptPdfContent,
): Promise<boolean> {
  const win = window.open('', '_blank');
  try {
    const logo = await loadLogoJpeg(tenant.logoUrl, tenant.primaryColor);
    const pdf = buildReceiptPdf({
      ...content,
      primaryColor: tenant.primaryColor,
      logo,
      initial: tenantInitial(tenant.name),
    });
    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    if (win) win.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    win?.close();
    return false;
  }
}
