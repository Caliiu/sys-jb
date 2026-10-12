-- Regras da unidade (jogador), com as colunas criadas na migration quote_tables_unit_settings:
--
-- 1. Comissão da unidade (users.unit_commission_bps): a unidade ganha a % sobre as PRÓPRIAS apostas de Loterias e
--    Fazendinha, igual à comissão de indicação/promotor (migration commission_on_settlement): pendente na aposta, paga
--    no Saldo na apuração do pule, só sobre a parte paga com Saldo e Prêmios (bônus nunca gera comissão), anulada se o
--    pule for cancelado e perdida se a unidade estiver bloqueada na apuração. Vira uma segunda linha em bet_commissions
--    (beneficiary = 'UNIT', user_id = bettor_id); a de quem indicou continua igual (beneficiary = 'REFERRER').
-- 2. Limite diário (users.daily_limit_enabled / daily_limit_cents): o total apostado no dia (Brasília, Loterias +
--    Fazendinha, sem cancelados) não passa do limite. Conferido nos débitos, com a carteira travada (apostas
--    simultâneas da mesma unidade se enfileiram e a segunda já vê a primeira). SQLSTATE novo: SJ022.
-- 3. Reter prêmios (users.retain_prizes): a bolsa de prêmios das loterias (prizes_jb: prêmios de Loterias e
--    Fazendinha) não sai em saque enquanto ligado; os prêmios de games (prizes_games, cassino) continuam sacáveis.
--    Desligar libera tudo (nada fica gravado: a regra vale na hora do pedido). SQLSTATE novo: SJ023.
-- DDL no formato do Prisma; regras e funções na segunda parte.

-- DropIndex
DROP INDEX "bet_commissions_tenant_id_fazendinha_bet_id_key";

-- DropIndex
DROP INDEX "bet_commissions_tenant_id_lottery_ticket_id_key";

-- AlterTable
ALTER TABLE "bet_commissions" ADD COLUMN     "beneficiary" TEXT NOT NULL DEFAULT 'REFERRER',
ADD COLUMN     "unit_cents" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "unit_rate_bps" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "bet_commissions_tenant_id_lottery_ticket_id_beneficiary_key" ON "bet_commissions"("tenant_id", "lottery_ticket_id", "beneficiary");

-- CreateIndex
CREATE UNIQUE INDEX "bet_commissions_tenant_id_fazendinha_bet_id_beneficiary_key" ON "bet_commissions"("tenant_id", "fazendinha_bet_id", "beneficiary");

