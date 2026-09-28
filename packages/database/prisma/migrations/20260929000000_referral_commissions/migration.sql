-- Indicação ("Indique e ganhe") separada de promotor, % da banca e fechamento mensal de comissões.
-- DDL gerado pelo Prisma; regras, RLS, funções e privilégios na segunda parte.

-- CreateEnum
CREATE TYPE "commission_payout_status" AS ENUM ('PAID', 'BLOCKED', 'ZERO');

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "commission_payout_id" UUID;

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "referral_commission_bps" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "commission_closings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "operator_id" UUID NOT NULL,
    "referral_rate_bps" INTEGER NOT NULL,
    "total_paid_cents" BIGINT NOT NULL,
    "closed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_closings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "closing_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wagered_cents" BIGINT NOT NULL,
    "referral_rate_bps" INTEGER NOT NULL,
    "promoter_rate_bps" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "status" "commission_payout_status" NOT NULL,

    CONSTRAINT "commission_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_closings_tenant_id_id_key" ON "commission_closings"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_closings_tenant_id_month_key" ON "commission_closings"("tenant_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "commission_payouts_tenant_id_id_key" ON "commission_payouts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_payouts_closing_id_user_id_key" ON "commission_payouts"("closing_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_commission_payout_id_key" ON "wallet_entries"("tenant_id", "commission_payout_id");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_commission_payout_id_fkey" FOREIGN KEY ("tenant_id", "commission_payout_id") REFERENCES "commission_payouts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_closings" ADD CONSTRAINT "commission_closings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_closings" ADD CONSTRAINT "commission_closings_tenant_id_operator_id_fkey" FOREIGN KEY ("tenant_id", "operator_id") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_tenant_id_closing_id_fkey" FOREIGN KEY ("tenant_id", "closing_id") REFERENCES "commission_closings"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Indicação: qualquer jogador ATIVO da banca pode indicar (antes, só promotor). O vínculo continua só
-- no cadastro e nunca muda. Se quem indicou é promotor, ele ganha a % de indicação + a dele de promotor.
-- ---------------------------------------------------------------------------
DROP TRIGGER "users_referrer_on_insert" ON "users";
DROP FUNCTION "users_referrer_must_be_active_promoter"();

CREATE FUNCTION "users_referrer_must_be_active"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."referred_by_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "users" r
    WHERE r."tenant_id" = NEW."tenant_id" AND r."id" = NEW."referred_by_user_id" AND r."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'referrer must be an active user' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "users_referrer_on_insert"
  BEFORE INSERT ON "users"
  FOR EACH ROW EXECUTE FUNCTION "users_referrer_must_be_active"();

-- ---------------------------------------------------------------------------
-- Configurações da banca (% do "Indique e ganhe"): 0% a 100%, em centésimos.
-- ---------------------------------------------------------------------------
ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_referral_range" CHECK ("referral_commission_bps" BETWEEN 0 AND 10000);

ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_settings_tenant_isolation" ON "tenant_settings"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Fechamentos e pagamentos: valores coerentes, RLS por banca, somente leitura para a API (só a função
-- commission_close_month grava).
-- ---------------------------------------------------------------------------
ALTER TABLE "commission_closings"
  ADD CONSTRAINT "commission_closings_month_first_day" CHECK ("month" = date_trunc('month', "month")::date),
  ADD CONSTRAINT "commission_closings_rate_range" CHECK ("referral_rate_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "commission_closings_total_range" CHECK ("total_paid_cents" BETWEEN 0 AND 9007199254740991);

ALTER TABLE "commission_payouts"
  ADD CONSTRAINT "commission_payouts_rates_range" CHECK (
    "referral_rate_bps" BETWEEN 0 AND 10000 AND "promoter_rate_bps" BETWEEN 0 AND 10000
  ),
  ADD CONSTRAINT "commission_payouts_amounts_range" CHECK (
    "wagered_cents" > 0 AND "amount_cents" BETWEEN 0 AND 9007199254740991
  ),
  ADD CONSTRAINT "commission_payouts_status_amount" CHECK (
    ("status" = 'PAID' AND "amount_cents" > 0) OR ("status" = 'ZERO' AND "amount_cents" = 0) OR "status" = 'BLOCKED'
  );

ALTER TABLE "commission_closings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_closings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "commission_closings_tenant_isolation" ON "commission_closings"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "commission_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_payouts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "commission_payouts_tenant_isolation" ON "commission_payouts"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Movimentação COMMISSION: crédito no Saldo, ligado a um pagamento do fechamento (um por pagamento).
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind"
    CHECK ("kind" IN ('FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION')),
  ADD CONSTRAINT "wallet_entries_commission_rules" CHECK (
    ("kind" = 'COMMISSION') = ("commission_payout_id" IS NOT NULL)
    AND ("kind" <> 'COMMISSION' OR (
          "fazendinha_bet_id" IS NULL AND "operator_id" IS NULL AND "idempotency_key" IS NULL
      AND "balance_jb_delta" > 0 AND "prizes_jb_delta" = 0 AND "bonus_jb_delta" = 0 AND "balance_games_delta" = 0))
  );

-- As regras antigas por tipo não conheciam COMMISSION: ela passa a ser aceita lá, e as regras dela ficam acima.
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
  );

