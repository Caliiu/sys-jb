-- Saques (Carteira > Saques e "Meus saques"): pedido do jogador, análise pelo Gerente acima do limite automático da
-- banca, envio ao gateway (MisticPay) e conclusão conferida no próprio gateway. O valor sai da carteira (prêmios das
-- loterias, depois prêmios de games) na solicitação e volta só se o saque não for pago. Toda passagem de situação e
-- todo movimento de dinheiro são feitos pelas funções abaixo, com o saque travado; a role de runtime só lê.
-- SQLSTATEs: SJ013 chave de idempotência reutilizada com outros dados; SJ014 saques pausados na banca; SJ015 valor
-- fora dos limites; SJ016 limite de saques do dia; SJ017 situação não permite a ação; SJ018 chave CPF de outra
-- pessoa; SJ019 conta bloqueada (SJ001 = saldo de prêmios insuficiente, como nas apostas).
-- DDL no formato do Prisma; regras, RLS, funções e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "withdrawal_auto_limit_cents" INTEGER NOT NULL DEFAULT 20000,
ADD COLUMN     "withdrawal_daily_count" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "withdrawal_max_cents" INTEGER NOT NULL DEFAULT 500000,
ADD COLUMN     "withdrawal_min_cents" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "withdrawals_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "pix_withdrawal_id" UUID;

-- CreateTable
CREATE TABLE "pix_withdrawals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "from_prizes_jb_cents" BIGINT NOT NULL,
    "from_prizes_games_cents" BIGINT NOT NULL,
    "key_type" TEXT NOT NULL,
    "key_value" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "gateway" TEXT,
    "provider_transaction_id" TEXT,
    "failure_reason" TEXT,
    "decision_note" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "beneficiary_document" TEXT,
    "beneficiary_name" TEXT,
    "send_started_at" TIMESTAMPTZ(3),
    "last_checked_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pix_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pix_withdrawals_tenant_id_created_at_idx" ON "pix_withdrawals"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pix_withdrawals_tenant_id_user_id_created_at_idx" ON "pix_withdrawals"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pix_withdrawals_status_created_at_idx" ON "pix_withdrawals"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pix_withdrawals_tenant_id_id_key" ON "pix_withdrawals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pix_withdrawals_tenant_id_user_id_idempotency_key_key" ON "pix_withdrawals"("tenant_id", "user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_pix_withdrawal_id_kind_key" ON "wallet_entries"("tenant_id", "pix_withdrawal_id", "kind");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_pix_withdrawal_id_fkey" FOREIGN KEY ("tenant_id", "pix_withdrawal_id") REFERENCES "pix_withdrawals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_withdrawals" ADD CONSTRAINT "pix_withdrawals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_withdrawals" ADD CONSTRAINT "pix_withdrawals_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_withdrawals" ADD CONSTRAINT "pix_withdrawals_tenant_id_reviewed_by_fkey" FOREIGN KEY ("tenant_id", "reviewed_by") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_withdrawals" ADD CONSTRAINT "pix_withdrawals_tenant_id_resolved_by_fkey" FOREIGN KEY ("tenant_id", "resolved_by") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Limites de saque por banca (Configurações > Pagamentos). Gravados só por withdrawal_settings_save (Gerente).
-- ---------------------------------------------------------------------------
ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_withdrawal_limits" CHECK (
        "withdrawal_min_cents" BETWEEN 100 AND 100000000
    AND "withdrawal_max_cents" BETWEEN "withdrawal_min_cents" AND 100000000
    AND "withdrawal_daily_count" BETWEEN 1 AND 50
    AND "withdrawal_auto_limit_cents" BETWEEN 0 AND "withdrawal_max_cents");

