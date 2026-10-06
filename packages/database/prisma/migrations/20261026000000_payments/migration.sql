-- Pagamentos: gateways da banca (Configurações > Pagamentos, credenciais cifradas pela API) e depósitos via Pix
-- (Recarga Pix). O depósito é criado pela API no gateway ativo; o pagamento só vale depois de conferido no próprio
-- gateway, e só a função pix_deposit_confirm marca como pago e credita a carteira (uma vez por depósito, conferindo o
-- valor). A role de runtime não altera gateways nem a situação dos depósitos diretamente: tudo pelas funções abaixo.
-- SQLSTATE SJ011: o valor pago no gateway difere do valor do depósito (não credita; a API registra para conferência).
-- DDL no formato do Prisma; regras, RLS, funções e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "pix_deposit_id" UUID;

-- CreateTable
CREATE TABLE "payment_gateways" (
    "tenant_id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "credentials" BYTEA NOT NULL,
    "credentials_hint" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_gateways_pkey" PRIMARY KEY ("tenant_id","gateway")
);

-- CreateTable
CREATE TABLE "pix_deposits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider_transaction_id" TEXT,
    "pix_code" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_checked_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pix_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pix_deposits_tenant_id_created_at_idx" ON "pix_deposits"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pix_deposits_tenant_id_user_id_created_at_idx" ON "pix_deposits"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pix_deposits_status_created_at_idx" ON "pix_deposits"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pix_deposits_tenant_id_id_key" ON "pix_deposits"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_pix_deposit_id_key" ON "wallet_entries"("tenant_id", "pix_deposit_id");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_pix_deposit_id_fkey" FOREIGN KEY ("tenant_id", "pix_deposit_id") REFERENCES "pix_deposits"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateways" ADD CONSTRAINT "payment_gateways_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateways" ADD CONSTRAINT "payment_gateways_tenant_id_updated_by_fkey" FOREIGN KEY ("tenant_id", "updated_by") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_deposits" ADD CONSTRAINT "pix_deposits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pix_deposits" ADD CONSTRAINT "pix_deposits_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Gateways: um ativo por banca, gateway conhecido, credencial cifrada com tamanho plausível (iv + tag + texto).
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_gateways"
  ADD CONSTRAINT "payment_gateways_gateway" CHECK ("gateway" IN ('MISTICPAY')),
  ADD CONSTRAINT "payment_gateways_credentials_size" CHECK (octet_length("credentials") BETWEEN 29 AND 4096),
  ADD CONSTRAINT "payment_gateways_hint_format" CHECK (
    char_length("credentials_hint") BETWEEN 1 AND 40 AND "credentials_hint" !~ '[\s<>"''`]');

CREATE UNIQUE INDEX "payment_gateways_one_active" ON "payment_gateways"("tenant_id") WHERE "active";

ALTER TABLE "payment_gateways" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_gateways" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_gateways_tenant_isolation" ON "payment_gateways"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Depósitos: valores em centavos (mesmos limites da tela), situação conhecida, pago com data. Dinheiro: nada é
-- apagado; depois de pago, nada muda; quem, quanto, para onde e por qual gateway nunca mudam.
-- ---------------------------------------------------------------------------
ALTER TABLE "pix_deposits"
  ADD CONSTRAINT "pix_deposits_gateway" CHECK ("gateway" IN ('MISTICPAY')),
  ADD CONSTRAINT "pix_deposits_destination" CHECK ("destination" IN ('LOTTERIES', 'GAMES')),
  ADD CONSTRAINT "pix_deposits_amount" CHECK ("amount_cents" BETWEEN 100 AND 1000000),
  ADD CONSTRAINT "pix_deposits_status" CHECK ("status" IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELED')),
  ADD CONSTRAINT "pix_deposits_paid_at" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL)),
  ADD CONSTRAINT "pix_deposits_provider_id_format" CHECK (
    "provider_transaction_id" IS NULL OR "provider_transaction_id" ~ '^[\x21-\x7e]{1,128}$'),
  ADD CONSTRAINT "pix_deposits_pix_code_format" CHECK (
    "pix_code" IS NULL OR (char_length("pix_code") BETWEEN 20 AND 1024 AND "pix_code" !~ '[[:cntrl:]]'));

CREATE FUNCTION "pix_deposits_guard"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'deposits are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'PAID' THEN
    RAISE EXCEPTION 'paid deposit is final' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."tenant_id" <> OLD."tenant_id" OR NEW."user_id" <> OLD."user_id" OR NEW."gateway" <> OLD."gateway"
     OR NEW."destination" <> OLD."destination" OR NEW."amount_cents" <> OLD."amount_cents"
     OR NEW."created_at" <> OLD."created_at" OR NEW."expires_at" <> OLD."expires_at"
     OR (OLD."provider_transaction_id" IS NOT NULL
         AND NEW."provider_transaction_id" IS DISTINCT FROM OLD."provider_transaction_id")
     OR (OLD."pix_code" IS NOT NULL AND NEW."pix_code" IS DISTINCT FROM OLD."pix_code") THEN
    RAISE EXCEPTION 'deposit identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pix_deposits_guard"
  BEFORE UPDATE OR DELETE ON "pix_deposits"
  FOR EACH ROW EXECUTE FUNCTION "pix_deposits_guard"();

