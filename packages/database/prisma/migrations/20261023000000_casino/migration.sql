-- Cassino (PlayFivers): catálogo de jogos (global, sincronizado pela API), rodadas recebidas pelo webhook do provedor e a
-- carteira de games com movimentação de verdade. O saldo do cassino é o Disponível Games: a aposta sai do saldo de games
-- e depois dos prêmios de games; o prêmio entra nos prêmios de games. O bônus de games continua sem movimentação.
-- Toda rodada passa pela função casino_apply_transaction (uma vez só por txn_id, com a carteira travada, na mesma
-- transação da movimentação CASINO); a conciliação da carteira passa a incluir os prêmios de games.
-- DDL no formato do Prisma; regras, RLS, funções e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "casino_transaction_id" UUID,
ADD COLUMN     "prizes_games_delta" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "casino_games" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "game_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "original" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casino_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "txn_id" TEXT NOT NULL,
    "round_id" TEXT,
    "provider" TEXT NOT NULL,
    "game_code" TEXT NOT NULL,
    "txn_type" TEXT NOT NULL,
    "bet_cents" BIGINT NOT NULL,
    "win_cents" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "casino_games_active_provider_name_idx" ON "casino_games"("active", "provider", "name");

-- CreateIndex
CREATE UNIQUE INDEX "casino_games_provider_game_code_key" ON "casino_games"("provider", "game_code");

-- CreateIndex
CREATE UNIQUE INDEX "casino_transactions_txn_id_key" ON "casino_transactions"("txn_id");

