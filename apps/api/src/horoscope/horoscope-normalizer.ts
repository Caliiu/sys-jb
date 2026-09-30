import {
  HOROSCOPE_LIMITS,
  type HoroscopeSign,
  type PublicHoroscopeReading,
  dayOffsetOf,
  isHoroscopeSign,
} from '@sysjb/contracts';
import { z } from 'zod';

export interface HoroscopeBatch {
  /** Data de referência do provedor (YYYY-MM-DD). */
  date: string;
  readings: PublicHoroscopeReading[];
  /** Itens descartados (posição e motivo, nunca o conteúdo). */
  rejected: Array<{ index: number; reason: string }>;
}

export type NormalizeHoroscopeOutcome = { ok: true; batch: HoroscopeBatch } | { ok: false; reason: string };

/** Resposta de sucesso: só o que usamos. Campos a mais são ignorados. */
const responseSchema = z.object({
  informacoes: z.object({ data_referencia: z.string().max(20) }),
  dados: z.array(z.unknown()).max(50),
});

const itemSchema = z.object({
  signo: z.string().max(40),
  previsao: z.string().max(10_000),
  dezenas: z.union([z.string().max(200), z.array(z.union([z.string().max(4), z.number()])).max(20)]),
  cores: z
    .union([z.string().max(400), z.array(z.string().max(60)).max(20)])
    .optional()
    .nullable(),
});

/** "Áries" → "aries"; "Escorpião" → "escorpiao". */
export function signFromName(name: string): HoroscopeSign | null {
  const id = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return isHoroscopeSign(id) ? id : null;
}

/** Texto do provedor: sem caracteres de controle e espaços repetidos. Vai para a tela como texto (nunca HTML). */
function cleanText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * "78-04-46-45-68" (formato real da API), "04, 18, 29" (formato da documentação) ou lista → ["78", "04", …]; null se
 * tiver algo que não seja dezena.
 */
function parseTens(raw: string | Array<string | number>): string[] | null {
  const parts = typeof raw === 'string' ? (raw.trim() === '' ? [] : raw.split(/[\s,;\-/|]+/).filter(Boolean)) : raw;
  const tens: string[] = [];
  for (const part of parts) {
    const text = String(part).trim();
    if (!/^\d{1,2}$/.test(text)) return null;
    const ten = text.padStart(2, '0');
    if (!tens.includes(ten)) tens.push(ten);
  }
  return tens.length >= 1 && tens.length <= HOROSCOPE_LIMITS.tensMax ? tens : null;
}

/** "Vermelho, Branco" (ou lista) → ["Vermelho", "Branco"]; ignora vazias e longas demais. */
function parseColors(raw: string | string[] | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const parts = typeof raw === 'string' ? raw.split(/[,;]/) : raw;
  return parts
    .map((part) => cleanText(part))
    .filter((color) => color.length >= 1 && color.length <= HOROSCOPE_LIMITS.colorMax)
    .slice(0, HOROSCOPE_LIMITS.colorsMax);
}

/** Data de referência: YYYY-MM-DD ou DD/MM/YYYY, real e não futura (Brasília). */
function parseDate(raw: string, nowIso: string): string | null {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  const date = br ? `${br[3]}-${br[2]}-${br[1]}` : raw.trim();
  const offset = dayOffsetOf(nowIso, date);
  return offset !== null && offset <= 0 && date >= '2020-01-01' ? date : null;
}

/** Resposta do provedor → previsões válidas do dia. Sem nenhuma válida (ou sem data): recusa tudo. */
export function normalizeHoroscope(body: unknown, nowIso: string): NormalizeHoroscopeOutcome {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'resposta em formato inesperado' };
  const date = parseDate(parsed.data.informacoes.data_referencia, nowIso);
  if (!date) return { ok: false, reason: 'data de referência inválida' };

  const readings: PublicHoroscopeReading[] = [];
  const rejected: HoroscopeBatch['rejected'] = [];
  parsed.data.dados.forEach((raw, index) => {
    const item = itemSchema.safeParse(raw);
    if (!item.success) return rejected.push({ index, reason: 'formato inesperado' });
    const sign = signFromName(item.data.signo);
    if (!sign) return rejected.push({ index, reason: 'signo desconhecido' });
    if (readings.some((r) => r.sign === sign)) return rejected.push({ index, reason: 'signo repetido' });
    const text = cleanText(item.data.previsao);
    if (text.length < 1 || text.length > HOROSCOPE_LIMITS.textMax) {
      return rejected.push({ index, reason: 'previsão vazia ou longa demais' });
    }
    const tens = parseTens(item.data.dezenas);
    if (!tens) return rejected.push({ index, reason: 'dezenas inválidas' });
    readings.push({ sign, text, tens, colors: parseColors(item.data.cores) });
  });

  if (readings.length === 0) return { ok: false, reason: 'nenhuma previsão válida' };
  return { ok: true, batch: { date, readings, rejected } };
}
