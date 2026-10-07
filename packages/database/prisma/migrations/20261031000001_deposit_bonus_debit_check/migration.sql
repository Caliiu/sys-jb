-- Bônus de recarga: a conferência "toda aposta tem o débito do total" passa a somar também a parte paga com bônus
-- (o débito agora sai do bônus, do Saldo e dos Prêmios). O resto igual às versões anteriores (migrations fazendinha e
-- lotteries).

CREATE OR REPLACE FUNCTION "fazendinha_bets_require_debit"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "wallet_entries" e
    WHERE e."tenant_id" = NEW."tenant_id"
      AND e."fazendinha_bet_id" = NEW."id"
      AND -(e."balance_jb_delta" + e."prizes_jb_delta" + e."bonus_jb_delta") = NEW."total_cents"
  ) THEN
    RAISE EXCEPTION 'fazendinha bet without matching debit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "lottery_tickets_require_debit"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "wallet_entries" e
    WHERE e."tenant_id" = NEW."tenant_id" AND e."lottery_ticket_id" = NEW."id"
      AND -(e."balance_jb_delta" + e."prizes_jb_delta" + e."bonus_jb_delta") = NEW."total_cents"
  ) THEN
    RAISE EXCEPTION 'lottery ticket without matching debit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
