-- Loterias > Atrasados (API de atrasados da Loteria Integrada): cache da última resposta por loteria/extração do
-- provedor, global (sem banca). A API busca quando o jogador pede e o cache venceu; o jogador nunca chama o provedor.
-- CHECKs repetem a validação da API. DDL no formato do Prisma; regras e privilégios na segunda parte.

-- CreateTable
CREATE TABLE "overdue_snapshots" (
    "lottery" TEXT NOT NULL,
    "extraction" SMALLINT NOT NULL,
    "last_dates" TEXT[],
    "reference_date" DATE NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overdue_snapshots_pkey" PRIMARY KEY ("lottery","extraction")
);



-- Os 25 grupos, cada um com YYYY-MM-DD ou '' (nunca saiu).
ALTER TABLE "overdue_snapshots"
  ALTER COLUMN "last_dates" SET NOT NULL,
  ADD CONSTRAINT "overdue_snapshots_lottery_format" CHECK ("lottery" ~ '^[a-z]{2,4}$'),
  ADD CONSTRAINT "overdue_snapshots_extraction_range" CHECK ("extraction" BETWEEN 0 AND 23),
  ADD CONSTRAINT "overdue_snapshots_last_dates" CHECK (
    array_ndims("last_dates") = 1 AND cardinality("last_dates") = 25
    AND array_to_string("last_dates", ',', 'NULL') ~ '^(\d{4}-\d{2}-\d{2})?(,(\d{4}-\d{2}-\d{2})?){24}$'),
  ADD CONSTRAINT "overdue_snapshots_reference_date" CHECK ("reference_date" >= DATE '2020-01-01');

-- Privilégios da role de runtime: lê, inclui e atualiza (nova busca). Não exclui.
REVOKE ALL ON "overdue_snapshots" FROM PUBLIC;
GRANT SELECT ON "overdue_snapshots" TO "sysjb_app";
GRANT INSERT ("lottery", "extraction", "last_dates", "reference_date", "fetched_at") ON "overdue_snapshots" TO "sysjb_app";
GRANT UPDATE ("last_dates", "reference_date", "fetched_at") ON "overdue_snapshots" TO "sysjb_app";
