-- Resultados das loterias recebidos do provedor (Loteria Integrada), por webhook ou pela API de consulta. Globais
-- (sem banca): o resultado de uma extração é o mesmo para todas. Um por data + sigla + extração; uma correção do
-- provedor substitui o resultado e o trigger guarda a versão anterior (somente inclusão). Revisão e datas são
-- sempre do banco, nunca do que a API mandar.
-- DDL no formato do Prisma; regras, triggers e privilégios na segunda parte.
-- CreateTable
CREATE TABLE "lottery_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "draw_date" DATE NOT NULL,
    "lottery" TEXT NOT NULL,
    "extraction" SMALLINT NOT NULL,
    "prizes" TEXT[],
    "sum_value" TEXT,
    "multiplication" TEXT,
    "skipped" TEXT,
    "super5" TEXT,
    "source" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_result_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "result_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "prizes" TEXT[],
    "sum_value" TEXT,
    "multiplication" TEXT,
    "skipped" TEXT,
    "super5" TEXT,
    "source" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "replaced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_result_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lottery_results_draw_date_lottery_extraction_key" ON "lottery_results"("draw_date", "lottery", "extraction");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_result_revisions_result_id_revision_key" ON "lottery_result_revisions"("result_id", "revision");

-- AddForeignKey
ALTER TABLE "lottery_result_revisions" ADD CONSTRAINT "lottery_result_revisions_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "lottery_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- CHECKs (a API valida antes; aqui é a segunda linha de defesa)
-- ---------------------------------------------------------------------------
-- Prêmios: 5 a 10 números, cada um com 4 dígitos (5 na Federal). CHECK não aceita subconsulta.
CREATE FUNCTION "lottery_result_prizes_valid"(p_prizes text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$
  SELECT array_ndims(p_prizes) = 1
     AND cardinality(p_prizes) BETWEEN 5 AND 10
     AND NOT EXISTS (SELECT 1 FROM unnest(p_prizes) AS n WHERE n IS NULL OR n !~ '^[0-9]{4,5}$')
$$;

ALTER TABLE "lottery_results"
  ALTER COLUMN "prizes" SET NOT NULL,
  ADD CONSTRAINT "lottery_results_lottery_format" CHECK ("lottery" ~ '^[a-z]{2,4}$'),
  ADD CONSTRAINT "lottery_results_extraction_range" CHECK ("extraction" BETWEEN 0 AND 23),
  ADD CONSTRAINT "lottery_results_draw_date_range" CHECK ("draw_date" >= DATE '2020-01-01'),
  ADD CONSTRAINT "lottery_results_prizes_valid" CHECK ("lottery_result_prizes_valid"("prizes")),
  ADD CONSTRAINT "lottery_results_extras_format" CHECK (
    ("sum_value" IS NULL OR "sum_value" ~ '^[0-9]{1,12}$')
    AND ("multiplication" IS NULL OR "multiplication" ~ '^[0-9]{1,12}$')
    AND ("skipped" IS NULL OR "skipped" ~ '^[0-9]{1,12}$')
    AND ("super5" IS NULL OR "super5" ~ '^[0-9]{1,12}$')),
  ADD CONSTRAINT "lottery_results_source" CHECK ("source" IN ('WEBHOOK', 'CONSULTA')),
  ADD CONSTRAINT "lottery_results_revision_positive" CHECK ("revision" >= 1);

ALTER TABLE "lottery_result_revisions"
  ALTER COLUMN "prizes" SET NOT NULL,
  ADD CONSTRAINT "lottery_result_revisions_prizes_valid" CHECK ("lottery_result_prizes_valid"("prizes")),
  ADD CONSTRAINT "lottery_result_revisions_source" CHECK ("source" IN ('WEBHOOK', 'CONSULTA')),
  ADD CONSTRAINT "lottery_result_revisions_revision_positive" CHECK ("revision" >= 1);

-- ---------------------------------------------------------------------------
-- Versões: inclusão sempre como revisão 1 com as datas do banco; alteração só do conteúdo (data, sigla e
-- extração não mudam). Alteração sem mudança de conteúdo é ignorada; com mudança, a versão anterior vai para
-- lottery_result_revisions (SECURITY DEFINER: a role de runtime não grava lá diretamente).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "lottery_results_insert"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW."revision" := 1;
  NEW."received_at" := clock_timestamp();
  NEW."updated_at" := NEW."received_at";
  RETURN NEW;
END;
$$;

CREATE TRIGGER "lottery_results_insert"
  BEFORE INSERT ON "lottery_results"
  FOR EACH ROW EXECUTE FUNCTION "lottery_results_insert"();

CREATE FUNCTION "lottery_results_update"() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF NEW."id" <> OLD."id" OR NEW."draw_date" <> OLD."draw_date" OR NEW."lottery" <> OLD."lottery"
     OR NEW."extraction" <> OLD."extraction" THEN
    RAISE EXCEPTION 'lottery result identity is immutable' USING ERRCODE = 'SJ006';
  END IF;
  IF NEW."prizes" = OLD."prizes"
     AND NEW."sum_value" IS NOT DISTINCT FROM OLD."sum_value"
     AND NEW."multiplication" IS NOT DISTINCT FROM OLD."multiplication"
     AND NEW."skipped" IS NOT DISTINCT FROM OLD."skipped"
     AND NEW."super5" IS NOT DISTINCT FROM OLD."super5" THEN
    RETURN NULL;
  END IF;

  INSERT INTO "lottery_result_revisions"
    ("result_id", "revision", "prizes", "sum_value", "multiplication", "skipped", "super5", "source", "received_at")
  VALUES
    (OLD."id", OLD."revision", OLD."prizes", OLD."sum_value", OLD."multiplication", OLD."skipped", OLD."super5",
     OLD."source", OLD."updated_at");

  NEW."revision" := OLD."revision" + 1;
  NEW."received_at" := OLD."received_at";
  NEW."updated_at" := clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "lottery_results_update"() FROM PUBLIC;

CREATE TRIGGER "lottery_results_update"
  BEFORE UPDATE ON "lottery_results"
  FOR EACH ROW EXECUTE FUNCTION "lottery_results_update"();

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: lê, inclui e corrige o conteúdo do resultado. Não exclui nada e não grava o
-- histórico (só o trigger).
-- ---------------------------------------------------------------------------
REVOKE ALL ON "lottery_results", "lottery_result_revisions" FROM PUBLIC;
GRANT SELECT ON "lottery_results", "lottery_result_revisions" TO "sysjb_app";
GRANT INSERT ("draw_date", "lottery", "extraction", "prizes", "sum_value", "multiplication", "skipped", "super5",
              "source") ON "lottery_results" TO "sysjb_app";
GRANT UPDATE ("prizes", "sum_value", "multiplication", "skipped", "super5", "source") ON "lottery_results" TO "sysjb_app";
