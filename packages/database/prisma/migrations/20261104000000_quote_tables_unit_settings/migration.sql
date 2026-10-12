-- Tabelas de cotação nomeadas e configurações da unidade (jogador).
--
-- 1. quote_tables: a banca passa a ter várias tabelas de cotação com nome; exatamente uma é a padrão (vale para quem
--    não tem tabela própria). traditional_quotes / fazendinha_quotes passam a ser por tabela (sem linha = padrão do
--    código, como antes). A tabela atual de cada banca vira a padrão, com o nome do rótulo dela (ex.: 800/1/8000).
-- 2. users: região (UF), comissão da unidade, tabela de cotação (FK; null = padrão da banca), milhar brinde, reter
--    prêmios e limite diário. Aqui só as colunas; o comportamento vem depois.
-- 3. fazendinha_bets.quote_table: nome da tabela do comprador na compra (o pule de Loterias já guardava).
--
-- Exclusão de tabela: bloqueada enquanto houver unidade usando (FK RESTRICT) e nunca a padrão (API). Os itens da
-- tabela excluída vão junto (ON DELETE CASCADE).

-- ---------------------------------------------------------------------------
-- DDL (gerado pelo Prisma)
-- ---------------------------------------------------------------------------
CREATE TABLE "quote_tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_tables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_tables_tenant_id_id_key" ON "quote_tables"("tenant_id", "id");

ALTER TABLE "quote_tables" ADD CONSTRAINT "quote_tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN     "daily_limit_cents" INTEGER,
ADD COLUMN     "daily_limit_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gift_milhar_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quote_table_id" UUID,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "retain_prizes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unit_commission_bps" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "users_tenant_id_quote_table_id_idx" ON "users"("tenant_id", "quote_table_id");

ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_quote_table_id_fkey" FOREIGN KEY ("tenant_id", "quote_table_id") REFERENCES "quote_tables"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fazendinha_bets" ADD COLUMN "quote_table" TEXT;

ALTER TABLE "traditional_quotes" ADD COLUMN "quote_table_id" UUID;
ALTER TABLE "fazendinha_quotes" ADD COLUMN "quote_table_id" UUID;

-- ---------------------------------------------------------------------------
-- Dados: cada banca ganha a tabela padrão com o rótulo da tabela atual ("centena/1/milhar", em reais, sem
-- centavos quando inteiro; mesma regra de quoteTableLabel em @sysjb/contracts). O RLS forçado é suspenso só aqui,
-- para a dona enxergar todas as bancas.
-- ---------------------------------------------------------------------------
ALTER TABLE "traditional_quotes" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "fazendinha_quotes" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "fazendinha_bets" NO FORCE ROW LEVEL SECURITY;

WITH v AS (
  SELECT t."id" AS tenant_id,
         COALESCE((SELECT q."prize_cents" FROM "traditional_quotes" q
                    WHERE q."tenant_id" = t."id" AND q."modality" = 'centena'), 80000) AS centena,
         COALESCE((SELECT q."prize_cents" FROM "traditional_quotes" q
                    WHERE q."tenant_id" = t."id" AND q."modality" = 'milhar'), 800000) AS milhar
    FROM "tenants" t
)
INSERT INTO "quote_tables" ("tenant_id", "name", "is_default")
SELECT v.tenant_id,
       COALESCE(NULLIF(
         CASE WHEN v.centena % 100 = 0 THEN (v.centena / 100)::text
              ELSE replace(to_char(v.centena / 100.0, 'FM9999999990.00'), '.', ',') END
         || '/1/' ||
         CASE WHEN v.milhar % 100 = 0 THEN (v.milhar / 100)::text
              ELSE replace(to_char(v.milhar / 100.0, 'FM9999999990.00'), '.', ',') END,
         ''), 'Padrão'),
       true
  FROM v;

UPDATE "traditional_quotes" q SET "quote_table_id" = qt."id"
  FROM "quote_tables" qt WHERE qt."tenant_id" = q."tenant_id" AND qt."is_default";
UPDATE "fazendinha_quotes" q SET "quote_table_id" = qt."id"
  FROM "quote_tables" qt WHERE qt."tenant_id" = q."tenant_id" AND qt."is_default";
-- Pules antigos da Fazendinha: o nome da tabela da banca (era a única).
UPDATE "fazendinha_bets" b SET "quote_table" = qt."name"
  FROM "quote_tables" qt WHERE qt."tenant_id" = b."tenant_id" AND qt."is_default";

ALTER TABLE "traditional_quotes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "fazendinha_quotes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "fazendinha_bets" FORCE ROW LEVEL SECURITY;

