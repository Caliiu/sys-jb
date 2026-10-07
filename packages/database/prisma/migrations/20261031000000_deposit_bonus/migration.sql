-- Bônus de recarga de Loterias (Configurações > Pagamentos). Três regras por banca, cada uma com % e teto (0% =
-- desligada), e uma recarga mínima:
--   FIRST_DEPOSIT  primeira recarga de Loterias da conta;
--   DAILY          primeira recarga de Loterias do dia (Brasília);
--   FEDERAL        primeira recarga de Loterias do dia, em dia com sorteio da Federal na banca (o sorteio ligado ao
--                  resultado "fd", pelo cadastro de sorteios: vale feriado e sorteio extra).
-- Cada recarga ganha no máximo UM bônus: o de maior valor (empate: primeira recarga > Federal > diária). O bônus entra
-- na bolsa de bônus na mesma transação que credita a recarga (pix_deposit_credit), uma vez só por recarga (UNIQUE).
-- Só recarga de Loterias, paga (a contagem é pela hora do pagamento), de jogador ativo. Recarga em análise só ganha
-- quando o Gerente libera (e conta o dia da liberação).
-- O bônus é gasto PRIMEIRO nas apostas de Loterias e Fazendinha (depois Saldo e Prêmios), nunca no cassino, nunca
-- sacável e não expira. Comissão de indicação/promotor só sobre a parte paga com Saldo e Prêmios. Pule cancelado
-- devolve para as mesmas bolsas, bônus incluído.
-- DDL no formato do Prisma; regras, RLS, funções e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "bonus_daily_bps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonus_daily_max_cents" INTEGER NOT NULL DEFAULT 30000,
ADD COLUMN     "bonus_federal_bps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonus_federal_max_cents" INTEGER NOT NULL DEFAULT 30000,
ADD COLUMN     "bonus_first_bps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonus_first_max_cents" INTEGER NOT NULL DEFAULT 30000,
ADD COLUMN     "deposit_bonus_min_cents" INTEGER NOT NULL DEFAULT 1000;

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "deposit_bonus_id" UUID;

-- CreateTable
CREATE TABLE "deposit_bonuses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pix_deposit_id" UUID NOT NULL,
    "rule" TEXT NOT NULL,
    "deposit_cents" BIGINT NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "max_cents" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deposit_bonuses_tenant_id_created_at_idx" ON "deposit_bonuses"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_bonuses_tenant_id_id_key" ON "deposit_bonuses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_bonuses_tenant_id_pix_deposit_id_key" ON "deposit_bonuses"("tenant_id", "pix_deposit_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_deposit_bonus_id_key" ON "wallet_entries"("tenant_id", "deposit_bonus_id");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_deposit_bonus_id_fkey" FOREIGN KEY ("tenant_id", "deposit_bonus_id") REFERENCES "deposit_bonuses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_bonuses" ADD CONSTRAINT "deposit_bonuses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_bonuses" ADD CONSTRAINT "deposit_bonuses_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_bonuses" ADD CONSTRAINT "deposit_bonuses_tenant_id_pix_deposit_id_fkey" FOREIGN KEY ("tenant_id", "pix_deposit_id") REFERENCES "pix_deposits"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Configuração: % até 100%, teto até R$ 100.000 (regra ligada precisa de teto), recarga mínima de R$ 1 a R$ 100.000.
-- ---------------------------------------------------------------------------
ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_deposit_bonus" CHECK (
        "deposit_bonus_min_cents" BETWEEN 100 AND 10000000
    AND "bonus_first_bps" BETWEEN 0 AND 10000 AND "bonus_first_max_cents" BETWEEN 0 AND 10000000
    AND "bonus_daily_bps" BETWEEN 0 AND 10000 AND "bonus_daily_max_cents" BETWEEN 0 AND 10000000
    AND "bonus_federal_bps" BETWEEN 0 AND 10000 AND "bonus_federal_max_cents" BETWEEN 0 AND 10000000
    AND ("bonus_first_bps" = 0 OR "bonus_first_max_cents" > 0)
    AND ("bonus_daily_bps" = 0 OR "bonus_daily_max_cents" > 0)
    AND ("bonus_federal_bps" = 0 OR "bonus_federal_max_cents" > 0));

