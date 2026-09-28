-- Loterias (Tradicional): pules por extração, itens, débito, travas e comissões sobre o valor apostado.
-- DDL gerado pelo Prisma; regras, RLS, funções, triggers e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "lottery_ticket_id" UUID;

-- CreateTable
CREATE TABLE "lottery_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pule_number" SERIAL NOT NULL,
    "purchase_key" UUID NOT NULL,
    "draw_date" DATE NOT NULL,
    "lottery" TEXT NOT NULL,
    "draw_hour" SMALLINT NOT NULL,
    "closes_at" TIMESTAMPTZ(3) NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "quote_table" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lottery_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_ticket_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "modality" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "guesses" TEXT[],
    "amount_cents" BIGINT NOT NULL,
    "split" TEXT NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "quote_cents" INTEGER NOT NULL,
    "possible_prize_cents" BIGINT NOT NULL,

    CONSTRAINT "lottery_ticket_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lottery_tickets_pule_number_key" ON "lottery_tickets"("pule_number");

-- CreateIndex
CREATE INDEX "lottery_tickets_tenant_id_user_id_created_at_idx" ON "lottery_tickets"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "lottery_tickets_tenant_id_created_at_idx" ON "lottery_tickets"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_tickets_tenant_id_id_key" ON "lottery_tickets"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_tickets_tenant_id_user_id_purchase_key_lottery_draw_key" ON "lottery_tickets"("tenant_id", "user_id", "purchase_key", "lottery", "draw_hour");