-- Itens passam a ser por tabela.
ALTER TABLE "traditional_quotes" ALTER COLUMN "quote_table_id" SET NOT NULL,
DROP CONSTRAINT "traditional_quotes_pkey",
ADD CONSTRAINT "traditional_quotes_pkey" PRIMARY KEY ("tenant_id", "quote_table_id", "modality");
ALTER TABLE "fazendinha_quotes" ALTER COLUMN "quote_table_id" SET NOT NULL,
DROP CONSTRAINT "fazendinha_quotes_pkey",
ADD CONSTRAINT "fazendinha_quotes_pkey" PRIMARY KEY ("tenant_id", "quote_table_id", "mode", "stake_cents");

ALTER TABLE "traditional_quotes" ADD CONSTRAINT "traditional_quotes_tenant_id_quote_table_id_fkey" FOREIGN KEY ("tenant_id", "quote_table_id") REFERENCES "quote_tables"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fazendinha_quotes" ADD CONSTRAINT "fazendinha_quotes_tenant_id_quote_table_id_fkey" FOREIGN KEY ("tenant_id", "quote_table_id") REFERENCES "quote_tables"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints (segunda linha de defesa; a API valida antes)
--   nome: sem espaços nas pontas, 1 a 40 caracteres (cabe em lottery_tickets.quote_table), único na banca sem
--   diferenciar maiúsculas. No máximo uma padrão por banca (índice parcial); pelo menos uma, se a banca tiver
--   tabelas (trigger adiado, abaixo: trocar a padrão é desmarcar uma e marcar outra na mesma transação).
-- ---------------------------------------------------------------------------
ALTER TABLE "quote_tables"
  ADD CONSTRAINT "quote_tables_name_format" CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 40);
CREATE UNIQUE INDEX "quote_tables_tenant_name_key" ON "quote_tables"("tenant_id", lower("name"));
CREATE UNIQUE INDEX "quote_tables_one_default_key" ON "quote_tables"("tenant_id") WHERE "is_default";

ALTER TABLE "fazendinha_bets"
  ADD CONSTRAINT "fazendinha_bets_quote_table_length" CHECK ("quote_table" IS NULL OR char_length("quote_table") BETWEEN 1 AND 40);

--   unidade: UF brasileira; comissão de 0% a 100%; limite diário positivo e obrigatório quando ligado.
ALTER TABLE "users"
  ADD CONSTRAINT "users_region_uf" CHECK ("region" IS NULL OR "region" IN (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO',
    'RR','SC','SP','SE','TO')),
  ADD CONSTRAINT "users_unit_commission_range" CHECK ("unit_commission_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "users_daily_limit_positive" CHECK ("daily_limit_cents" IS NULL OR "daily_limit_cents" > 0),
  ADD CONSTRAINT "users_daily_limit_enabled_requires_value" CHECK (NOT "daily_limit_enabled" OR "daily_limit_cents" IS NOT NULL);

CREATE FUNCTION "quote_tables_require_default"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_tenant uuid := COALESCE(NEW."tenant_id", OLD."tenant_id");
BEGIN
  IF EXISTS (SELECT 1 FROM "quote_tables" WHERE "tenant_id" = v_tenant)
     AND NOT EXISTS (SELECT 1 FROM "quote_tables" WHERE "tenant_id" = v_tenant AND "is_default") THEN
    RAISE EXCEPTION 'quote tables must have exactly one default' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "quote_tables_require_default"
  AFTER INSERT OR UPDATE OR DELETE ON "quote_tables"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "quote_tables_require_default"();

-- ---------------------------------------------------------------------------
-- RLS (mesma regra das outras tabelas).
-- ---------------------------------------------------------------------------
ALTER TABLE "quote_tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_tables" FORCE ROW LEVEL SECURITY;
CREATE POLICY "quote_tables_tenant_isolation" ON "quote_tables"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime
--   quote_tables:      o painel cria, renomeia, troca a padrão e exclui (tenant_id nunca muda).
--   *_quotes:          o item nasce na tabela dele e só o prêmio muda depois.
--   users:             as configurações da unidade só mudam pelo painel (UPDATE); no cadastro valem os padrões.
--   fazendinha_bets:   o nome da tabela é gravado na compra.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "quote_tables" FROM PUBLIC;
GRANT SELECT, DELETE ON "quote_tables" TO "sysjb_app";
GRANT INSERT ("tenant_id", "name", "is_default", "created_at", "updated_at") ON "quote_tables" TO "sysjb_app";
GRANT UPDATE ("name", "is_default", "updated_at") ON "quote_tables" TO "sysjb_app";

GRANT INSERT ("quote_table_id") ON "traditional_quotes", "fazendinha_quotes" TO "sysjb_app";

GRANT UPDATE ("region", "unit_commission_bps", "quote_table_id", "gift_milhar_enabled", "retain_prizes",
              "daily_limit_enabled", "daily_limit_cents") ON "users" TO "sysjb_app";

GRANT INSERT ("quote_table") ON "fazendinha_bets" TO "sysjb_app";