-- ---------------------------------------------------------------------------
-- Bônus concedidos: valor = % da recarga, para baixo no centavo, limitado ao teto; sempre > 0. Somente inclusão.
-- ---------------------------------------------------------------------------
ALTER TABLE "deposit_bonuses"
  ADD CONSTRAINT "deposit_bonuses_rule" CHECK ("rule" IN ('FIRST_DEPOSIT', 'DAILY', 'FEDERAL')),
  ADD CONSTRAINT "deposit_bonuses_amounts" CHECK (
        "deposit_cents" > 0 AND "rate_bps" BETWEEN 1 AND 10000 AND "max_cents" > 0
    AND "amount_cents" = LEAST(floor("deposit_cents"::numeric * "rate_bps" / 10000)::bigint, "max_cents"::bigint)
    AND "amount_cents" > 0);

CREATE FUNCTION "deposit_bonuses_append_only"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'deposit bonuses are append-only' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "deposit_bonuses_append_only"
  BEFORE UPDATE OR DELETE ON "deposit_bonuses"
  FOR EACH ROW EXECUTE FUNCTION "deposit_bonuses_append_only"();

ALTER TABLE "deposit_bonuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deposit_bonuses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "deposit_bonuses_tenant_isolation" ON "deposit_bonuses"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Movimentações:
--   DEPOSIT_BONUS: crédito só na bolsa de bônus, ligado a um bônus concedido (um por bônus).
--   LOTTERY_BET / FAZENDINHA_BET passam a poder sair também do bônus; LOTTERY_REFUND devolve para ele.
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN (
    'FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION', 'LOTTERY_BET',
    'LOTTERY_REFUND', 'COMMISSION_REVERSAL', 'PRIZE', 'CASINO', 'DEPOSIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND',
    'CASINO_COMMISSION', 'DEPOSIT_BONUS'
  ));

ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind_rules",
  ADD CONSTRAINT "wallet_entries_kind_rules" CHECK (
       ("kind" = 'FAZENDINHA_BET'
        AND "fazendinha_bet_id" IS NOT NULL AND "operator_id" IS NULL AND "idempotency_key" IS NULL
        AND "balance_jb_delta" <= 0 AND "prizes_jb_delta" <= 0 AND "bonus_jb_delta" <= 0
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
    OR "kind" IN ('COMMISSION', 'COMMISSION_REVERSAL', 'LOTTERY_BET', 'LOTTERY_REFUND', 'PRIZE', 'CASINO', 'DEPOSIT',
                  'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'CASINO_COMMISSION', 'DEPOSIT_BONUS')
  );

ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_lottery_rules",
  ADD CONSTRAINT "wallet_entries_lottery_rules" CHECK (
    ("kind" IN ('LOTTERY_BET', 'LOTTERY_REFUND')) = ("lottery_ticket_id" IS NOT NULL)
    AND ("kind" NOT IN ('LOTTERY_BET', 'LOTTERY_REFUND') OR (
          "fazendinha_bet_id" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "operator_id" IS NULL AND "idempotency_key" IS NULL AND "balance_games_delta" = 0))
    AND ("kind" <> 'LOTTERY_BET' OR (
          "balance_jb_delta" <= 0 AND "prizes_jb_delta" <= 0 AND "bonus_jb_delta" <= 0
      AND ("balance_jb_delta" + "prizes_jb_delta" + "bonus_jb_delta") < 0))
    AND ("kind" <> 'LOTTERY_REFUND' OR (
          "balance_jb_delta" >= 0 AND "prizes_jb_delta" >= 0 AND "bonus_jb_delta" >= 0
      AND ("balance_jb_delta" + "prizes_jb_delta" + "bonus_jb_delta") > 0))
  );

ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_deposit_bonus_rules" CHECK (
    ("kind" = 'DEPOSIT_BONUS') = ("deposit_bonus_id" IS NOT NULL)
    AND ("kind" <> 'DEPOSIT_BONUS' OR (
          "bonus_jb_delta" > 0 AND "balance_jb_delta" = 0 AND "prizes_jb_delta" = 0
      AND "balance_games_delta" = 0 AND "prizes_games_delta" = 0
      AND "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "pule_prize_id" IS NULL AND "casino_transaction_id" IS NULL AND "pix_deposit_id" IS NULL
      AND "pix_withdrawal_id" IS NULL AND "casino_commission_payout_id" IS NULL))
  );

-- ---------------------------------------------------------------------------
-- Configuração pelo painel: só Gerente ativo da banca (os limites são conferidos pelo CHECK acima).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "deposit_bonus_settings_save"(
  p_actor uuid, p_min integer, p_first_bps integer, p_first_max integer, p_daily_bps integer, p_daily_max integer,
  p_federal_bps integer, p_federal_max integer
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  INSERT INTO "tenant_settings" ("tenant_id", "deposit_bonus_min_cents", "bonus_first_bps", "bonus_first_max_cents",
                                 "bonus_daily_bps", "bonus_daily_max_cents", "bonus_federal_bps",
                                 "bonus_federal_max_cents", "updated_at")
  VALUES ("app_current_tenant_id"(), p_min, p_first_bps, p_first_max, p_daily_bps, p_daily_max, p_federal_bps,
          p_federal_max, now())
  ON CONFLICT ("tenant_id") DO UPDATE
    SET "deposit_bonus_min_cents" = EXCLUDED."deposit_bonus_min_cents",
        "bonus_first_bps" = EXCLUDED."bonus_first_bps",
        "bonus_first_max_cents" = EXCLUDED."bonus_first_max_cents",
        "bonus_daily_bps" = EXCLUDED."bonus_daily_bps",
        "bonus_daily_max_cents" = EXCLUDED."bonus_daily_max_cents",
        "bonus_federal_bps" = EXCLUDED."bonus_federal_bps",
        "bonus_federal_max_cents" = EXCLUDED."bonus_federal_max_cents",
        "updated_at" = now();
END;
$$;

REVOKE ALL ON FUNCTION "deposit_bonus_settings_save"(uuid, integer, integer, integer, integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "deposit_bonus_settings_save"(uuid, integer, integer, integer, integer, integer, integer, integer) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Regras que valem AGORA para a próxima recarga de Loterias do jogador na banca corrente (sem contar p_exclude, a
-- recarga sendo creditada). A mesma função decide a concessão e a oferta mostrada na tela de recarga. Não confere a
-- recarga mínima nem calcula o valor (depende da recarga). SECURITY INVOKER: vale o RLS da banca corrente.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "deposit_bonus_rules"(p_user uuid, p_exclude uuid)
RETURNS TABLE ("rule" text, "rate_bps" integer, "max_cents" integer, "priority" integer)
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
  AS $$
  WITH s AS (
    SELECT * FROM "tenant_settings" WHERE "tenant_id" = "app_current_tenant_id"()
  ),
  today AS (
    SELECT ("brasilia_today"()::timestamp AT TIME ZONE 'America/Sao_Paulo') AS start_at
  ),
  paid AS (
    SELECT
      EXISTS (
        SELECT 1 FROM "pix_deposits" d
        WHERE d."tenant_id" = "app_current_tenant_id"() AND d."user_id" = p_user AND d."status" = 'PAID'
          AND d."destination" = 'LOTTERIES' AND d."id" IS DISTINCT FROM p_exclude
      ) AS ever,
      EXISTS (
        SELECT 1 FROM "pix_deposits" d CROSS JOIN today
        WHERE d."tenant_id" = "app_current_tenant_id"() AND d."user_id" = p_user AND d."status" = 'PAID'
          AND d."destination" = 'LOTTERIES' AND d."id" IS DISTINCT FROM p_exclude
          AND d."paid_at" >= today.start_at
      ) AS today
  ),
  federal AS (
    SELECT EXISTS (
      SELECT 1 FROM "draws" dr
      WHERE dr."tenant_id" = "app_current_tenant_id"() AND dr."result_lottery" = 'fd'
        AND "draw_runs_on"(dr, "brasilia_today"())
    ) AS today
  )
  SELECT 'FIRST_DEPOSIT', s."bonus_first_bps", s."bonus_first_max_cents", 1
    FROM s, paid WHERE s."bonus_first_bps" > 0 AND NOT paid.ever
  UNION ALL
  SELECT 'FEDERAL', s."bonus_federal_bps", s."bonus_federal_max_cents", 2
    FROM s, paid, federal WHERE s."bonus_federal_bps" > 0 AND NOT paid.today AND federal.today
  UNION ALL
  SELECT 'DAILY', s."bonus_daily_bps", s."bonus_daily_max_cents", 3
    FROM s, paid WHERE s."bonus_daily_bps" > 0 AND NOT paid.today
$$;

REVOKE ALL ON FUNCTION "deposit_bonus_rules"(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "deposit_bonus_rules"(uuid, uuid) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Concessão do bônus de uma recarga que acabou de ser creditada (carteira já travada por quem chama). Uso interno de
-- pix_deposit_credit; a role de runtime não executa. Só o maior bônus entre as regras que valem.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "deposit_bonus_grant"(p_tenant uuid, p_deposit uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_deposit "pix_deposits"%ROWTYPE;
  v_min integer;
  v_best record;
  v_bonus uuid;
BEGIN
  SELECT * INTO v_deposit FROM "pix_deposits" WHERE "tenant_id" = p_tenant AND "id" = p_deposit;
  IF NOT FOUND OR v_deposit."destination" <> 'LOTTERIES' OR v_deposit."status" <> 'PAID' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "users" WHERE "tenant_id" = p_tenant AND "id" = v_deposit."user_id" AND "status" = 'ACTIVE'
  ) THEN
    RETURN;
  END IF;
  SELECT "deposit_bonus_min_cents" INTO v_min FROM "tenant_settings" WHERE "tenant_id" = p_tenant;
  IF v_min IS NULL OR v_deposit."amount_cents" < v_min THEN
    RETURN;
  END IF;

  SELECT r."rule", r."rate_bps", r."max_cents",
         LEAST(floor(v_deposit."amount_cents"::numeric * r."rate_bps" / 10000)::bigint, r."max_cents"::bigint) AS amount
    INTO v_best
    FROM "deposit_bonus_rules"(v_deposit."user_id", v_deposit."id") r
   ORDER BY 4 DESC, r."priority"
   LIMIT 1;
  IF NOT FOUND OR v_best.amount <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO "deposit_bonuses" ("tenant_id", "user_id", "pix_deposit_id", "rule", "deposit_cents", "rate_bps",
                                 "max_cents", "amount_cents")
  VALUES (p_tenant, v_deposit."user_id", v_deposit."id", v_best."rule", v_deposit."amount_cents", v_best."rate_bps",
          v_best."max_cents", v_best.amount)
  RETURNING "id" INTO v_bonus;

  UPDATE "wallets" SET "bonus_jb" = "bonus_jb" + v_best.amount, "updated_at" = now()
   WHERE "tenant_id" = p_tenant AND "user_id" = v_deposit."user_id";
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "bonus_jb_delta",
                                "deposit_bonus_id", "note")
  VALUES (p_tenant, v_deposit."user_id", 'DEPOSIT_BONUS', 0, 0, v_best.amount, v_bonus, 'Bônus de recarga');
END;
$$;

REVOKE ALL ON FUNCTION "deposit_bonus_grant"(uuid, uuid) FROM PUBLIC;

-- Crédito do depósito + bônus (o resto igual à versão anterior, migration deposit_payer).
CREATE OR REPLACE FUNCTION "pix_deposit_credit"(p_tenant uuid, p_deposit uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_deposit "pix_deposits"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
  v_jb bigint := 0;
  v_games bigint := 0;
BEGIN
  SELECT * INTO v_deposit FROM "pix_deposits" WHERE "tenant_id" = p_tenant AND "id" = p_deposit;
  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = p_tenant AND "user_id" = v_deposit."user_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_deposit."destination" = 'GAMES' THEN
    v_games := v_deposit."amount_cents";
  ELSE
    v_jb := v_deposit."amount_cents";
  END IF;
  UPDATE "pix_deposits" SET "status" = 'PAID', "paid_at" = now(), "updated_at" = now() WHERE "id" = v_deposit."id";
  UPDATE "wallets"
     SET "balance_jb" = "balance_jb" + v_jb, "balance_games" = "balance_games" + v_games, "updated_at" = now()
   WHERE "id" = v_wallet."id";
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                "balance_games_delta", "pix_deposit_id")
  VALUES (p_tenant, v_deposit."user_id", 'DEPOSIT', v_jb, 0, v_games, v_deposit."id");
  -- Com a carteira travada: duas recargas confirmadas ao mesmo tempo se enfileiram e a segunda já vê a primeira paga.
  PERFORM "deposit_bonus_grant"(p_tenant, v_deposit."id");
END;
$$;

-- ---------------------------------------------------------------------------
-- Débitos das apostas: bônus primeiro, depois Saldo, depois Prêmios. A comissão de quem indicou é só sobre a parte paga
-- com Saldo e Prêmios (o bônus é dinheiro da banca). O resto igual à versão anterior (migration bet_commissions).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "lottery_debit"(p_ticket_id uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_ticket "lottery_tickets"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
  v_items bigint;
  v_from_bonus bigint;
  v_from_balance bigint;
  v_from_prizes bigint;
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
  IF v_wallet."bonus_jb" + v_wallet."balance_jb" + v_wallet."prizes_jb" < v_ticket."total_cents" THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'SJ001';
  END IF;

  v_from_bonus := LEAST(v_wallet."bonus_jb", v_ticket."total_cents");
  v_from_balance := LEAST(v_wallet."balance_jb", v_ticket."total_cents" - v_from_bonus);
  v_from_prizes := v_ticket."total_cents" - v_from_bonus - v_from_balance;
  UPDATE "wallets"
     SET "bonus_jb"   = "bonus_jb" - v_from_bonus,
         "balance_jb" = "balance_jb" - v_from_balance,
         "prizes_jb"  = "prizes_jb" - v_from_prizes,
         "updated_at" = now()
   WHERE "id" = v_wallet."id";

  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "bonus_jb_delta",
                                "lottery_ticket_id")
  VALUES (v_tenant, v_ticket."user_id", 'LOTTERY_BET', -v_from_balance, -v_from_prizes, -v_from_bonus, p_ticket_id);

  PERFORM "bet_commission_credit"(v_tenant, v_ticket."user_id", v_from_balance + v_from_prizes, p_ticket_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION "fazendinha_debit"(p_bet_id uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_bet "fazendinha_bets"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
  v_count bigint;
  v_from_bonus bigint;
  v_from_balance bigint;
  v_from_prizes bigint;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_bet FROM "fazendinha_bets" WHERE "tenant_id" = v_tenant AND "id" = p_bet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bet not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT count(*) INTO v_count FROM "fazendinha_bet_numbers" WHERE "tenant_id" = v_tenant AND "bet_id" = p_bet_id;
  IF v_count = 0 OR v_bet."total_cents" <> v_bet."stake_cents"::bigint * v_count THEN
    RAISE EXCEPTION 'bet total does not match its numbers' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = v_tenant AND "user_id" = v_bet."user_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_wallet."bonus_jb" + v_wallet."balance_jb" + v_wallet."prizes_jb" < v_bet."total_cents" THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'SJ001';
  END IF;

  v_from_bonus := LEAST(v_wallet."bonus_jb", v_bet."total_cents");
  v_from_balance := LEAST(v_wallet."balance_jb", v_bet."total_cents" - v_from_bonus);
  v_from_prizes := v_bet."total_cents" - v_from_bonus - v_from_balance;
  UPDATE "wallets"
     SET "bonus_jb"   = "bonus_jb" - v_from_bonus,
         "balance_jb" = "balance_jb" - v_from_balance,
         "prizes_jb"  = "prizes_jb" - v_from_prizes,
         "updated_at" = now()
   WHERE "id" = v_wallet."id";

  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "bonus_jb_delta",
                                "fazendinha_bet_id")
  VALUES (v_tenant, v_bet."user_id", 'FAZENDINHA_BET', -v_from_balance, -v_from_prizes, -v_from_bonus, p_bet_id);

  PERFORM "bet_commission_credit"(v_tenant, v_bet."user_id", v_from_balance + v_from_prizes, NULL, p_bet_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancelamento do pule: devolve também o bônus usado (mesmas bolsas do débito). O resto igual à versão anterior.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "lottery_cancel"(p_pule_number integer, p_user_id uuid) RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_now timestamptz := clock_timestamp();
  v_ticket "lottery_tickets"%ROWTYPE;
  v_debit "wallet_entries"%ROWTYPE;
  v_commission "bet_commissions"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
  v_amount bigint;
  v_from_balance bigint;
  v_from_prizes bigint;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_ticket FROM "lottery_tickets"
   WHERE "tenant_id" = v_tenant AND "pule_number" = p_pule_number AND "user_id" = p_user_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_ticket."canceled_at" IS NOT NULL THEN
    RAISE EXCEPTION 'ticket already canceled' USING ERRCODE = 'SJ005';
  END IF;
  IF v_now >= v_ticket."closes_at" THEN
    RAISE EXCEPTION 'lottery draw closed' USING ERRCODE = 'SJ002';
  END IF;

  SELECT * INTO v_debit FROM "wallet_entries"
   WHERE "tenant_id" = v_tenant AND "lottery_ticket_id" = v_ticket."id" AND "kind" = 'LOTTERY_BET';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket debit not found' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1 FROM "wallets" WHERE "tenant_id" = v_tenant AND "user_id" = v_ticket."user_id" FOR UPDATE;
  UPDATE "wallets"
     SET "balance_jb" = "balance_jb" - v_debit."balance_jb_delta",
         "prizes_jb"  = "prizes_jb" - v_debit."prizes_jb_delta",
         "bonus_jb"   = "bonus_jb" - v_debit."bonus_jb_delta",
         "updated_at" = now()
   WHERE "tenant_id" = v_tenant AND "user_id" = v_ticket."user_id";
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "bonus_jb_delta",
                                "lottery_ticket_id", "note")
  VALUES (v_tenant, v_ticket."user_id", 'LOTTERY_REFUND', -v_debit."balance_jb_delta", -v_debit."prizes_jb_delta",
          -v_debit."bonus_jb_delta", v_ticket."id", 'Pule cancelado');

  UPDATE "lottery_tickets" SET "canceled_at" = v_now WHERE "tenant_id" = v_tenant AND "id" = v_ticket."id";

  SELECT * INTO v_commission FROM "bet_commissions"
   WHERE "tenant_id" = v_tenant AND "lottery_ticket_id" = v_ticket."id"
     FOR UPDATE;
  IF FOUND THEN
    v_amount := v_commission."referral_cents" + v_commission."promoter_cents";
    SELECT * INTO v_wallet FROM "wallets"
     WHERE "tenant_id" = v_tenant AND "user_id" = v_commission."user_id"
       FOR UPDATE;
    v_from_balance := LEAST(v_wallet."balance_jb", v_amount);
    v_from_prizes := LEAST(v_wallet."prizes_jb", v_amount - v_from_balance);
    IF v_from_balance + v_from_prizes > 0 THEN
      UPDATE "wallets"
         SET "balance_jb" = "balance_jb" - v_from_balance,
             "prizes_jb"  = "prizes_jb" - v_from_prizes,
             "updated_at" = now()
       WHERE "id" = v_wallet."id";
      INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                    "bet_commission_id", "note")
      VALUES (v_tenant, v_commission."user_id", 'COMMISSION_REVERSAL', -v_from_balance, -v_from_prizes,
              v_commission."id", 'Estorno de comissão (pule cancelado)');
    END IF;
    UPDATE "bet_commissions" SET "reversed_at" = v_now, "reversed_cents" = v_from_balance + v_from_prizes
     WHERE "id" = v_commission."id";
  END IF;

  RETURN v_ticket."id";
END;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: só lê os bônus concedidos (grava só a função de concessão).
-- ---------------------------------------------------------------------------
REVOKE ALL ON "deposit_bonuses" FROM PUBLIC;
GRANT SELECT ON "deposit_bonuses" TO "sysjb_app";