-- Todo depósito nasce pendente, sem pagamento, sem dados do gateway e sem consulta (o Prisma envia os padrões).
CREATE FUNCTION "pix_deposits_new"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."status" <> 'PENDING' OR NEW."paid_at" IS NOT NULL OR NEW."provider_transaction_id" IS NOT NULL
     OR NEW."pix_code" IS NOT NULL OR NEW."last_checked_at" IS NOT NULL THEN
    RAISE EXCEPTION 'deposits start pending' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pix_deposits_new"
  BEFORE INSERT ON "pix_deposits"
  FOR EACH ROW EXECUTE FUNCTION "pix_deposits_new"();

ALTER TABLE "pix_deposits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pix_deposits" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pix_deposits_tenant_isolation" ON "pix_deposits"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- Aviso do gateway (webhook): chega sem banca, com o id do depósito no endereço (conferido pela API). Como no webhook
-- do cassino, uma policy extra libera SELECT de UMA linha, escolhida pelo valor que a transação informa
-- (app.pix_deposit); depois a mesma transação entra na banca do depósito.
CREATE POLICY "pix_deposits_webhook_lookup" ON "pix_deposits"
  FOR SELECT
  USING ("id"::text = NULLIF(current_setting('app.pix_deposit', true), ''));

-- ---------------------------------------------------------------------------
-- Movimentação DEPOSIT: uma por depósito (UNIQUE em pix_deposit_id), crédito em UMA bolsa de saldo (loterias ou games).
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN (
    'FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION', 'LOTTERY_BET',
    'LOTTERY_REFUND', 'COMMISSION_REVERSAL', 'PRIZE', 'CASINO', 'DEPOSIT'
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
    OR "kind" IN ('COMMISSION', 'COMMISSION_REVERSAL', 'LOTTERY_BET', 'LOTTERY_REFUND', 'PRIZE', 'CASINO', 'DEPOSIT')
  );

ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_deposit_rules" CHECK (
    ("kind" = 'DEPOSIT') = ("pix_deposit_id" IS NOT NULL)
    AND ("kind" <> 'DEPOSIT' OR (
          "prizes_jb_delta" = 0 AND "bonus_jb_delta" = 0 AND "prizes_games_delta" = 0
      AND "balance_jb_delta" >= 0 AND "balance_games_delta" >= 0
      AND (("balance_jb_delta" > 0)::int + ("balance_games_delta" > 0)::int) = 1
      AND "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "pule_prize_id" IS NULL AND "casino_transaction_id" IS NULL))
  );

-- ---------------------------------------------------------------------------
-- Gateways pelo painel: só Gerente ativo da banca corrente (operator_assert_manager, da migration
-- operator_management). Gravar com p_activate = true deixa este o único ativo da banca.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "payment_gateway_save"(
  p_actor uuid, p_gateway text, p_credentials bytea, p_hint text, p_activate boolean
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  IF p_activate THEN
    UPDATE "payment_gateways" SET "active" = false
     WHERE "tenant_id" = v_tenant AND "gateway" <> p_gateway AND "active";
  END IF;
  INSERT INTO "payment_gateways" ("tenant_id", "gateway", "credentials", "credentials_hint", "active", "updated_by",
                                  "updated_at")
  VALUES (v_tenant, p_gateway, p_credentials, p_hint, p_activate, p_actor, now())
  ON CONFLICT ("tenant_id", "gateway") DO UPDATE
    SET "credentials" = EXCLUDED."credentials",
        "credentials_hint" = EXCLUDED."credentials_hint",
        "active" = EXCLUDED."active" OR "payment_gateways"."active",
        "updated_by" = p_actor,
        "updated_at" = now();
END;
$$;

REVOKE ALL ON FUNCTION "payment_gateway_save"(uuid, text, bytea, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "payment_gateway_save"(uuid, text, bytea, text, boolean) TO "sysjb_app";

-- Ativa (o único da banca) ou desativa um gateway já configurado. Devolve false se ele não está configurado.
CREATE FUNCTION "payment_gateway_set_active"(p_actor uuid, p_gateway text, p_active boolean) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  IF NOT EXISTS (SELECT 1 FROM "payment_gateways" WHERE "tenant_id" = v_tenant AND "gateway" = p_gateway) THEN
    RETURN false;
  END IF;
  IF p_active THEN
    UPDATE "payment_gateways" SET "active" = false
     WHERE "tenant_id" = v_tenant AND "gateway" <> p_gateway AND "active";
  END IF;
  UPDATE "payment_gateways" SET "active" = p_active, "updated_by" = p_actor, "updated_at" = now()
   WHERE "tenant_id" = v_tenant AND "gateway" = p_gateway;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION "payment_gateway_set_active"(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "payment_gateway_set_active"(uuid, text, boolean) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Situação do depósito (banca corrente). Anexar a cobrança: uma vez, enquanto pendente. Encerrar sem pagamento
-- (EXPIRED/CANCELED): só de pendente (ou expirado -> cancelado). Devolvem false se não havia o que mudar.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_deposit_attach"(p_deposit uuid, p_provider_id text, p_pix_code text) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "pix_deposits"
     SET "provider_transaction_id" = p_provider_id, "pix_code" = p_pix_code, "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_deposit AND "status" = 'PENDING'
     AND "provider_transaction_id" IS NULL AND "pix_code" IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "pix_deposit_attach"(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_deposit_attach"(uuid, text, text) TO "sysjb_app";

CREATE FUNCTION "pix_deposit_close"(p_deposit uuid, p_status text) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('EXPIRED', 'CANCELED') THEN
    RAISE EXCEPTION 'invalid closing status' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "pix_deposits" SET "status" = p_status, "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_deposit
     AND ("status" = 'PENDING' OR ("status" = 'EXPIRED' AND p_status = 'CANCELED'));
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "pix_deposit_close"(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_deposit_close"(uuid, text) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Pagamento conferido no gateway (a API só chama depois de consultar a transação lá). Uma vez só: o depósito travado
-- serializa o aviso do gateway, a tela do jogador e a rodada automática; o segundo vê PAID e não credita de novo.
-- Pagamento depois do prazo (expirado/cancelado) ainda é creditado: o dinheiro chegou. O valor pago tem de ser
-- exatamente o do depósito (senão SJ011, sem crédito). Credita mesmo jogador bloqueado (o dinheiro é dele).
-- Devolve se foi aplicado agora. Depósito inexistente: no_data_found.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_deposit_confirm"(p_deposit uuid, p_paid_cents bigint) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_deposit "pix_deposits"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
  v_jb bigint := 0;
  v_games bigint := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_deposit FROM "pix_deposits" WHERE "tenant_id" = v_tenant AND "id" = p_deposit FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_deposit."status" = 'PAID' THEN
    RETURN false;
  END IF;
  IF p_paid_cents IS NULL OR p_paid_cents <> v_deposit."amount_cents" THEN
    RAISE EXCEPTION 'paid amount differs from the deposit' USING ERRCODE = 'SJ011';
  END IF;

  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = v_tenant AND "user_id" = v_deposit."user_id" FOR UPDATE;
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
  VALUES (v_tenant, v_deposit."user_id", 'DEPOSIT', v_jb, 0, v_games, v_deposit."id");
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION "pix_deposit_confirm"(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_deposit_confirm"(uuid, bigint) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Rodada automática (sem banca): depósitos pendentes a conferir no gateway, de todas as bancas. Só os criados há mais
-- de 1 minuto e há menos de 2 dias, não consultados nos últimos p_every_seconds; até p_limit por banca, os sem consulta
-- (ou consultados há mais tempo) primeiro. Roda como dona e entra em cada banca (o RLS forçado vale também para a
-- dona), com o contexto restaurado no fim.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_deposits_due"(p_limit integer, p_every_seconds integer)
  RETURNS TABLE ("id" uuid, "tenant_id" uuid)
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
      SELECT d."id", d."tenant_id"
        FROM "pix_deposits" d
       WHERE d."tenant_id" = v_tenant AND d."status" = 'PENDING'
         AND d."created_at" < now() - interval '1 minute' AND d."created_at" > now() - interval '2 days'
         AND (d."last_checked_at" IS NULL OR d."last_checked_at" < now() - make_interval(secs => p_every_seconds))
       ORDER BY d."last_checked_at" NULLS FIRST, d."created_at"
       LIMIT p_limit;
  END LOOP;
  PERFORM set_config('app.tenant_id', COALESCE(v_previous, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION "pix_deposits_due"(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_deposits_due"(integer, integer) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: lê gateways (grava só pelas funções); cria depósitos e marca a última consulta
-- (situação só pelas funções); lê tudo da própria banca.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "payment_gateways", "pix_deposits" FROM PUBLIC;
GRANT SELECT ON "payment_gateways" TO "sysjb_app";
GRANT SELECT ON "pix_deposits" TO "sysjb_app";
GRANT INSERT ("tenant_id", "user_id", "gateway", "destination", "amount_cents", "status", "expires_at", "created_at",
              "updated_at") ON "pix_deposits" TO "sysjb_app";
GRANT UPDATE ("last_checked_at") ON "pix_deposits" TO "sysjb_app";
