-- Crédito de carteira pelo painel administrativo (Adicionar Saldo, Bônus ou Disponível em Games).
-- O saldo de games (balance_games) passa a ter movimentação: entra no registro e na conciliação.
-- A role de runtime continua SEM UPDATE em wallets: o crédito só existe pela função wallet_operator_credit.

-- AlterTable (DDL gerado pelo Prisma)
ALTER TABLE "wallet_entries" ADD COLUMN     "balance_games_delta" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "idempotency_key" UUID,
ADD COLUMN     "operator_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_idempotency_key_key" ON "wallet_entries"("tenant_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_operator_id_fkey" FOREIGN KEY ("tenant_id", "operator_id") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Regras por tipo de movimentação
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  DROP CONSTRAINT "wallet_entries_kind_rules",
  ADD CONSTRAINT "wallet_entries_kind"
    CHECK ("kind" IN ('FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE')),
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
    -- Crédito pelo painel: um único valor positivo, em saldo, bônus ou games; nunca em prêmios.
    OR ("kind" = 'OPERATOR_CREDIT'
        AND "fazendinha_bet_id" IS NULL AND "operator_id" IS NOT NULL AND "idempotency_key" IS NOT NULL
        AND "note" IS NOT NULL AND char_length(btrim("note")) BETWEEN 3 AND 200
        AND "prizes_jb_delta" = 0
        AND "balance_jb_delta" >= 0 AND "bonus_jb_delta" >= 0 AND "balance_games_delta" >= 0
        AND (("balance_jb_delta" > 0)::int + ("bonus_jb_delta" > 0)::int + ("balance_games_delta" > 0)::int) = 1)
    OR ("kind" = 'OPENING_BALANCE' AND "fazendinha_bet_id" IS NULL AND "operator_id" IS NULL)
  );

-- ---------------------------------------------------------------------------
-- Saldo de abertura de games (valores que existiam antes de entrarem no registro). RLS forçado suspenso
-- só aqui, para a dona enxergar todas as bancas.
-- ---------------------------------------------------------------------------
ALTER TABLE "wallets" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "wallet_entries" NO FORCE ROW LEVEL SECURITY;

INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "balance_games_delta", "note")
SELECT w."tenant_id", w."user_id", 'OPENING_BALANCE', 0, 0, w."balance_games" - COALESCE(s.g, 0),
       'Saldo de games anterior ao registro de movimentações'
FROM "wallets" w
LEFT JOIN (
  SELECT "tenant_id", "user_id", sum("balance_games_delta") AS g FROM "wallet_entries" GROUP BY "tenant_id", "user_id"
) s ON s."tenant_id" = w."tenant_id" AND s."user_id" = w."user_id"
WHERE w."balance_games" <> COALESCE(s.g, 0);

ALTER TABLE "wallets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "wallet_entries" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Conciliação agora inclui o saldo de games. Bônus e prêmios de games seguem sem movimentação (travados).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "wallets_ledger_reconciled"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_wallet "wallets"%ROWTYPE;
  v_balance bigint;
  v_prizes bigint;
  v_bonus bigint;
  v_games bigint;
BEGIN
  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = NEW."tenant_id" AND "user_id" = NEW."user_id";
  SELECT COALESCE(sum("balance_jb_delta"), 0), COALESCE(sum("prizes_jb_delta"), 0),
         COALESCE(sum("bonus_jb_delta"), 0), COALESCE(sum("balance_games_delta"), 0)
    INTO v_balance, v_prizes, v_bonus, v_games
    FROM "wallet_entries" WHERE "tenant_id" = NEW."tenant_id" AND "user_id" = NEW."user_id";
  IF v_wallet."balance_jb" <> v_balance OR v_wallet."prizes_jb" <> v_prizes
     OR v_wallet."bonus_jb" <> v_bonus OR v_wallet."balance_games" <> v_games THEN
    RAISE EXCEPTION 'wallet out of sync with its entries' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "wallets_games_frozen"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."bonus_games" <> OLD."bonus_games" OR NEW."prizes_games" <> OLD."prizes_games" THEN
    RAISE EXCEPTION 'games bonus and prizes have no movements yet' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Crédito pelo painel. SECURITY DEFINER (a role de runtime não tem UPDATE em wallets), sujeita ao RLS da
-- banca corrente. Confere de novo, no banco: operador ativo desta banca com perfil MANAGER (o único com a
-- permissão wallet.adjust em ROLE_PERMISSIONS — mudar lá exige migration), valor de R$ 0,01 a
-- R$ 100.000,00, bolsa válida e motivo.
-- Idempotente pela chave: a mesma chave com o mesmo crédito devolve false (nada novo); com outro crédito,
-- SQLSTATE SJ003 (a API traduz para 409).
-- Retorna true quando creditou agora.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "wallet_operator_credit"(
  p_user_id uuid, p_operator_id uuid, p_bucket text, p_amount bigint, p_note text, p_idempotency_key uuid
) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_balance bigint := CASE WHEN p_bucket = 'balance' THEN p_amount ELSE 0 END;
  v_bonus bigint := CASE WHEN p_bucket = 'bonus' THEN p_amount ELSE 0 END;
  v_games bigint := CASE WHEN p_bucket = 'games' THEN p_amount ELSE 0 END;
  v_existing "wallet_entries"%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_bucket IS NULL OR p_bucket NOT IN ('balance', 'bonus', 'games') THEN
    RAISE EXCEPTION 'invalid bucket' USING ERRCODE = 'check_violation';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 10000000 THEN
    RAISE EXCEPTION 'invalid amount' USING ERRCODE = 'check_violation';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency key required' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "operators" o
    WHERE o."tenant_id" = v_tenant AND o."id" = p_operator_id AND o."active" AND o."role" = 'MANAGER'
  ) THEN
    RAISE EXCEPTION 'operator not allowed to credit wallets' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_existing FROM "wallet_entries" WHERE "tenant_id" = v_tenant AND "idempotency_key" = p_idempotency_key;
  IF FOUND THEN
    IF v_existing."kind" <> 'OPERATOR_CREDIT' OR v_existing."user_id" <> p_user_id
       OR v_existing."operator_id" <> p_operator_id OR v_existing."balance_jb_delta" <> v_balance
       OR v_existing."bonus_jb_delta" <> v_bonus OR v_existing."balance_games_delta" <> v_games THEN
      RAISE EXCEPTION 'idempotency key reused for another credit' USING ERRCODE = 'SJ003';
    END IF;
    RETURN false;
  END IF;

  UPDATE "wallets"
     SET "balance_jb" = "balance_jb" + v_balance,
         "bonus_jb" = "bonus_jb" + v_bonus,
         "balance_games" = "balance_games" + v_games,
         "updated_at" = now()
   WHERE "tenant_id" = v_tenant AND "user_id" = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "bonus_jb_delta",
                                "balance_games_delta", "note", "operator_id", "idempotency_key")
  VALUES (v_tenant, p_user_id, 'OPERATOR_CREDIT', v_balance, 0, v_bonus, v_games, btrim(p_note), p_operator_id,
          p_idempotency_key);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION "wallet_operator_credit"(uuid, uuid, text, bigint, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "wallet_operator_credit"(uuid, uuid, text, bigint, text, uuid) TO "sysjb_app";
