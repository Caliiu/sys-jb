import type { PrismaClient } from '@sysjb/database';

type Db = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

export type ConsultationStatus = 'OK' | 'EMPTY' | 'ERROR';

export interface ConsultationRecord {
  date: string;
  lottery: string;
  extraction?: number;
  status: ConsultationStatus;
  httpStatus: number | null;
  responses: number;
  items: number;
}

/** Registra a consulta (a data/hora é do banco). */
export async function recordConsultation(db: Db, r: ConsultationRecord): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "result_consultations" ("draw_date", "lottery", "extraction", "status", "http_status", "responses", "items")
    VALUES (${r.date}::date, ${r.lottery}, ${r.extraction ?? null}::smallint, ${r.status}, ${r.httpStatus}::smallint,
            ${r.responses}::smallint, ${r.items})`;
}

/** Respostas recebidas do provedor no mês corrente (Brasília): o uso da cota. */
export async function monthUsage(db: Db): Promise<number> {
  const rows = await db.$queryRaw<Array<{ used: number }>>`
    SELECT COALESCE(sum("responses"), 0)::int AS used FROM "result_consultations"
    WHERE "requested_at" >= date_trunc('month', clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')
                           AT TIME ZONE 'America/Sao_Paulo'`;
  return rows[0]?.used ?? 0;
}

/** Última consulta respondida (resultado ou "nenhum resultado") da data e sigla, de qualquer extração. */
export async function lastAnsweredAt(db: Db, date: string, lottery: string): Promise<Date | null> {
  const rows = await db.$queryRaw<Array<{ at: Date | null }>>`
    SELECT max("requested_at") AS at FROM "result_consultations"
    WHERE "draw_date" = ${date}::date AND "lottery" = ${lottery} AND "status" IN ('OK', 'EMPTY')`;
  return rows[0]?.at ?? null;
}

/** Extrações já gravadas da data e sigla. */
export async function storedExtractions(db: Db, date: string, lottery: string): Promise<Set<number>> {
  const rows = await db.$queryRaw<Array<{ extraction: number }>>`
    SELECT "extraction" FROM "lottery_results" WHERE "draw_date" = ${date}::date AND "lottery" = ${lottery}`;
  return new Set(rows.map((row) => row.extraction));
}
