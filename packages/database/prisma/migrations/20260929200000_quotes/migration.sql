-- Cotações por banca (Tradicional e Fazendinha), editadas pelo Gerente no painel. Sem linha = vale o
-- padrão do código (@sysjb/contracts, quotes.ts). O pule da Fazendinha passa a guardar o prêmio por número
-- vigente na compra (prize_cents), já que a cotação pode mudar depois.

-- CreateTable (DDL gerado pelo Prisma)
CREATE TABLE "traditional_quotes" (
    "tenant_id" UUID NOT NULL,
    "modality" TEXT NOT NULL,
    "prize_cents" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traditional_quotes_pkey" PRIMARY KEY ("tenant_id","modality")
);

CREATE TABLE "fazendinha_quotes" (
    "tenant_id" UUID NOT NULL,
    "mode" "fazendinha_mode" NOT NULL,
    "stake_cents" INTEGER NOT NULL,
    "prize_cents" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fazendinha_quotes_pkey" PRIMARY KEY ("tenant_id","mode","stake_cents")
);

ALTER TABLE "traditional_quotes" ADD CONSTRAINT "traditional_quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fazendinha_quotes" ADD CONSTRAINT "fazendinha_quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valores: prêmio de R$ 0,00 (desligado) a R$ 1.000.000,00. A API confere modalidade e valor de aposta
-- contra o catálogo antes de gravar.
ALTER TABLE "traditional_quotes"
  ADD CONSTRAINT "traditional_quotes_prize_range" CHECK ("prize_cents" BETWEEN 0 AND 100000000),
  ADD CONSTRAINT "traditional_quotes_modality_format" CHECK ("modality" ~ '^[a-z0-9_]{1,40}$');
ALTER TABLE "fazendinha_quotes"
  ADD CONSTRAINT "fazendinha_quotes_prize_range" CHECK ("prize_cents" BETWEEN 0 AND 100000000),
  ADD CONSTRAINT "fazendinha_quotes_stake_positive" CHECK ("stake_cents" > 0);

-- RLS (mesma regra das outras tabelas).
ALTER TABLE "traditional_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "traditional_quotes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "traditional_quotes_tenant_isolation" ON "traditional_quotes"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "fazendinha_quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fazendinha_quotes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fazendinha_quotes_tenant_isolation" ON "fazendinha_quotes"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

REVOKE ALL ON "traditional_quotes", "fazendinha_quotes" FROM PUBLIC;
GRANT SELECT ON "traditional_quotes", "fazendinha_quotes" TO "sysjb_app";
GRANT INSERT ("tenant_id", "modality", "prize_cents", "updated_at") ON "traditional_quotes" TO "sysjb_app";
GRANT UPDATE ("prize_cents", "updated_at") ON "traditional_quotes" TO "sysjb_app";
GRANT INSERT ("tenant_id", "mode", "stake_cents", "prize_cents", "updated_at") ON "fazendinha_quotes" TO "sysjb_app";
GRANT UPDATE ("prize_cents", "updated_at") ON "fazendinha_quotes" TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Pule da Fazendinha: prêmio por número gravado na compra. Pules antigos: valor × cotação da época.
-- (A multiplicação antiga fica para histórico; com cotação livre ela pode não ser inteira, então passa a
-- aceitar 0.)
-- ---------------------------------------------------------------------------
ALTER TABLE "fazendinha_bets" ADD COLUMN "prize_cents" INTEGER;

ALTER TABLE "fazendinha_bets" NO FORCE ROW LEVEL SECURITY;
UPDATE "fazendinha_bets" SET "prize_cents" = "stake_cents" * "multiplier" WHERE "prize_cents" IS NULL;
ALTER TABLE "fazendinha_bets" FORCE ROW LEVEL SECURITY;

ALTER TABLE "fazendinha_bets"
  ALTER COLUMN "prize_cents" SET NOT NULL,
  ADD CONSTRAINT "fazendinha_bets_prize_range" CHECK ("prize_cents" BETWEEN 1 AND 100000000),
  DROP CONSTRAINT "fazendinha_bets_multiplier_positive",
  ADD CONSTRAINT "fazendinha_bets_multiplier_nonnegative" CHECK ("multiplier" >= 0);

GRANT INSERT ("prize_cents") ON "fazendinha_bets" TO "sysjb_app";