-- ---------------------------------------------------------------------------
-- Comissões por aposta: no máximo uma de quem indicou e uma da unidade por pule. A de quem indicou nunca é de si mesmo
-- e não tem parte de unidade; a da unidade é do próprio apostador e só tem a parte de unidade.
-- ---------------------------------------------------------------------------
ALTER TABLE "bet_commissions"
  DROP CONSTRAINT "bet_commissions_not_self",
  DROP CONSTRAINT "bet_commissions_rates_range",
  DROP CONSTRAINT "bet_commissions_amounts",
  DROP CONSTRAINT "bet_commissions_reversal",
  ADD CONSTRAINT "bet_commissions_beneficiary" CHECK (
       ("beneficiary" = 'REFERRER' AND "user_id" <> "bettor_id" AND "unit_rate_bps" = 0 AND "unit_cents" = 0)
    OR ("beneficiary" = 'UNIT' AND "user_id" = "bettor_id"
        AND "referral_rate_bps" = 0 AND "promoter_rate_bps" = 0 AND "referral_cents" = 0 AND "promoter_cents" = 0)
  ),
  ADD CONSTRAINT "bet_commissions_rates_range" CHECK (
    "referral_rate_bps" BETWEEN 0 AND 10000 AND "promoter_rate_bps" BETWEEN 0 AND 10000
    AND "unit_rate_bps" BETWEEN 0 AND 10000
  ),
  ADD CONSTRAINT "bet_commissions_amounts" CHECK (
    "wagered_cents" > 0 AND "wagered_cents" <= 9007199254740991
    AND "referral_cents" >= 0 AND "promoter_cents" >= 0 AND "unit_cents" >= 0
    AND "referral_cents" + "promoter_cents" + "unit_cents" > 0
  ),
  ADD CONSTRAINT "bet_commissions_reversal" CHECK (
    ("reversed_at" IS NULL) = ("reversed_cents" IS NULL)
    AND ("reversed_cents" IS NULL OR "reversed_cents" BETWEEN 0 AND "referral_cents" + "promoter_cents" + "unit_cents")
    AND ("reversed_at" IS NULL OR "lottery_ticket_id" IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- Na aposta: registra as comissões pendentes do pule (sem crédito). Chamada pelos débitos com o valor pago com Saldo e
-- Prêmios. Quem indicou (como antes): % de indicação da banca + % de promotor; bloqueado não ganha registro. Unidade:
-- a % dela sobre a própria aposta. Ganho zero não gera registro. Cada parte arredondada para baixo no centavo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "bet_commission_credit"(
  p_tenant uuid, p_bettor uuid, p_wagered bigint, p_lottery_ticket uuid, p_fazendinha_bet uuid
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_bettor "users"%ROWTYPE;
  v_referrer "users"%ROWTYPE;
  v_referral_rate integer;
  v_promoter_rate integer;
  v_referral bigint;
  v_promoter bigint;
  v_unit bigint;
BEGIN
  IF p_wagered <= 0 THEN
    RETURN;
  END IF;
  SELECT * INTO v_bettor FROM "users" WHERE "tenant_id" = p_tenant AND "id" = p_bettor;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Unidade: a própria comissão.
  v_unit := floor(p_wagered::numeric * v_bettor."unit_commission_bps" / 10000)::bigint;
  IF v_unit > 0 THEN
    INSERT INTO "bet_commissions" ("tenant_id", "user_id", "bettor_id", "lottery_ticket_id", "fazendinha_bet_id",
                                   "beneficiary", "wagered_cents", "referral_rate_bps", "promoter_rate_bps",
                                   "referral_cents", "promoter_cents", "unit_rate_bps", "unit_cents")
    VALUES (p_tenant, p_bettor, p_bettor, p_lottery_ticket, p_fazendinha_bet, 'UNIT', p_wagered, 0, 0, 0, 0,
            v_bettor."unit_commission_bps", v_unit);
  END IF;

  -- Quem indicou: igual à versão anterior.
  IF v_bettor."referred_by_user_id" IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v_referrer FROM "users" WHERE "tenant_id" = p_tenant AND "id" = v_bettor."referred_by_user_id";
  IF NOT FOUND OR v_referrer."status" <> 'ACTIVE' THEN
    RETURN;
  END IF;

  SELECT COALESCE((SELECT s."referral_commission_bps" FROM "tenant_settings" s WHERE s."tenant_id" = p_tenant), 0)
    INTO v_referral_rate;
  v_promoter_rate := COALESCE(v_referrer."promoter_commission_bps", 0);
  v_referral := floor(p_wagered::numeric * v_referral_rate / 10000)::bigint;
  v_promoter := floor(p_wagered::numeric * v_promoter_rate / 10000)::bigint;
  IF v_referral + v_promoter = 0 THEN
    RETURN;
  END IF;

  INSERT INTO "bet_commissions" ("tenant_id", "user_id", "bettor_id", "lottery_ticket_id", "fazendinha_bet_id",
                                 "beneficiary", "wagered_cents", "referral_rate_bps", "promoter_rate_bps",
                                 "referral_cents", "promoter_cents")
  VALUES (p_tenant, v_referrer."id", p_bettor, p_lottery_ticket, p_fazendinha_bet, 'REFERRER', p_wagered,
          v_referral_rate, v_promoter_rate, v_referral, v_promoter);
END;
$$;

-- ---------------------------------------------------------------------------
-- Na apuração: paga as comissões pendentes do pule (uma vez só: cada linha fica travada e marcada). Quem recebe e está
-- bloqueado agora não recebe (perdida). Primeiro a da unidade (a carteira do apostador, já travada pelo prêmio), depois a
-- de quem indicou: as travas sempre "para cima" na cadeia de indicação, como antes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "bet_commission_pay"(p_tenant uuid, p_lottery_ticket uuid, p_fazendinha_bet uuid)
RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_commission "bet_commissions"%ROWTYPE;
  v_amount bigint;
BEGIN
  FOR v_commission IN
    SELECT * FROM "bet_commissions"
     WHERE "tenant_id" = p_tenant
       AND (("lottery_ticket_id" = p_lottery_ticket) OR ("fazendinha_bet_id" = p_fazendinha_bet))
     ORDER BY ("beneficiary" = 'UNIT') DESC
       FOR UPDATE
  LOOP
    CONTINUE WHEN v_commission."credited_at" IS NOT NULL OR v_commission."forfeited_at" IS NOT NULL
               OR v_commission."reversed_at" IS NOT NULL;

    IF NOT EXISTS (
      SELECT 1 FROM "users"
       WHERE "tenant_id" = p_tenant AND "id" = v_commission."user_id" AND "status" = 'ACTIVE'
    ) THEN
      UPDATE "bet_commissions" SET "forfeited_at" = now() WHERE "id" = v_commission."id";
      CONTINUE;
    END IF;

    v_amount := v_commission."referral_cents" + v_commission."promoter_cents" + v_commission."unit_cents";
    UPDATE "wallets" SET "balance_jb" = "balance_jb" + v_amount, "updated_at" = now()
     WHERE "tenant_id" = p_tenant AND "user_id" = v_commission."user_id";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
    END IF;
    INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                  "bet_commission_id", "note")
    VALUES (p_tenant, v_commission."user_id", 'COMMISSION', v_amount, 0, v_commission."id",
            CASE WHEN v_commission."beneficiary" = 'UNIT' THEN 'Comissão da unidade' ELSE 'Comissão de aposta' END);
    UPDATE "bet_commissions" SET "credited_at" = now() WHERE "id" = v_commission."id";
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION "bet_commission_pay"(uuid, uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Limite diário da unidade.
--   unit_today_spent: total apostado hoje (Brasília) pelo jogador, Loterias (sem cancelados) + Fazendinha, contando o
--   que já foi gravado nesta transação. SECURITY INVOKER: vale o RLS da banca corrente (a API também usa, no painel e na
--   mensagem de erro).
--   unit_daily_limit_check: uso interno dos débitos, com a carteira já travada; passou do limite = SJ022.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "unit_today_spent"(p_user uuid) RETURNS bigint
  LANGUAGE sql
  SET search_path = public, pg_temp
  AS $$
  WITH today AS (
    SELECT ("brasilia_today"()::timestamp AT TIME ZONE 'America/Sao_Paulo') AS start_at
  )
  SELECT COALESCE((
           SELECT sum(t."total_cents") FROM "lottery_tickets" t, today
            WHERE t."tenant_id" = "app_current_tenant_id"() AND t."user_id" = p_user
              AND t."canceled_at" IS NULL AND t."created_at" >= today.start_at), 0)::bigint
       + COALESCE((
           SELECT sum(b."total_cents") FROM "fazendinha_bets" b, today
            WHERE b."tenant_id" = "app_current_tenant_id"() AND b."user_id" = p_user
              AND b."created_at" >= today.start_at), 0)::bigint
$$;

REVOKE ALL ON FUNCTION "unit_today_spent"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "unit_today_spent"(uuid) TO "sysjb_app";

CREATE FUNCTION "unit_daily_limit_check"(p_tenant uuid, p_user uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_user "users"%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM "users" WHERE "tenant_id" = p_tenant AND "id" = p_user;
  IF FOUND AND v_user."daily_limit_enabled" AND "unit_today_spent"(p_user) > v_user."daily_limit_cents" THEN
    RAISE EXCEPTION 'daily bet limit exceeded' USING ERRCODE = 'SJ022';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION "unit_daily_limit_check"(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Débitos das apostas + limite diário da unidade (depois de travar a carteira e com o pule já gravado). O resto igual
-- à versão anterior (migration deposit_bonus).
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
  PERFORM "unit_daily_limit_check"(v_tenant, v_ticket."user_id");
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
  PERFORM "unit_daily_limit_check"(v_tenant, v_bet."user_id");
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
-- Cancelamento do pule pelo jogador: anula/estorna TODAS as comissões do pule (quem indicou e unidade). Pendente: só
-- deixa de existir; já paga (pules de antes da migration commission_on_settlement): estorno do saldo e depois dos
-- prêmios de quem recebeu. Primeiro a da unidade (carteira do apostador, já travada), depois a de quem indicou. O resto
-- igual à versão anterior (migration cancel_settled_guard).
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
  IF EXISTS (SELECT 1 FROM "pule_settlements" WHERE "tenant_id" = v_tenant AND "lottery_ticket_id" = v_ticket."id") THEN
    RAISE EXCEPTION 'pule already settled' USING ERRCODE = 'SJ002';
  END IF;
  IF v_now >= v_ticket."closes_at" THEN
    RAISE EXCEPTION 'lottery draw closed' USING ERRCODE = 'SJ002';
  END IF;
  IF v_now >= v_ticket."created_at" + interval '5 minutes' THEN
    RAISE EXCEPTION 'cancellation window is over' USING ERRCODE = 'SJ021';
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

  FOR v_commission IN
    SELECT * FROM "bet_commissions"
     WHERE "tenant_id" = v_tenant AND "lottery_ticket_id" = v_ticket."id"
     ORDER BY ("beneficiary" = 'UNIT') DESC
       FOR UPDATE
  LOOP
    IF v_commission."credited_at" IS NULL THEN
      -- Pendente: nada foi pago, a comissão só deixa de existir.
      UPDATE "bet_commissions" SET "reversed_at" = v_now, "reversed_cents" = 0 WHERE "id" = v_commission."id";
      CONTINUE;
    END IF;
    v_amount := v_commission."referral_cents" + v_commission."promoter_cents" + v_commission."unit_cents";
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
  END LOOP;

  RETURN v_ticket."id";
END;
$$;

-- ---------------------------------------------------------------------------
-- Saque + reter prêmios: com users.retain_prizes ligado, a bolsa de prêmios das loterias (prizes_jb) não entra no saque;
-- só os prêmios de games (prizes_games). Pedido que caberia sem a retenção: SJ023 (o jogador vê que está retido); que
-- não caberia nem assim: SJ001, como antes. O resto igual à versão anterior (migration withdrawals).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "pix_withdrawal_request"(
  p_user uuid, p_amount bigint, p_key_type text, p_key_value text, p_idempotency uuid
) RETURNS TABLE ("withdrawal_id" uuid, "created" boolean)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_user "users"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
  v_existing "pix_withdrawals"%ROWTYPE;
  v_settings "tenant_settings"%ROWTYPE;
  v_enabled boolean := true;
  v_min bigint := 1000;
  v_max bigint := 500000;
  v_daily integer := 3;
  v_auto bigint := 20000;
  v_today integer;
  v_jb_free bigint;
  v_from_jb bigint;
  v_from_games bigint;
  v_id uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_user FROM "users" WHERE "tenant_id" = v_tenant AND "id" = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = v_tenant AND "user_id" = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_existing FROM "pix_withdrawals"
   WHERE "tenant_id" = v_tenant AND "user_id" = p_user AND "idempotency_key" = p_idempotency;
  IF FOUND THEN
    IF v_existing."amount_cents" <> p_amount OR v_existing."key_type" <> p_key_type
       OR v_existing."key_value" <> p_key_value THEN
      RAISE EXCEPTION 'idempotency key reused' USING ERRCODE = 'SJ013';
    END IF;
    RETURN QUERY SELECT v_existing."id", false;
    RETURN;
  END IF;

  IF v_user."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'blocked account cannot withdraw' USING ERRCODE = 'SJ019';
  END IF;
  IF p_key_type = 'CPF' AND p_key_value IS DISTINCT FROM v_user."document" THEN
    RAISE EXCEPTION 'cpf key must be the holder' USING ERRCODE = 'SJ018';
  END IF;

  SELECT * INTO v_settings FROM "tenant_settings" WHERE "tenant_id" = v_tenant;
  IF FOUND THEN
    v_enabled := v_settings."withdrawals_enabled";
    v_min := v_settings."withdrawal_min_cents";
    v_max := v_settings."withdrawal_max_cents";
    v_daily := v_settings."withdrawal_daily_count";
    v_auto := v_settings."withdrawal_auto_limit_cents";
  END IF;
  IF NOT v_enabled THEN
    RAISE EXCEPTION 'withdrawals paused' USING ERRCODE = 'SJ014';
  END IF;
  IF p_amount IS NULL OR p_amount < v_min OR p_amount > v_max THEN
    RAISE EXCEPTION 'amount outside the limits' USING ERRCODE = 'SJ015';
  END IF;

  SELECT count(*) INTO v_today FROM "pix_withdrawals" w
   WHERE w."tenant_id" = v_tenant AND w."user_id" = p_user
     AND w."status" NOT IN ('CANCELED', 'REJECTED', 'FAILED')
     AND w."created_at" >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo');
  IF v_today >= v_daily THEN
    RAISE EXCEPTION 'daily withdrawal limit reached' USING ERRCODE = 'SJ016';
  END IF;

  v_jb_free := CASE WHEN v_user."retain_prizes" THEN 0 ELSE v_wallet."prizes_jb" END;
  IF p_amount > v_jb_free + v_wallet."prizes_games" THEN
    IF p_amount <= v_wallet."prizes_jb" + v_wallet."prizes_games" THEN
      RAISE EXCEPTION 'lottery prizes retained' USING ERRCODE = 'SJ023';
    END IF;
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'SJ001';
  END IF;
  v_from_jb := LEAST(v_jb_free, p_amount);
  v_from_games := p_amount - v_from_jb;

  INSERT INTO "pix_withdrawals" ("tenant_id", "user_id", "idempotency_key", "amount_cents", "from_prizes_jb_cents",
                                 "from_prizes_games_cents", "key_type", "key_value", "status", "created_at",
                                 "updated_at")
  VALUES (v_tenant, p_user, p_idempotency, p_amount, v_from_jb, v_from_games, p_key_type, p_key_value,
          CASE WHEN p_amount <= v_auto THEN 'QUEUED' ELSE 'REVIEW' END, now(), now())
  RETURNING "pix_withdrawals"."id" INTO v_id;

  UPDATE "wallets"
     SET "prizes_jb" = "prizes_jb" - v_from_jb, "prizes_games" = "prizes_games" - v_from_games, "updated_at" = now()
   WHERE "id" = v_wallet."id";
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                "prizes_games_delta", "pix_withdrawal_id")
  VALUES (v_tenant, p_user, 'WITHDRAWAL', 0, -v_from_jb, -v_from_games, v_id);

  RETURN QUERY SELECT v_id, true;
END;
$$;