-- CreateIndex
CREATE INDEX "casino_transactions_tenant_id_created_at_idx" ON "casino_transactions"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "casino_transactions_tenant_id_user_id_created_at_idx" ON "casino_transactions"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "casino_transactions_tenant_id_id_key" ON "casino_transactions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_casino_transaction_id_key" ON "wallet_entries"("tenant_id", "casino_transaction_id");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_casino_transaction_id_fkey" FOREIGN KEY ("tenant_id", "casino_transaction_id") REFERENCES "casino_transactions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_transactions" ADD CONSTRAINT "casino_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_transactions" ADD CONSTRAINT "casino_transactions_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Catálogo (global, sem banca): formato conferido de novo aqui. A API sincroniza (inclui e atualiza); nada é apagado.
-- ---------------------------------------------------------------------------
ALTER TABLE "casino_games"
  ADD CONSTRAINT "casino_games_provider_format" CHECK ("provider" ~ '^[A-Za-z0-9][A-Za-z0-9 ._()&-]{0,59}$'),
  ADD CONSTRAINT "casino_games_code_format" CHECK ("game_code" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
  ADD CONSTRAINT "casino_games_name_length" CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" = btrim("name")),
  ADD CONSTRAINT "casino_games_image_https" CHECK (
    "image_url" IS NULL OR ("image_url" ~ '^https://[^\s"''<>]+$' AND char_length("image_url") <= 500));

-- ---------------------------------------------------------------------------
-- Rodadas: valores em centavos, não negativos, tipo conhecido. Somente inclusão (nem a dona altera ou apaga).
-- ---------------------------------------------------------------------------
ALTER TABLE "casino_transactions"
  ADD CONSTRAINT "casino_transactions_txn_id_format" CHECK ("txn_id" ~ '^[\x21-\x7e]{1,128}$'),
  ADD CONSTRAINT "casino_transactions_round_id_format" CHECK ("round_id" IS NULL OR "round_id" ~ '^[\x21-\x7e]{1,128}$'),
  ADD CONSTRAINT "casino_transactions_type" CHECK ("txn_type" IN ('debit_credit', 'debit', 'credit', 'bonus')),
  ADD CONSTRAINT "casino_transactions_amounts" CHECK (
    "bet_cents" BETWEEN 0 AND 100000000000 AND "win_cents" BETWEEN 0 AND 100000000000 AND "balance_after" >= 0);

CREATE FUNCTION "casino_transactions_append_only"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'casino transactions are append-only' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "casino_transactions_append_only"
  BEFORE UPDATE OR DELETE ON "casino_transactions"
  FOR EACH ROW EXECUTE FUNCTION "casino_transactions_append_only"();

ALTER TABLE "casino_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "casino_transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "casino_transactions_tenant_isolation" ON "casino_transactions"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Webhook do provedor: chega sem banca, com o id do jogador (user_code = users.id). Como no login do painel, uma
-- policy extra libera SELECT de UMA linha de users, escolhida pelo valor que a transação informa (app.casino_user);
-- sem o valor, nada extra fica visível. Depois a mesma transação entra na banca do jogador.
-- ---------------------------------------------------------------------------
CREATE POLICY "users_casino_lookup" ON "users"
  FOR SELECT
  USING ("id"::text = NULLIF(current_setting('app.casino_user', true), ''));

-- ---------------------------------------------------------------------------
-- Movimentação CASINO: uma por rodada (UNIQUE em casino_transaction_id), só nas bolsas de games (saldo e prêmios).
-- Prêmios de games só mudam por rodada do cassino (ou saldo de abertura).
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN (
    'FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION', 'LOTTERY_BET',
    'LOTTERY_REFUND', 'COMMISSION_REVERSAL', 'PRIZE', 'CASINO'
  ));

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
    OR "kind" IN ('COMMISSION', 'COMMISSION_REVERSAL', 'LOTTERY_BET', 'LOTTERY_REFUND', 'PRIZE', 'CASINO')
  );

ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_casino_rules" CHECK (
    ("kind" = 'CASINO') = ("casino_transaction_id" IS NOT NULL)
    AND ("kind" <> 'CASINO' OR (
          "balance_jb_delta" = 0 AND "prizes_jb_delta" = 0 AND "bonus_jb_delta" = 0
      AND "balance_games_delta" <= 0 AND ("balance_games_delta" <> 0 OR "prizes_games_delta" <> 0)
      AND "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "pule_prize_id" IS NULL))
    AND ("prizes_games_delta" = 0 OR "kind" IN ('CASINO', 'OPENING_BALANCE'))
  );

-- Conciliação: saldo = soma das movimentações também nos prêmios de games.
CREATE OR REPLACE FUNCTION "wallets_ledger_reconciled"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_wallet "wallets"%ROWTYPE;
  v_balance bigint;
  v_prizes bigint;
  v_bonus bigint;
  v_games bigint;
  v_games_prizes bigint;
BEGIN
  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = NEW."tenant_id" AND "user_id" = NEW."user_id";
  SELECT COALESCE(sum("balance_jb_delta"), 0), COALESCE(sum("prizes_jb_delta"), 0),
         COALESCE(sum("bonus_jb_delta"), 0), COALESCE(sum("balance_games_delta"), 0),
         COALESCE(sum("prizes_games_delta"), 0)
    INTO v_balance, v_prizes, v_bonus, v_games, v_games_prizes
    FROM "wallet_entries" WHERE "tenant_id" = NEW."tenant_id" AND "user_id" = NEW."user_id";
  IF v_wallet."balance_jb" <> v_balance OR v_wallet."prizes_jb" <> v_prizes
     OR v_wallet."bonus_jb" <> v_bonus OR v_wallet."balance_games" <> v_games
     OR v_wallet."prizes_games" <> v_games_prizes THEN
    RAISE EXCEPTION 'wallet out of sync with its entries' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

-- Prêmios de games que existiam fora do registro (não deveria haver: eram travados) ganham saldo de abertura. O RLS
-- forçado é suspenso só aqui, para a dona enxergar todas as bancas; é restaurado logo abaixo.
ALTER TABLE "wallets" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "wallet_entries" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "prizes_games_delta", "note")
SELECT "tenant_id", "user_id", 'OPENING_BALANCE', 0, 0, "prizes_games", 'Prêmios de games anteriores ao registro'
FROM "wallets" WHERE "prizes_games" <> 0;
ALTER TABLE "wallets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "wallet_entries" FORCE ROW LEVEL SECURITY;

-- Só o bônus de games segue sem movimentação.
CREATE OR REPLACE FUNCTION "wallets_games_frozen"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."bonus_games" <> OLD."bonus_games" THEN
    RAISE EXCEPTION 'games bonus has no movements yet' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rodada do cassino na banca corrente (a API entrou na banca do jogador). Uma vez só por txn_id: repetir a mesma