-- CreateIndex
CREATE INDEX "lottery_ticket_items_tenant_id_ticket_id_idx" ON "lottery_ticket_items"("tenant_id", "ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_ticket_items_ticket_id_position_key" ON "lottery_ticket_items"("ticket_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_lottery_ticket_id_key" ON "wallet_entries"("tenant_id", "lottery_ticket_id");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_lottery_ticket_id_fkey" FOREIGN KEY ("tenant_id", "lottery_ticket_id") REFERENCES "lottery_tickets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_tickets" ADD CONSTRAINT "lottery_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_tickets" ADD CONSTRAINT "lottery_tickets_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_ticket_items" ADD CONSTRAINT "lottery_ticket_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_ticket_items" ADD CONSTRAINT "lottery_ticket_items_tenant_id_ticket_id_fkey" FOREIGN KEY ("tenant_id", "ticket_id") REFERENCES "lottery_tickets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Número do pule: sequence própria, 9 dígitos, começando em 300000000 (os da Fazendinha começam em 1).
-- ---------------------------------------------------------------------------
ALTER SEQUENCE "lottery_tickets_pule_number_seq" START WITH 300000000 RESTART WITH 300000000;

-- ---------------------------------------------------------------------------
-- CHECKs (segunda linha de defesa; a API valida o catálogo e as cotações antes)
-- ---------------------------------------------------------------------------
ALTER TABLE "lottery_tickets"
  ADD CONSTRAINT "lottery_tickets_lottery_length" CHECK (char_length("lottery") BETWEEN 1 AND 40),
  ADD CONSTRAINT "lottery_tickets_draw_hour_range" CHECK ("draw_hour" BETWEEN 0 AND 23),
  ADD CONSTRAINT "lottery_tickets_total_range" CHECK ("total_cents" > 0 AND "total_cents" <= 9007199254740991),
  ADD CONSTRAINT "lottery_tickets_quote_table_length" CHECK (char_length("quote_table") BETWEEN 1 AND 40),
  -- O horário limite é no dia da extração (Brasília).
  ADD CONSTRAINT "lottery_tickets_closes_on_draw_date"
    CHECK (("closes_at" AT TIME ZONE 'America/Sao_Paulo')::date = "draw_date");

ALTER TABLE "lottery_ticket_items"
  ADD CONSTRAINT "lottery_ticket_items_position_range" CHECK ("position" BETWEEN 1 AND 20),
  ADD CONSTRAINT "lottery_ticket_items_modality_format" CHECK ("modality" ~ '^[a-z0-9_]{1,40}$'),
  ADD CONSTRAINT "lottery_ticket_items_placement_format" CHECK ("placement" ~ '^[a-z0-9_]{1,20}$'),
  ADD CONSTRAINT "lottery_ticket_items_split" CHECK ("split" IN ('total', 'each')),
  ADD CONSTRAINT "lottery_ticket_items_guesses" CHECK (
    cardinality("guesses") BETWEEN 1 AND 100
    AND array_position("guesses", NULL) IS NULL
  ),
  ADD CONSTRAINT "lottery_ticket_items_amounts" CHECK (
    "amount_cents" > 0 AND "total_cents" > 0 AND "total_cents" <= 9007199254740991
    AND "quote_cents" > 0 AND "possible_prize_cents" >= 0
  ),
  -- Total coerente com o modo: "Cada" = valor × palpites; "Todos" = o valor.
  ADD CONSTRAINT "lottery_ticket_items_total_matches" CHECK (
    ("split" = 'each' AND "total_cents" = "amount_cents" * cardinality("guesses"))
    OR ("split" = 'total' AND "total_cents" = "amount_cents")
  );

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE "lottery_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lottery_tickets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lottery_tickets_tenant_isolation" ON "lottery_tickets"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "lottery_ticket_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lottery_ticket_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "lottery_ticket_items_tenant_isolation" ON "lottery_ticket_items"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Movimentação LOTTERY_BET: débito de um pule de loteria (um por pule).
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind" CHECK (
    "kind" IN ('FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION', 'LOTTERY_BET')
  ),
  ADD CONSTRAINT "wallet_entries_lottery_rules" CHECK (
    ("kind" = 'LOTTERY_BET') = ("lottery_ticket_id" IS NOT NULL)
    AND ("kind" <> 'LOTTERY_BET' OR (
          "fazendinha_bet_id" IS NULL AND "commission_payout_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL
      AND "balance_jb_delta" <= 0 AND "prizes_jb_delta" <= 0 AND "bonus_jb_delta" = 0 AND "balance_games_delta" = 0
      AND ("balance_jb_delta" + "prizes_jb_delta") < 0))
  );

ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind_rules",
  ADD CONSTRAINT "wallet_entries_kind_rules" CHECK (
       ("kind" = 'FAZENDINHA_BET'
        AND "fazendinha_bet_id" IS NOT NULL AND "operator_id" IS NULL AND "idempotency_key" IS NULL
        AND "balance_jb_delta" <= 0 AND "prizes_jb_delta" <= 0 AND "bonus_jb_delta" = 0
        AND "balance_games_delta" = 0)
    OR ("kind" = 'MANUAL_ADJUSTMENT'
        AND "fazendinha_bet_id" IS NULL AND "operator_id" IS NULL AND "idempotency_key" IS NULL
        AND "note" IS NOT NULL AND char_length(btrim("note")) BETWEEN 3 AND 200
        AND "balance_games_delta" = 0
        AND ("balance_jb_delta" <> 0 OR "prizes_jb_delta" <> 0 OR "bonus_jb_delta" <> 0))
    OR ("kind" = 'OPERATOR_CREDIT'
        AND "fazendinha_bet_id" IS NULL AND "operator_id" IS NOT NULL AND "idempotency_key" IS NOT NULL
        AND "note" IS NOT NULL AND char_length(btrim("note")) BETWEEN 3 AND 200
        AND "prizes_jb_delta" = 0
        AND "balance_jb_delta" >= 0 AND "bonus_jb_delta" >= 0 AND "balance_games_delta" >= 0
        AND (("balance_jb_delta" > 0)::int + ("bonus_jb_delta" > 0)::int + ("balance_games_delta" > 0)::int) = 1)
    OR ("kind" = 'OPENING_BALANCE' AND "fazendinha_bet_id" IS NULL AND "operator_id" IS NULL)
    OR "kind" = 'COMMISSION'
    OR "kind" = 'LOTTERY_BET'
  );

-- ---------------------------------------------------------------------------
-- Débito do pule (mesmo desenho do fazendinha_debit): a role de runtime continua sem UPDATE em wallets.
-- Confere total do pule = soma dos itens, tira do saldo e depois dos prêmios (bônus não), uma vez só.
-- Saldo insuficiente: SQLSTATE SJ001.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "lottery_debit"(p_ticket_id uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_ticket "lottery_tickets"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
  v_items bigint;
  v_from_balance bigint;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_ticket FROM "lottery_tickets" WHERE "tenant_id" = v_tenant AND "id" = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(sum("total_cents"), 0) INTO v_items
    FROM "lottery_ticket_items" WHERE "tenant_id" = v_tenant AND "ticket_id" = p_ticket_id;
  IF v_items = 0 OR v_items <> v_ticket."total_cents" THEN
    RAISE EXCEPTION 'ticket total does not match its items' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = v_tenant AND "user_id" = v_ticket."user_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_wallet."balance_jb" + v_wallet."prizes_jb" < v_ticket."total_cents" THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'SJ001';
  END IF;

  v_from_balance := LEAST(v_wallet."balance_jb", v_ticket."total_cents");
  UPDATE "wallets"
     SET "balance_jb" = "balance_jb" - v_from_balance,
         "prizes_jb"  = "prizes_jb" - (v_ticket."total_cents" - v_from_balance),
         "updated_at" = now()
   WHERE "id" = v_wallet."id";

  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "lottery_ticket_id")
  VALUES (v_tenant, v_ticket."user_id", 'LOTTERY_BET', -v_from_balance, -(v_ticket."total_cents" - v_from_balance),
          p_ticket_id);
END;
$$;

REVOKE ALL ON FUNCTION "lottery_debit"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "lottery_debit"(uuid) TO "sysjb_app";

-- Pule sem débito correspondente não chega ao commit.
CREATE FUNCTION "lottery_tickets_require_debit"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "wallet_entries" e
    WHERE e."tenant_id" = NEW."tenant_id" AND e."lottery_ticket_id" = NEW."id"
      AND -(e."balance_jb_delta" + e."prizes_jb_delta") = NEW."total_cents"
  ) THEN
    RAISE EXCEPTION 'lottery ticket without matching debit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "lottery_tickets_debit_required"
  AFTER INSERT ON "lottery_tickets"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "lottery_tickets_require_debit"();

