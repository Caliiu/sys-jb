-- 1. Carteira conciliada com o registro de movimentações (wallet_entries): o banco recusa o commit de
--    qualquer saldo (balance_jb, prizes_jb, bonus_jb) diferente da soma das movimentações. Ajuste manual
--    só pela função wallet_manual_adjust (credencial de migração/scripts), sempre com motivo.
-- 2. Fechamento da Fazendinha: o banco recusa pule de extração que fecha em menos de 5 minutos
--    (FAZENDINHA_CLOSE_MINUTES em @sysjb/contracts) ou além da janela de 6 dias.

-- ---------------------------------------------------------------------------
-- Movimentações: bolsa de bônus, motivo e novos tipos
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  ADD COLUMN "bonus_jb_delta" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "note" TEXT;

ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  DROP CONSTRAINT "wallet_entries_fazendinha_debit",
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN ('FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPENING_BALANCE')),
  ADD CONSTRAINT "wallet_entries_kind_rules" CHECK (
       ("kind" = 'FAZENDINHA_BET'
        AND "fazendinha_bet_id" IS NOT NULL
        AND "balance_jb_delta" <= 0 AND "prizes_jb_delta" <= 0 AND "bonus_jb_delta" = 0)
    OR ("kind" = 'MANUAL_ADJUSTMENT'
        AND "fazendinha_bet_id" IS NULL
        AND "note" IS NOT NULL AND char_length(btrim("note")) BETWEEN 3 AND 200
        AND ("balance_jb_delta" <> 0 OR "prizes_jb_delta" <> 0 OR "bonus_jb_delta" <> 0))
    OR ("kind" = 'OPENING_BALANCE' AND "fazendinha_bet_id" IS NULL)
  );

-- ---------------------------------------------------------------------------
-- Saldo de abertura: carteiras que já tinham valores fora do registro (ex.: crédito manual feito antes
-- desta migration) ganham uma movimentação que os explica. O RLS forçado é suspenso só aqui, para a dona
-- enxergar todas as bancas; é restaurado logo abaixo.
-- ---------------------------------------------------------------------------
ALTER TABLE "wallets" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "wallet_entries" NO FORCE ROW LEVEL SECURITY;

INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "bonus_jb_delta", "note")
SELECT w."tenant_id", w."user_id", 'OPENING_BALANCE',
       w."balance_jb" - COALESCE(s.b, 0), w."prizes_jb" - COALESCE(s.p, 0), w."bonus_jb" - COALESCE(s.bo, 0),
       'Saldo anterior ao registro de movimentações'
FROM "wallets" w
LEFT JOIN (
  SELECT "tenant_id", "user_id",
         sum("balance_jb_delta") AS b, sum("prizes_jb_delta") AS p, sum("bonus_jb_delta") AS bo
  FROM "wallet_entries" GROUP BY "tenant_id", "user_id"
) s ON s."tenant_id" = w."tenant_id" AND s."user_id" = w."user_id"
WHERE w."balance_jb" <> COALESCE(s.b, 0) OR w."prizes_jb" <> COALESCE(s.p, 0) OR w."bonus_jb" <> COALESCE(s.bo, 0);

ALTER TABLE "wallets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "wallet_entries" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Conciliação: ao fim de toda transação que muda carteira ou registra movimentação, saldo = soma das
-- movimentações, em cada bolsa. Trigger adiado: débito e registro podem vir em qualquer ordem na transação.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "wallets_ledger_reconciled"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_wallet "wallets"%ROWTYPE;
  v_balance bigint;
  v_prizes bigint;
  v_bonus bigint;
BEGIN
  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = NEW."tenant_id" AND "user_id" = NEW."user_id";
  SELECT COALESCE(sum("balance_jb_delta"), 0), COALESCE(sum("prizes_jb_delta"), 0), COALESCE(sum("bonus_jb_delta"), 0)
    INTO v_balance, v_prizes, v_bonus
    FROM "wallet_entries" WHERE "tenant_id" = NEW."tenant_id" AND "user_id" = NEW."user_id";
  IF v_wallet."balance_jb" <> v_balance OR v_wallet."prizes_jb" <> v_prizes OR v_wallet."bonus_jb" <> v_bonus THEN
    RAISE EXCEPTION 'wallet out of sync with its entries' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "wallets_ledger_reconciled"
  AFTER UPDATE ON "wallets"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "wallets_ledger_reconciled"();

CREATE CONSTRAINT TRIGGER "wallet_entries_ledger_reconciled"
  AFTER INSERT ON "wallet_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "wallets_ledger_reconciled"();

-- Bolsas de games ainda não têm movimentação: não mudam.
CREATE FUNCTION "wallets_games_frozen"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."balance_games" <> OLD."balance_games" OR NEW."bonus_games" <> OLD."bonus_games"
     OR NEW."prizes_games" <> OLD."prizes_games" THEN
    RAISE EXCEPTION 'games balances have no movements yet' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "wallets_games_frozen"
  BEFORE UPDATE ON "wallets"
  FOR EACH ROW EXECUTE FUNCTION "wallets_games_frozen"();

-- Registro somente inclusão, inclusive para a dona das tabelas (TRUNCATE dos testes não dispara isto).
CREATE FUNCTION "wallet_entries_append_only"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'wallet entries are append-only' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "wallet_entries_append_only"
  BEFORE UPDATE OR DELETE ON "wallet_entries"
  FOR EACH ROW EXECUTE FUNCTION "wallet_entries_append_only"();

-- ---------------------------------------------------------------------------
-- Ajuste manual (crédito ou estorno) com motivo. SECURITY INVOKER e sem GRANT para a role de runtime:
-- só quem já pode alterar wallets (a credencial de migração, via script) consegue usar.
-- Uso: SELECT set_config('app.tenant_id', <banca>, true); SELECT wallet_manual_adjust(<usuário>, 100000, 0, 0, 'motivo');
-- ---------------------------------------------------------------------------
CREATE FUNCTION "wallet_manual_adjust"(
  p_user_id uuid, p_balance_jb bigint, p_prizes_jb bigint, p_bonus_jb bigint, p_note text
) RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE "wallets"
     SET "balance_jb" = "balance_jb" + p_balance_jb,
         "prizes_jb"  = "prizes_jb" + p_prizes_jb,
         "bonus_jb"   = "bonus_jb" + p_bonus_jb,
         "updated_at" = now()
   WHERE "tenant_id" = v_tenant AND "user_id" = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "bonus_jb_delta", "note")
  VALUES (v_tenant, p_user_id, 'MANUAL_ADJUSTMENT', p_balance_jb, p_prizes_jb, p_bonus_jb, btrim(p_note));
END;
$$;

REVOKE ALL ON FUNCTION "wallet_manual_adjust"(uuid, bigint, bigint, bigint, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Fechamento da extração (segunda linha de defesa; a API confere antes). Horário de Brasília.
-- SQLSTATE SJ002: a API traduz para DRAW_CLOSED.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "fazendinha_bets_draw_open"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_draw timestamptz := (NEW."draw_date" + make_interval(hours => NEW."draw_hour")) AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  IF clock_timestamp() >= v_draw - interval '5 minutes'
     OR NEW."draw_date" > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date + 6 THEN
    RAISE EXCEPTION 'fazendinha draw closed' USING ERRCODE = 'SJ002';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "fazendinha_bets_draw_open"
  BEFORE INSERT ON "fazendinha_bets"
  FOR EACH ROW EXECUTE FUNCTION "fazendinha_bets_draw_open"();