-- ---------------------------------------------------------------------------
-- Cálculo do mês (prévia e fechamento usam o mesmo): para cada jogador que indicou alguém, a soma do que
-- os indicados apostaram no mês (Brasília, pela data da aposta) e o ganho = apostado x (% indicação + %
-- promotor, se ele for promotor), arredondado para baixo no centavo. Percentuais vigentes no cálculo.
-- SECURITY INVOKER: vale o RLS da banca corrente.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "commission_month_totals"(p_month date)
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
  wagered AS (
    SELECT bettor."referred_by_user_id" AS referrer, sum(b."total_cents")::bigint AS total
    FROM "fazendinha_bets" b
    JOIN "users" bettor ON bettor."tenant_id" = b."tenant_id" AND bettor."id" = b."user_id"
    CROSS JOIN bounds
    WHERE b."tenant_id" = "app_current_tenant_id"()
      AND bettor."referred_by_user_id" IS NOT NULL
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

REVOKE ALL ON FUNCTION "commission_month_totals"(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "commission_month_totals"(date) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Fechamento do mês pelo Gerente: grava o fechamento e cada pagamento e credita o Saldo de quem tem
-- ganho, tudo na mesma transação. Um fechamento por banca e mês (UNIQUE: fechar de novo dá 23505).
-- Só meses já encerrados (Brasília): mês corrente ou futuro dá SQLSTATE SJ004.
-- Quem indicou e está BLOQUEADO não recebe (pagamento BLOCKED). Ganho zero fica como ZERO.
-- Operador conferido de novo aqui: ativo, desta banca, perfil MANAGER (commissions.manage).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "commission_close_month"(p_month date, p_operator_id uuid) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_month date := date_trunc('month', p_month)::date;
  v_rate integer;
  v_closing uuid;
  v_payout uuid;
  v_status "commission_payout_status";
  v_total bigint := 0;
  r record;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_month IS NULL OR p_month <> v_month THEN
    RAISE EXCEPTION 'month must be the first day of a month' USING ERRCODE = 'check_violation';
  END IF;
  IF v_month >= date_trunc('month', clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'month not finished yet' USING ERRCODE = 'SJ004';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "operators" o
    WHERE o."tenant_id" = v_tenant AND o."id" = p_operator_id AND o."active" AND o."role" = 'MANAGER'
  ) THEN
    RAISE EXCEPTION 'operator not allowed to close commissions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE((SELECT s."referral_commission_bps" FROM "tenant_settings" s WHERE s."tenant_id" = v_tenant), 0)
    INTO v_rate;
  INSERT INTO "commission_closings" ("tenant_id", "month", "operator_id", "referral_rate_bps", "total_paid_cents")
  VALUES (v_tenant, v_month, p_operator_id, v_rate, 0)
  RETURNING "id" INTO v_closing;

  FOR r IN SELECT * FROM "commission_month_totals"(v_month) LOOP
    v_status := CASE WHEN r."blocked" THEN 'BLOCKED' WHEN r."amount_cents" = 0 THEN 'ZERO' ELSE 'PAID' END;
    INSERT INTO "commission_payouts" ("tenant_id", "closing_id", "user_id", "wagered_cents", "referral_rate_bps",
                                      "promoter_rate_bps", "amount_cents", "status")
    VALUES (v_tenant, v_closing, r."user_id", r."wagered_cents", r."referral_rate_bps", r."promoter_rate_bps",
            r."amount_cents", v_status)
    RETURNING "id" INTO v_payout;

    IF v_status = 'PAID' THEN
      UPDATE "wallets" SET "balance_jb" = "balance_jb" + r."amount_cents", "updated_at" = now()
       WHERE "tenant_id" = v_tenant AND "user_id" = r."user_id";
      INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                    "commission_payout_id", "note")
      VALUES (v_tenant, r."user_id", 'COMMISSION', r."amount_cents", 0, v_payout,
              'Comissão de ' || to_char(v_month, 'MM/YYYY'));
      v_total := v_total + r."amount_cents";
    END IF;
  END LOOP;

  UPDATE "commission_closings" SET "total_paid_cents" = v_total WHERE "id" = v_closing;
  RETURN v_closing;
END;
$$;

REVOKE ALL ON FUNCTION "commission_close_month"(date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "commission_close_month"(date, uuid) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime
--   tenant_settings: ler e gravar só a % de indicação (o Gerente, pela API, com auditoria).
--   commission_*: somente leitura (a função grava).
-- ---------------------------------------------------------------------------
REVOKE ALL ON "tenant_settings", "commission_closings", "commission_payouts" FROM PUBLIC;
GRANT SELECT ON "tenant_settings" TO "sysjb_app";
GRANT INSERT ("tenant_id", "referral_commission_bps", "updated_at") ON "tenant_settings" TO "sysjb_app";
GRANT UPDATE ("referral_commission_bps", "updated_at") ON "tenant_settings" TO "sysjb_app";
GRANT SELECT ON "commission_closings", "commission_payouts" TO "sysjb_app";
