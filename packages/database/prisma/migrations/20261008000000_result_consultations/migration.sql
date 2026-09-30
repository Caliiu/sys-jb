-- Registro das consultas à API de resultados do provedor (somente inclusão): evita repetir uma consulta recente e
-- conta o uso da cota mensal (cada resposta HTTP, novas tentativas incluídas). Global, sem banca.
-- DDL no formato do Prisma; regras e privilégios na segunda parte.
-- CreateTable
CREATE TABLE "result_consultations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "draw_date" DATE NOT NULL,
    "lottery" TEXT NOT NULL,
    "extraction" SMALLINT,
    "status" TEXT NOT NULL,
    "http_status" SMALLINT,
    "responses" SMALLINT NOT NULL,
    "items" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "result_consultations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_consultations_requested_at_idx" ON "result_consultations"("requested_at");

-- CreateIndex
CREATE INDEX "result_consultations_draw_date_lottery_requested_at_idx" ON "result_consultations"("draw_date", "lottery", "requested_at" DESC);



ALTER TABLE "result_consultations"
  ADD CONSTRAINT "result_consultations_lottery_format" CHECK ("lottery" ~ '^[a-z]{2,4}$'),
  ADD CONSTRAINT "result_consultations_extraction_range" CHECK ("extraction" IS NULL OR "extraction" BETWEEN 0 AND 23),
  ADD CONSTRAINT "result_consultations_status" CHECK ("status" IN ('OK', 'EMPTY', 'ERROR')),
  ADD CONSTRAINT "result_consultations_http_status" CHECK ("http_status" IS NULL OR "http_status" BETWEEN 100 AND 599),
  ADD CONSTRAINT "result_consultations_responses" CHECK ("responses" BETWEEN 0 AND 10),
  ADD CONSTRAINT "result_consultations_items" CHECK ("items" >= 0),
  -- OK e EMPTY só com resposta.
  ADD CONSTRAINT "result_consultations_answered" CHECK ("status" = 'ERROR' OR ("http_status" IS NOT NULL AND "responses" >= 1));

-- Privilégios da role de runtime: registra e lê. Sem requested_at no INSERT (vale o default do banco), sem UPDATE e
-- sem DELETE: o uso da cota não pode ser apagado nem antedatado.
REVOKE ALL ON "result_consultations" FROM PUBLIC;
GRANT SELECT ON "result_consultations" TO "sysjb_app";
GRANT INSERT ("draw_date", "lottery", "extraction", "status", "http_status", "responses", "items")
  ON "result_consultations" TO "sysjb_app";
