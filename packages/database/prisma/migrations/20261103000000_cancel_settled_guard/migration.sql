-- Cancelamento do pule: recusa também pule já apurado (SJ002, como venda encerrada). Na prática o prazo de
-- cancelamento termina antes do resultado; isto fecha o caso de um resultado adiantado (erro do provedor ou horário
-- cadastrado errado), em que o jogador receberia o prêmio e a devolução da aposta. O resto igual à versão anterior
-- (migration commission_on_settlement).

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
  -- Já apurado (resultado chegou): não pode mais ser cancelado. A apuração também trava o pule (FOR UPDATE) e recusa
  -- pule cancelado, então os dois nunca valem juntos, nem com resultado adiantado.
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

  SELECT * INTO v_commission FROM "bet_commissions"
   WHERE "tenant_id" = v_tenant AND "lottery_ticket_id" = v_ticket."id"
     FOR UPDATE;
  IF FOUND AND v_commission."credited_at" IS NULL THEN
    -- Pendente: nada foi pago, a comissão só deixa de existir.
    UPDATE "bet_commissions" SET "reversed_at" = v_now, "reversed_cents" = 0 WHERE "id" = v_commission."id";
  ELSIF FOUND THEN
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