-- rodada devolve o saldo atual sem aplicar de novo; o mesmo txn_id com outros valores ou outro jogador = SJ010.
-- Aposta: só com o jogador ATIVO (senão no_data_found) e o Disponível Games suficiente (SJ001); sai do saldo de games e
-- depois dos prêmios de games. Prêmio: entra nos prêmios de games (sempre, mesmo de jogador bloqueado: é dele).
-- Devolve o saldo gastável depois (saldo + prêmios de games; o bônus de games segue travado) e se a rodada foi aplicada
-- agora. Jogador inexistente: no_data_found.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "casino_apply_transaction"(
  p_user uuid, p_txn_id text, p_round_id text, p_provider text, p_game_code text, p_txn_type text, p_bet bigint,
  p_win bigint
) RETURNS TABLE ("balance" bigint, "applied" boolean)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_status "user_status";
  v_wallet "wallets"%ROWTYPE;
  v_existing "casino_transactions"%ROWTYPE;
  v_from_balance bigint;
  v_from_prizes bigint;
  v_after bigint;
  v_txn uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_bet IS NULL OR p_win IS NULL OR p_bet < 0 OR p_win < 0 OR p_bet > 100000000000 OR p_win > 100000000000 THEN
    RAISE EXCEPTION 'invalid amounts' USING ERRCODE = 'check_violation';
  END IF;

  SELECT "status" INTO v_status FROM "users" WHERE "tenant_id" = v_tenant AND "id" = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = v_tenant AND "user_id" = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- A carteira travada serializa as rodadas do jogador: a repetição concorrente da mesma txn_id vê a primeira.
  SELECT * INTO v_existing FROM "casino_transactions" WHERE "tenant_id" = v_tenant AND "txn_id" = p_txn_id;
  IF FOUND THEN
    IF v_existing."user_id" <> p_user OR v_existing."bet_cents" <> p_bet OR v_existing."win_cents" <> p_win THEN
      RAISE EXCEPTION 'transaction id reused' USING ERRCODE = 'SJ010';
    END IF;
    RETURN QUERY SELECT v_wallet."balance_games" + v_wallet."prizes_games", false;
    RETURN;
  END IF;

  IF p_bet > 0 AND v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'blocked user cannot bet' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_bet > v_wallet."balance_games" + v_wallet."prizes_games" THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'SJ001';
  END IF;

  v_from_balance := LEAST(v_wallet."balance_games", p_bet);
  v_from_prizes := p_bet - v_from_balance;
  v_after := v_wallet."balance_games" - v_from_balance
             + v_wallet."prizes_games" - v_from_prizes + p_win;

  INSERT INTO "casino_transactions" ("tenant_id", "user_id", "txn_id", "round_id", "provider", "game_code", "txn_type",
                                     "bet_cents", "win_cents", "balance_after")
  VALUES (v_tenant, p_user, p_txn_id, p_round_id, p_provider, p_game_code, p_txn_type, p_bet, p_win, v_after)
  RETURNING "id" INTO v_txn;

  IF v_from_balance <> 0 OR p_win - v_from_prizes <> 0 THEN
    UPDATE "wallets"
       SET "balance_games" = "balance_games" - v_from_balance,
           "prizes_games" = "prizes_games" - v_from_prizes + p_win,
           "updated_at" = now()
     WHERE "id" = v_wallet."id";
    INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                  "balance_games_delta", "prizes_games_delta", "casino_transaction_id")
    VALUES (v_tenant, p_user, 'CASINO', 0, 0, -v_from_balance, p_win - v_from_prizes, v_txn);
  END IF;

  RETURN QUERY SELECT v_after, true;
END;
$$;

REVOKE ALL ON FUNCTION "casino_apply_transaction"(uuid, text, text, text, text, text, bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "casino_apply_transaction"(uuid, text, text, text, text, text, bigint, bigint) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: sincroniza o catálogo (inclui e atualiza, sem apagar); lê as rodadas (grava só a
-- função acima).
-- ---------------------------------------------------------------------------
REVOKE ALL ON "casino_games", "casino_transactions" FROM PUBLIC;
GRANT SELECT ON "casino_games" TO "sysjb_app";
GRANT INSERT ("provider", "game_code", "name", "image_url", "original", "active", "synced_at") ON "casino_games" TO "sysjb_app";
GRANT UPDATE ("name", "image_url", "original", "active", "synced_at") ON "casino_games" TO "sysjb_app";
GRANT USAGE ON SEQUENCE "casino_games_id_seq" TO "sysjb_app";
GRANT SELECT ON "casino_transactions" TO "sysjb_app";