-- Depois do débito, o pule está fechado: nenhum item novo entra nele.
CREATE FUNCTION "lottery_ticket_items_before_debit"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "wallet_entries" e WHERE e."tenant_id" = NEW."tenant_id" AND e."lottery_ticket_id" = NEW."ticket_id"
  ) THEN
    RAISE EXCEPTION 'lottery ticket already debited' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "lottery_ticket_items_open_ticket"
  BEFORE INSERT ON "lottery_ticket_items"
  FOR EACH ROW EXECUTE FUNCTION "lottery_ticket_items_before_debit"();

-- Extração ainda aberta (horário limite no futuro) e dentro da janela de 6 dias. SQLSTATE SJ002.
CREATE FUNCTION "lottery_tickets_draw_open"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF clock_timestamp() >= NEW."closes_at"
     OR NEW."draw_date" > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date + 6 THEN
    RAISE EXCEPTION 'lottery draw closed' USING ERRCODE = 'SJ002';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "lottery_tickets_draw_open"
  BEFORE INSERT ON "lottery_tickets"
  FOR EACH ROW EXECUTE FUNCTION "lottery_tickets_draw_open"();

-- ---------------------------------------------------------------------------
-- Comissões: "sempre do valor apostado" — soma Fazendinha e Loterias.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "commission_month_totals"(p_month date)
RETURNS TABLE (
  "user_id" uuid, "wagered_cents" bigint, "referral_rate_bps" integer, "promoter_rate_bps" integer,
  "amount_cents" bigint, "blocked" boolean
)
  LANGUAGE sql
  STABLE
  AS $$
  WITH bounds AS (
    SELECT (date_trunc('month', p_month)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS start_at,
           ((date_trunc('month', p_month) + interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo') AS end_at
  ),
  rate AS (
    SELECT COALESCE(
      (SELECT s."referral_commission_bps" FROM "tenant_settings" s WHERE s."tenant_id" = "app_current_tenant_id"()),
      0
    ) AS bps
  ),
  bets AS (
    SELECT b."user_id", b."total_cents", b."created_at" FROM "fazendinha_bets" b
    WHERE b."tenant_id" = "app_current_tenant_id"()
    UNION ALL
    SELECT t."user_id", t."total_cents", t."created_at" FROM "lottery_tickets" t
    WHERE t."tenant_id" = "app_current_tenant_id"()
  ),
  wagered AS (
    SELECT bettor."referred_by_user_id" AS referrer, sum(b."total_cents")::bigint AS total
    FROM bets b
    JOIN "users" bettor ON bettor."tenant_id" = "app_current_tenant_id"() AND bettor."id" = b."user_id"
    CROSS JOIN bounds
    WHERE bettor."referred_by_user_id" IS NOT NULL
      AND b."created_at" >= bounds.start_at AND b."created_at" < bounds.end_at
    GROUP BY bettor."referred_by_user_id"
  )
  SELECT r."id", w.total, rate.bps, COALESCE(r."promoter_commission_bps", 0),
         (w.total * (rate.bps + COALESCE(r."promoter_commission_bps", 0)) / 10000)::bigint,
         r."status" = 'BLOCKED'
  FROM wagered w
  JOIN "users" r ON r."tenant_id" = "app_current_tenant_id"() AND r."id" = w.referrer
  CROSS JOIN rate
$$;

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: somente leitura e inclusão.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "lottery_tickets", "lottery_ticket_items" FROM PUBLIC;
GRANT SELECT ON "lottery_tickets", "lottery_ticket_items" TO "sysjb_app";
GRANT INSERT ("tenant_id", "user_id", "purchase_key", "draw_date", "lottery", "draw_hour", "closes_at", "total_cents",
              "quote_table", "created_at") ON "lottery_tickets" TO "sysjb_app";
GRANT USAGE ON SEQUENCE "lottery_tickets_pule_number_seq" TO "sysjb_app";
GRANT INSERT ("tenant_id", "ticket_id", "position", "modality", "placement", "guesses", "amount_cents", "split",
              "total_cents", "quote_cents", "possible_prize_cents") ON "lottery_ticket_items" TO "sysjb_app";