-- ---------------------------------------------------------------------------
-- Saques: o valor sai da carteira (prêmios das loterias, depois prêmios de games) na solicitação e só volta se o saque
-- não for pago. Situações:
--   REVIEW     aguarda o Gerente (acima do limite automático, ou devolvido do envio por recusa do gateway);
--   QUEUED     aprovado (ou automático), a enviar ao gateway;
--   SENDING    enviando: o gateway pode ou não ter recebido (ele não aceita um id nosso, então NUNCA se reenvia
--              sozinho; a API procura o envio no gateway e, sem achar, o Gerente conclui à mão);
--   PROCESSING no gateway, com o id da transação de lá;
--   PAID / FAILED (devolvido) / REJECTED (recusado pelo Gerente, devolvido) / CANCELED (pelo jogador, devolvido): finais.
-- ---------------------------------------------------------------------------
ALTER TABLE "pix_withdrawals"
  ADD CONSTRAINT "pix_withdrawals_amount" CHECK (
        "amount_cents" BETWEEN 100 AND 100000000
    AND "from_prizes_jb_cents" >= 0 AND "from_prizes_games_cents" >= 0
    AND "from_prizes_jb_cents" + "from_prizes_games_cents" = "amount_cents"),
  ADD CONSTRAINT "pix_withdrawals_key" CHECK (
       ("key_type" = 'CPF' AND "key_value" ~ '^[0-9]{11}$')
    OR ("key_type" = 'PHONE' AND "key_value" ~ '^[1-9][0-9]{10}$')
    OR ("key_type" = 'EMAIL' AND char_length("key_value") <= 77 AND "key_value" = lower("key_value")
        AND "key_value" ~ '^[^[:space:][:cntrl:]@<>"''`]+@[^[:space:][:cntrl:]@<>"''`]+\.[^[:space:][:cntrl:]@<>"''`]+$')
    OR ("key_type" = 'RANDOM' AND "key_value" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')),
  ADD CONSTRAINT "pix_withdrawals_status" CHECK ("status" IN (
    'REVIEW', 'QUEUED', 'SENDING', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELED')),
  ADD CONSTRAINT "pix_withdrawals_gateway" CHECK (
    ("gateway" IS NULL OR "gateway" IN ('MISTICPAY'))
    AND ("status" NOT IN ('SENDING', 'PROCESSING', 'PAID') OR "gateway" IS NOT NULL)),
  ADD CONSTRAINT "pix_withdrawals_provider_id" CHECK (
    ("provider_transaction_id" IS NULL OR "provider_transaction_id" ~ '^[\x21-\x7e]{1,128}$')
    AND ("status" <> 'PROCESSING' OR "provider_transaction_id" IS NOT NULL)
    AND ("status" NOT IN ('REVIEW', 'QUEUED', 'SENDING') OR "provider_transaction_id" IS NULL)),
  ADD CONSTRAINT "pix_withdrawals_sending" CHECK (("status" <> 'SENDING') OR "send_started_at" IS NOT NULL),
  ADD CONSTRAINT "pix_withdrawals_paid_at" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL)),
  ADD CONSTRAINT "pix_withdrawals_failure_reason" CHECK (
    "failure_reason" IS NULL OR "failure_reason" IN (
      'GATEWAY_REJECTED', 'GATEWAY_AUTH', 'NO_GATEWAY', 'GATEWAY_FAILED', 'MANUAL_NOT_PAID')),
  ADD CONSTRAINT "pix_withdrawals_decision_note" CHECK (
    "decision_note" IS NULL OR (char_length(btrim("decision_note")) BETWEEN 3 AND 200 AND "decision_note" !~ '[[:cntrl:]]')),
  ADD CONSTRAINT "pix_withdrawals_reviewed" CHECK (
    ("reviewed_by" IS NULL) = ("reviewed_at" IS NULL) AND ("status" <> 'REJECTED' OR "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "pix_withdrawals_resolved" CHECK (("resolved_by" IS NULL) = ("resolved_at" IS NULL)),
  ADD CONSTRAINT "pix_withdrawals_beneficiary" CHECK (
    ("beneficiary_document" IS NULL OR "beneficiary_document" ~ '^([0-9]{11}|[0-9]{14})$')
    AND ("beneficiary_name" IS NULL
         OR (char_length("beneficiary_name") BETWEEN 1 AND 120 AND "beneficiary_name" !~ '[[:cntrl:]]')));

-- Nada é apagado; finais não mudam; quem, quanto, de onde e para qual chave nunca mudam; o id do gateway, depois de
-- gravado, também não; só as passagens de situação previstas.
CREATE FUNCTION "pix_withdrawals_guard"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'withdrawals are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('PAID', 'FAILED', 'REJECTED', 'CANCELED') THEN
    RAISE EXCEPTION 'final withdrawal is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."tenant_id" <> OLD."tenant_id" OR NEW."user_id" <> OLD."user_id"
     OR NEW."idempotency_key" <> OLD."idempotency_key" OR NEW."amount_cents" <> OLD."amount_cents"
     OR NEW."from_prizes_jb_cents" <> OLD."from_prizes_jb_cents"
     OR NEW."from_prizes_games_cents" <> OLD."from_prizes_games_cents"
     OR NEW."key_type" <> OLD."key_type" OR NEW."key_value" <> OLD."key_value" OR NEW."created_at" <> OLD."created_at"
     OR (OLD."provider_transaction_id" IS NOT NULL
         AND NEW."provider_transaction_id" IS DISTINCT FROM OLD."provider_transaction_id") THEN
    RAISE EXCEPTION 'withdrawal identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'REVIEW' AND NEW."status" IN ('QUEUED', 'REJECTED', 'CANCELED'))
    OR (OLD."status" = 'QUEUED' AND NEW."status" IN ('SENDING', 'REJECTED', 'REVIEW'))
    OR (OLD."status" = 'SENDING' AND NEW."status" IN ('PROCESSING', 'REVIEW', 'QUEUED', 'PAID', 'FAILED'))
    OR (OLD."status" = 'PROCESSING' AND NEW."status" IN ('PAID', 'FAILED'))) THEN
    RAISE EXCEPTION 'invalid withdrawal status change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pix_withdrawals_guard"
  BEFORE UPDATE OR DELETE ON "pix_withdrawals"
  FOR EACH ROW EXECUTE FUNCTION "pix_withdrawals_guard"();

-- Todo saque nasce em análise ou na fila, sem nada do gateway, da análise ou do pagamento.
CREATE FUNCTION "pix_withdrawals_new"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."status" NOT IN ('REVIEW', 'QUEUED') OR NEW."gateway" IS NOT NULL OR NEW."provider_transaction_id" IS NOT NULL
     OR NEW."failure_reason" IS NOT NULL OR NEW."decision_note" IS NOT NULL OR NEW."reviewed_by" IS NOT NULL
     OR NEW."resolved_by" IS NOT NULL OR NEW."beneficiary_document" IS NOT NULL OR NEW."send_started_at" IS NOT NULL
     OR NEW."last_checked_at" IS NOT NULL OR NEW."paid_at" IS NOT NULL THEN
    RAISE EXCEPTION 'withdrawals start under review or queued' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pix_withdrawals_new"
  BEFORE INSERT ON "pix_withdrawals"
  FOR EACH ROW EXECUTE FUNCTION "pix_withdrawals_new"();

ALTER TABLE "pix_withdrawals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pix_withdrawals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pix_withdrawals_tenant_isolation" ON "pix_withdrawals"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- Aviso do gateway (webhook): chega sem banca, com o id do saque no endereço assinado (conferido pela API). Uma policy
-- extra libera SELECT de UMA linha (app.pix_withdrawal); depois a mesma transação entra na banca do saque.
CREATE POLICY "pix_withdrawals_webhook_lookup" ON "pix_withdrawals"
  FOR SELECT
  USING ("id"::text = NULLIF(current_setting('app.pix_withdrawal', true), ''));

-- ---------------------------------------------------------------------------
-- Movimentações WITHDRAWAL (reserva, na solicitação) e WITHDRAWAL_REFUND (devolução): uma de cada por saque, só nas
-- bolsas de prêmios (loterias e games).
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN (
    'FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION', 'LOTTERY_BET',
    'LOTTERY_REFUND', 'COMMISSION_REVERSAL', 'PRIZE', 'CASINO', 'DEPOSIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND'
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
    OR "kind" IN ('COMMISSION', 'COMMISSION_REVERSAL', 'LOTTERY_BET', 'LOTTERY_REFUND', 'PRIZE', 'CASINO', 'DEPOSIT',
                  'WITHDRAWAL', 'WITHDRAWAL_REFUND')
  );

-- Prêmios de games também mudam com o saque (reserva e devolução).
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_casino_rules",
  ADD CONSTRAINT "wallet_entries_casino_rules" CHECK (
    ("kind" = 'CASINO') = ("casino_transaction_id" IS NOT NULL)
    AND ("kind" <> 'CASINO' OR (
          "balance_jb_delta" = 0 AND "prizes_jb_delta" = 0 AND "bonus_jb_delta" = 0
      AND "balance_games_delta" <= 0 AND ("balance_games_delta" <> 0 OR "prizes_games_delta" <> 0)
      AND "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "pule_prize_id" IS NULL))
    AND ("prizes_games_delta" = 0 OR "kind" IN ('CASINO', 'OPENING_BALANCE', 'WITHDRAWAL', 'WITHDRAWAL_REFUND'))
  );

ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_withdrawal_rules" CHECK (
    ("kind" IN ('WITHDRAWAL', 'WITHDRAWAL_REFUND')) = ("pix_withdrawal_id" IS NOT NULL)
    AND ("kind" NOT IN ('WITHDRAWAL', 'WITHDRAWAL_REFUND') OR (
          "balance_jb_delta" = 0 AND "bonus_jb_delta" = 0 AND "balance_games_delta" = 0
      AND "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "pule_prize_id" IS NULL AND "casino_transaction_id" IS NULL AND "pix_deposit_id" IS NULL))
    AND ("kind" <> 'WITHDRAWAL' OR (
          "prizes_jb_delta" <= 0 AND "prizes_games_delta" <= 0 AND "prizes_jb_delta" + "prizes_games_delta" < 0))
    AND ("kind" <> 'WITHDRAWAL_REFUND' OR (
          "prizes_jb_delta" >= 0 AND "prizes_games_delta" >= 0 AND "prizes_jb_delta" + "prizes_games_delta" > 0))
  );

-- ---------------------------------------------------------------------------
-- Uso interno: devolve à carteira o que o saque reservou (mesmas bolsas). Quem chama já travou o saque e mudou a
-- situação dele para um final. A role de runtime não executa.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_withdrawal_refund"(p_tenant uuid, p_withdrawal uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_withdrawal "pix_withdrawals"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
BEGIN
  SELECT * INTO v_withdrawal FROM "pix_withdrawals" WHERE "tenant_id" = p_tenant AND "id" = p_withdrawal;
  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = p_tenant AND "user_id" = v_withdrawal."user_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE "wallets"
     SET "prizes_jb" = "prizes_jb" + v_withdrawal."from_prizes_jb_cents",
         "prizes_games" = "prizes_games" + v_withdrawal."from_prizes_games_cents",
         "updated_at" = now()
   WHERE "id" = v_wallet."id";
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                "prizes_games_delta", "pix_withdrawal_id")
  VALUES (p_tenant, v_withdrawal."user_id", 'WITHDRAWAL_REFUND', 0, v_withdrawal."from_prizes_jb_cents",
          v_withdrawal."from_prizes_games_cents", v_withdrawal."id");
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_refund"(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Solicitação do jogador (banca corrente). Carteira travada: pedidos simultâneos do mesmo jogador se enfileiram (o
-- limite diário e o saldo valem para todos). Mesma chave de idempotência = o mesmo saque (outro valor/chave = SJ013).
-- Erros: SJ019 conta bloqueada; SJ018 chave CPF de outra pessoa; SJ014 saques pausados; SJ015 valor fora dos limites;
-- SJ016 limite de saques do dia; SJ001 sem saldo de prêmios suficiente. Até o limite automático vai para a fila
-- (QUEUED); acima, para análise (REVIEW). Devolve o saque e se foi criado agora.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_withdrawal_request"(
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

  IF p_amount > v_wallet."prizes_jb" + v_wallet."prizes_games" THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'SJ001';
  END IF;
  v_from_jb := LEAST(v_wallet."prizes_jb", p_amount);
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

REVOKE ALL ON FUNCTION "pix_withdrawal_request"(uuid, bigint, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_request"(uuid, bigint, text, text, uuid) TO "sysjb_app";

-- O jogador cancela o próprio saque enquanto está em análise (devolve). Outra situação: SJ017.
CREATE FUNCTION "pix_withdrawal_cancel"(p_user uuid, p_withdrawal uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_status text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT "status" INTO v_status FROM "pix_withdrawals"
   WHERE "tenant_id" = v_tenant AND "id" = p_withdrawal AND "user_id" = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status <> 'REVIEW' THEN
    RAISE EXCEPTION 'withdrawal cannot be canceled now' USING ERRCODE = 'SJ017';
  END IF;
  UPDATE "pix_withdrawals" SET "status" = 'CANCELED', "updated_at" = now() WHERE "id" = p_withdrawal;
  PERFORM "pix_withdrawal_refund"(v_tenant, p_withdrawal);
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_cancel"(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_cancel"(uuid, uuid) TO "sysjb_app";

-- Análise pelo Gerente (operator_assert_manager): aprovar (REVIEW -> QUEUED) ou recusar (REVIEW/QUEUED -> REJECTED,
-- devolve; motivo opcional, mostrado ao jogador). Outra situação: SJ017.
CREATE FUNCTION "pix_withdrawal_review"(p_actor uuid, p_withdrawal uuid, p_approve boolean, p_note text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_status text;
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  SELECT "status" INTO v_status FROM "pix_withdrawals" WHERE "tenant_id" = v_tenant AND "id" = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_approve THEN
    IF v_status <> 'REVIEW' THEN
      RAISE EXCEPTION 'withdrawal is not under review' USING ERRCODE = 'SJ017';
    END IF;
    UPDATE "pix_withdrawals"
       SET "status" = 'QUEUED', "failure_reason" = NULL, "reviewed_by" = p_actor, "reviewed_at" = now(),
           "updated_at" = now()
     WHERE "id" = p_withdrawal;
    RETURN;
  END IF;
  IF v_status NOT IN ('REVIEW', 'QUEUED') THEN
    RAISE EXCEPTION 'withdrawal can no longer be rejected' USING ERRCODE = 'SJ017';
  END IF;
  UPDATE "pix_withdrawals"
     SET "status" = 'REJECTED', "decision_note" = NULLIF(btrim(p_note), ''), "reviewed_by" = p_actor,
         "reviewed_at" = now(), "updated_at" = now()
   WHERE "id" = p_withdrawal;
  PERFORM "pix_withdrawal_refund"(v_tenant, p_withdrawal);
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_review"(uuid, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_review"(uuid, uuid, boolean, text) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Envio ao gateway (API). claim: QUEUED -> SENDING (um só envio: quem não conseguir a passagem não envia).
-- sent: SENDING -> PROCESSING com o id do gateway. unsend: o gateway recusou com certeza (nada foi criado lá):
-- SENDING -> REVIEW com o motivo. Devolvem false se não havia o que mudar.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_withdrawal_claim"(p_withdrawal uuid, p_gateway text) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "pix_withdrawals"
     SET "status" = 'SENDING', "gateway" = p_gateway, "send_started_at" = now(), "failure_reason" = NULL,
         "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_withdrawal AND "status" = 'QUEUED';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_claim"(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_claim"(uuid, text) TO "sysjb_app";

CREATE FUNCTION "pix_withdrawal_sent"(p_withdrawal uuid, p_provider_id text) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "pix_withdrawals"
     SET "status" = 'PROCESSING', "provider_transaction_id" = p_provider_id, "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_withdrawal AND "status" = 'SENDING';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_sent"(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_sent"(uuid, text) TO "sysjb_app";

CREATE FUNCTION "pix_withdrawal_unsend"(p_withdrawal uuid, p_reason text) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason NOT IN ('GATEWAY_REJECTED', 'GATEWAY_AUTH', 'NO_GATEWAY') THEN
    RAISE EXCEPTION 'invalid reason' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "pix_withdrawals"
     SET "status" = 'REVIEW', "gateway" = NULL, "send_started_at" = NULL, "failure_reason" = p_reason,
         "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_withdrawal AND "status" = 'SENDING';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_unsend"(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_unsend"(uuid, text) TO "sysjb_app";

-- O gateway recusou por limite de requisições (HTTP 429: com certeza não processou): volta para a fila e a rodada
-- automática envia de novo.
CREATE FUNCTION "pix_withdrawal_requeue"(p_withdrawal uuid) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "pix_withdrawals" SET "status" = 'QUEUED', "gateway" = NULL, "send_started_at" = NULL, "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_withdrawal AND "status" = 'SENDING';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_requeue"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_requeue"(uuid) TO "sysjb_app";

-- Sem gateway ativo na hora de enviar: volta da fila para análise (o Gerente decide depois de configurar).
CREATE FUNCTION "pix_withdrawal_hold"(p_withdrawal uuid) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "pix_withdrawals" SET "status" = 'REVIEW', "failure_reason" = 'NO_GATEWAY', "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_withdrawal AND "status" = 'QUEUED';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_hold"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_hold"(uuid) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Resultado conferido no gateway (a API só chama depois de consultar a transação lá): PROCESSING -> PAID, ou FAILED
-- (devolve). Grava quem recebeu, segundo o gateway. Devolve 'paid', 'failed' ou 'final' (já concluído).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_withdrawal_settle"(
  p_withdrawal uuid, p_paid boolean, p_beneficiary_document text, p_beneficiary_name text
) RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_status text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT "status" INTO v_status FROM "pix_withdrawals" WHERE "tenant_id" = v_tenant AND "id" = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status IN ('PAID', 'FAILED', 'REJECTED', 'CANCELED') THEN
    RETURN 'final';
  END IF;
  IF v_status <> 'PROCESSING' THEN
    RAISE EXCEPTION 'withdrawal is not at the gateway' USING ERRCODE = 'SJ017';
  END IF;
  IF p_paid THEN
    UPDATE "pix_withdrawals"
       SET "status" = 'PAID', "paid_at" = now(), "beneficiary_document" = p_beneficiary_document,
           "beneficiary_name" = p_beneficiary_name, "updated_at" = now()
     WHERE "id" = p_withdrawal;
    RETURN 'paid';
  END IF;
  UPDATE "pix_withdrawals" SET "status" = 'FAILED', "failure_reason" = 'GATEWAY_FAILED', "updated_at" = now()
   WHERE "id" = p_withdrawal;
  PERFORM "pix_withdrawal_refund"(v_tenant, p_withdrawal);
  RETURN 'failed';
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_settle"(uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_settle"(uuid, boolean, text, text) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Conclusão manual pelo Gerente, depois de conferir no painel do gateway: envio sem resposta (SENDING há mais de
-- 10 minutos) ou no gateway sem conclusão (PROCESSING há mais de 1 hora). Pago -> PAID; não pago -> FAILED (devolve).
-- Outra situação: SJ017.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_withdrawal_resolve"(p_actor uuid, p_withdrawal uuid, p_paid boolean) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_withdrawal "pix_withdrawals"%ROWTYPE;
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  SELECT * INTO v_withdrawal FROM "pix_withdrawals" WHERE "tenant_id" = v_tenant AND "id" = p_withdrawal FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT ((v_withdrawal."status" = 'SENDING' AND v_withdrawal."send_started_at" < now() - interval '10 minutes')
       OR (v_withdrawal."status" = 'PROCESSING' AND v_withdrawal."updated_at" < now() - interval '1 hour')) THEN
    RAISE EXCEPTION 'withdrawal cannot be resolved manually now' USING ERRCODE = 'SJ017';
  END IF;
  IF p_paid THEN
    UPDATE "pix_withdrawals"
       SET "status" = 'PAID', "paid_at" = now(), "resolved_by" = p_actor, "resolved_at" = now(), "updated_at" = now()
     WHERE "id" = p_withdrawal;
    RETURN;
  END IF;
  UPDATE "pix_withdrawals"
     SET "status" = 'FAILED', "failure_reason" = 'MANUAL_NOT_PAID', "resolved_by" = p_actor, "resolved_at" = now(),
         "updated_at" = now()
   WHERE "id" = p_withdrawal;
  PERFORM "pix_withdrawal_refund"(v_tenant, p_withdrawal);
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawal_resolve"(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawal_resolve"(uuid, uuid, boolean) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Rodada automática (sem banca): saques a mover, de todas as bancas. Na fila (enviar); enviando há mais de 2 minutos
-- (procurar no gateway, por até 2 dias); no gateway (conferir, por até 30 dias). Os dois últimos só se não conferidos
-- nos últimos p_every_seconds. Até p_limit por banca. Roda como dona e entra em cada banca, com o contexto restaurado.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_withdrawals_due"(p_limit integer, p_every_seconds integer)
  RETURNS TABLE ("id" uuid, "tenant_id" uuid, "status" text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_previous text := current_setting('app.tenant_id', true);
  v_tenant uuid;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 OR p_every_seconds IS NULL OR p_every_seconds < 5 THEN
    RAISE EXCEPTION 'invalid arguments' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_tenant IN SELECT t."id" FROM "tenants" t LOOP
    PERFORM set_config('app.tenant_id', v_tenant::text, true);
    RETURN QUERY
      SELECT w."id", w."tenant_id", w."status"
        FROM "pix_withdrawals" w
       WHERE w."tenant_id" = v_tenant
         AND (w."status" = 'QUEUED'
              OR (w."status" = 'SENDING' AND w."send_started_at" < now() - interval '2 minutes'
                  AND w."send_started_at" > now() - interval '2 days')
              OR (w."status" = 'PROCESSING' AND w."created_at" > now() - interval '30 days'))
         AND (w."status" = 'QUEUED' OR w."last_checked_at" IS NULL
              OR w."last_checked_at" < now() - make_interval(secs => p_every_seconds))
       ORDER BY (w."status" = 'QUEUED') DESC, w."last_checked_at" NULLS FIRST, w."created_at"
       LIMIT p_limit;
  END LOOP;
  PERFORM set_config('app.tenant_id', COALESCE(v_previous, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION "pix_withdrawals_due"(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_withdrawals_due"(integer, integer) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Limites de saque da banca (Gerente). Os CHECKs de tenant_settings conferem os valores.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "withdrawal_settings_save"(
  p_actor uuid, p_enabled boolean, p_min integer, p_max integer, p_daily integer, p_auto integer
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  INSERT INTO "tenant_settings" ("tenant_id", "withdrawals_enabled", "withdrawal_min_cents", "withdrawal_max_cents",
                                 "withdrawal_daily_count", "withdrawal_auto_limit_cents", "updated_at")
  VALUES ("app_current_tenant_id"(), p_enabled, p_min, p_max, p_daily, p_auto, now())
  ON CONFLICT ("tenant_id") DO UPDATE
    SET "withdrawals_enabled" = EXCLUDED."withdrawals_enabled",
        "withdrawal_min_cents" = EXCLUDED."withdrawal_min_cents",
        "withdrawal_max_cents" = EXCLUDED."withdrawal_max_cents",
        "withdrawal_daily_count" = EXCLUDED."withdrawal_daily_count",
        "withdrawal_auto_limit_cents" = EXCLUDED."withdrawal_auto_limit_cents",
        "updated_at" = now();
END;
$$;

REVOKE ALL ON FUNCTION "withdrawal_settings_save"(uuid, boolean, integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "withdrawal_settings_save"(uuid, boolean, integer, integer, integer, integer) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: lê os saques da própria banca e marca a última consulta; todo o resto pelas funções.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "pix_withdrawals" FROM PUBLIC;
GRANT SELECT ON "pix_withdrawals" TO "sysjb_app";
GRANT UPDATE ("last_checked_at") ON "pix_withdrawals" TO "sysjb_app";
