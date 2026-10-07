-- Fechamento cassino: a comissão paga passa a ir para o saldo de saque (prêmios das loterias, `prizes_jb`), não para o
-- Saldo de apostas. Entra no sacável do promotor (withdrawable = prêmios das loterias + do cassino) e também pode ser
-- apostada, como um prêmio. Nenhum pagamento existia antes desta migration com a regra antiga (feature nova).

ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_casino_commission_rules",
  ADD CONSTRAINT "wallet_entries_casino_commission_rules" CHECK (
    ("kind" = 'CASINO_COMMISSION') = ("casino_commission_payout_id" IS NOT NULL)
    AND ("kind" <> 'CASINO_COMMISSION' OR (
          "prizes_jb_delta" > 0 AND "balance_jb_delta" = 0 AND "bonus_jb_delta" = 0
      AND "balance_games_delta" = 0 AND "prizes_games_delta" = 0
      AND "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "pule_prize_id" IS NULL AND "casino_transaction_id" IS NULL AND "pix_deposit_id" IS NULL
      AND "pix_withdrawal_id" IS NULL))
  );

-- Mesmas regras de antes (Gerente, mês encerrado, uma vez por promotor e mês); só o crédito muda de bolsa.
CREATE OR REPLACE FUNCTION "casino_commission_pay"(p_actor uuid, p_month date, p_user uuid)
RETURNS TABLE ("paid_user_id" uuid, "paid_cents" bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_month date := date_trunc('month', p_month)::date;
  v_payout uuid;
  v_count integer := 0;
  r record;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_month IS NULL OR p_month <> v_month THEN
    RAISE EXCEPTION 'month must be the first day of a month' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM "operator_assert_manager"(p_actor);
  IF v_month >= date_trunc('month', clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'month not finished yet' USING ERRCODE = 'SJ004';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('casino_commission_pay:' || v_tenant::text || ':' || v_month::text, 0));

  FOR r IN
    SELECT m."user_id", m."turnover_cents", m."payout_cents", m."ggr_cents", m."rate_bps", m."amount_cents"
      FROM "casino_commission_month"(v_month) m
     WHERE (p_user IS NULL OR m."user_id" = p_user)
       AND m."active" AND m."amount_cents" > 0
       AND NOT EXISTS (
         SELECT 1 FROM "casino_commission_payouts" c
          WHERE c."tenant_id" = v_tenant AND c."month" = v_month AND c."user_id" = m."user_id")
     ORDER BY m."user_id"
  LOOP
    INSERT INTO "casino_commission_payouts" ("tenant_id", "month", "user_id", "operator_id", "turnover_cents",
                                             "payout_cents", "ggr_cents", "rate_bps", "amount_cents")
    VALUES (v_tenant, v_month, r."user_id", p_actor, r."turnover_cents", r."payout_cents", r."ggr_cents",
            r."rate_bps", r."amount_cents")
    RETURNING "id" INTO v_payout;

    UPDATE "wallets" SET "prizes_jb" = "prizes_jb" + r."amount_cents", "updated_at" = now()
     WHERE "tenant_id" = v_tenant AND "user_id" = r."user_id";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
    END IF;
    INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                  "casino_commission_payout_id", "note")
    VALUES (v_tenant, r."user_id", 'CASINO_COMMISSION', 0, r."amount_cents", v_payout,
            'Comissão de cassino ' || to_char(v_month, 'MM/YYYY'));

    v_count := v_count + 1;
    "paid_user_id" := r."user_id";
    "paid_cents" := r."amount_cents";
    RETURN NEXT;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'nothing to pay' USING ERRCODE = 'SJ020';
  END IF;
END;
$$;

