-- Comissão de Loterias e Fazendinha paga na hora da aposta (antes: fechamento mensal), cancelamento de pule de
-- Loterias até o horário limite (devolve a aposta e estorna a comissão) e % de cassino do promotor (o fechamento do
-- cassino continua mensal, sobre o GGR).
-- DDL gerado pelo Prisma; regras, RLS, funções, triggers e privilégios na segunda parte.

-- DropIndex
DROP INDEX "wallet_entries_tenant_id_lottery_ticket_id_key";

-- AlterTable
ALTER TABLE "lottery_tickets" ADD COLUMN     "canceled_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "casino_commission_bps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "bet_commission_id" UUID;

-- CreateTable
CREATE TABLE "bet_commissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bettor_id" UUID NOT NULL,
    "lottery_ticket_id" UUID,
    "fazendinha_bet_id" UUID,
    "wagered_cents" BIGINT NOT NULL,
    "referral_rate_bps" INTEGER NOT NULL,
    "promoter_rate_bps" INTEGER NOT NULL,
    "referral_cents" BIGINT NOT NULL,
    "promoter_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMPTZ(3),
    "reversed_cents" BIGINT,

    CONSTRAINT "bet_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bet_commissions_tenant_id_user_id_created_at_idx" ON "bet_commissions"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bet_commissions_tenant_id_id_key" ON "bet_commissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bet_commissions_tenant_id_lottery_ticket_id_key" ON "bet_commissions"("tenant_id", "lottery_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "bet_commissions_tenant_id_fazendinha_bet_id_key" ON "bet_commissions"("tenant_id", "fazendinha_bet_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_lottery_ticket_id_kind_key" ON "wallet_entries"("tenant_id", "lottery_ticket_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_bet_commission_id_kind_key" ON "wallet_entries"("tenant_id", "bet_commission_id", "kind");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_bet_commission_id_fkey" FOREIGN KEY ("tenant_id", "bet_commission_id") REFERENCES "bet_commissions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_commissions" ADD CONSTRAINT "bet_commissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_commissions" ADD CONSTRAINT "bet_commissions_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_commissions" ADD CONSTRAINT "bet_commissions_tenant_id_bettor_id_fkey" FOREIGN KEY ("tenant_id", "bettor_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_commissions" ADD CONSTRAINT "bet_commissions_tenant_id_lottery_ticket_id_fkey" FOREIGN KEY ("tenant_id", "lottery_ticket_id") REFERENCES "lottery_tickets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet_commissions" ADD CONSTRAINT "bet_commissions_tenant_id_fazendinha_bet_id_fkey" FOREIGN KEY ("tenant_id", "fazendinha_bet_id") REFERENCES "fazendinha_bets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- % de cassino do promotor: 0% a 100% do GGR mensal dos indicados. Quem não é promotor fica com 0.
-- ---------------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_casino_commission_range" CHECK ("casino_commission_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "users_casino_commission_promoter"
    CHECK ("promoter_commission_bps" IS NOT NULL OR "casino_commission_bps" = 0);

-- ---------------------------------------------------------------------------
-- Cancelamento do pule: só antes do horário limite (a função confere com o relógio do banco; o CHECK garante).
-- ---------------------------------------------------------------------------
ALTER TABLE "lottery_tickets"
  ADD CONSTRAINT "lottery_tickets_canceled_before_close" CHECK ("canceled_at" IS NULL OR "canceled_at" < "closes_at");

-- Pule cancelado nunca é premiado (a apuração, quando existir, não consegue gravar o prêmio).
CREATE FUNCTION "pule_prizes_not_canceled"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."game" = 'lotteries' AND EXISTS (
    SELECT 1 FROM "lottery_tickets" t
    WHERE t."tenant_id" = NEW."tenant_id" AND t."pule_number" = NEW."pule_number" AND t."canceled_at" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'canceled pule cannot be awarded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pule_prizes_not_canceled"
  BEFORE INSERT ON "pule_prizes"
  FOR EACH ROW EXECUTE FUNCTION "pule_prizes_not_canceled"();

-- ---------------------------------------------------------------------------
-- Comissões por aposta: valores coerentes, uma aposta só, estorno coerente (Fazendinha não é cancelável).
-- ---------------------------------------------------------------------------
ALTER TABLE "bet_commissions"
  ADD CONSTRAINT "bet_commissions_one_bet" CHECK (("lottery_ticket_id" IS NULL) <> ("fazendinha_bet_id" IS NULL)),
  ADD CONSTRAINT "bet_commissions_not_self" CHECK ("user_id" <> "bettor_id"),
  ADD CONSTRAINT "bet_commissions_rates_range" CHECK (
    "referral_rate_bps" BETWEEN 0 AND 10000 AND "promoter_rate_bps" BETWEEN 0 AND 10000
  ),
  ADD CONSTRAINT "bet_commissions_amounts" CHECK (
    "wagered_cents" > 0 AND "wagered_cents" <= 9007199254740991
    AND "referral_cents" >= 0 AND "promoter_cents" >= 0 AND "referral_cents" + "promoter_cents" > 0
  ),
  ADD CONSTRAINT "bet_commissions_reversal" CHECK (
    ("reversed_at" IS NULL) = ("reversed_cents" IS NULL)
    AND ("reversed_cents" IS NULL OR "reversed_cents" BETWEEN 0 AND "referral_cents" + "promoter_cents")
    AND ("reversed_at" IS NULL OR "lottery_ticket_id" IS NOT NULL)
  );

ALTER TABLE "bet_commissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bet_commissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bet_commissions_tenant_isolation" ON "bet_commissions"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Movimentações novas:
--   COMMISSION agora também vem de uma aposta (bet_commission_id), além do antigo fechamento (commission_payout_id).
--   COMMISSION_REVERSAL: estorno da comissão de um pule cancelado (sai do saldo e depois dos prêmios).
--   LOTTERY_REFUND: devolução de um pule cancelado (volta para as mesmas bolsas do débito).
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN (
    'FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION', 'LOTTERY_BET',
    'LOTTERY_REFUND', 'COMMISSION_REVERSAL'
  ));

ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_commission_rules",
  ADD CONSTRAINT "wallet_entries_commission_rules" CHECK (
    ("commission_payout_id" IS NULL OR "kind" = 'COMMISSION')
    AND ("bet_commission_id" IS NULL OR "kind" IN ('COMMISSION', 'COMMISSION_REVERSAL'))
    AND ("kind" NOT IN ('COMMISSION', 'COMMISSION_REVERSAL') OR (
          "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "bonus_jb_delta" = 0 AND "balance_games_delta" = 0))
    AND ("kind" <> 'COMMISSION' OR (
          ("commission_payout_id" IS NULL) <> ("bet_commission_id" IS NULL)
      AND "balance_jb_delta" > 0 AND "prizes_jb_delta" = 0))
    AND ("kind" <> 'COMMISSION_REVERSAL' OR (
          "bet_commission_id" IS NOT NULL
      AND "balance_jb_delta" <= 0 AND "prizes_jb_delta" <= 0 AND ("balance_jb_delta" + "prizes_jb_delta") < 0))
  );

ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_lottery_rules",
  ADD CONSTRAINT "wallet_entries_lottery_rules" CHECK (
    ("kind" IN ('LOTTERY_BET', 'LOTTERY_REFUND')) = ("lottery_ticket_id" IS NOT NULL)
    AND ("kind" NOT IN ('LOTTERY_BET', 'LOTTERY_REFUND') OR (
          "fazendinha_bet_id" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "operator_id" IS NULL AND "idempotency_key" IS NULL AND "bonus_jb_delta" = 0 AND "balance_games_delta" = 0))
    AND ("kind" <> 'LOTTERY_BET' OR (
          "balance_jb_delta" <= 0 AND "prizes_jb_delta" <= 0 AND ("balance_jb_delta" + "prizes_jb_delta") < 0))
    AND ("kind" <> 'LOTTERY_REFUND' OR (
          "balance_jb_delta" >= 0 AND "prizes_jb_delta" >= 0 AND ("balance_jb_delta" + "prizes_jb_delta") > 0))
  );

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
    OR "kind" IN ('COMMISSION', 'COMMISSION_REVERSAL', 'LOTTERY_BET', 'LOTTERY_REFUND')
  );

-- ---------------------------------------------------------------------------
-- Crédito da comissão de uma aposta, chamado pelos débitos (lottery_debit / fazendinha_debit) na mesma transação.
-- Quem indicou o apostador recebe, no Saldo, a % de indicação da banca + a de promotor (se for promotor), sobre o
-- valor apostado; cada parte arredondada para baixo no centavo (numeric: sem estouro de bigint). Quem indicou e está
-- BLOQUEADO não recebe; ganho zero não gera registro. Sem GRANT: só as funções de débito (donas) chamam.
-- Ordem das travas: carteira do apostador (no débito) e depois a de quem indicou — sempre "para cima" na cadeia de
-- indicação, que não tem ciclo (quem indica já existia antes), então duas apostas nunca se esperam em ciclo.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "bet_commission_credit"(
  p_tenant uuid, p_bettor uuid, p_wagered bigint, p_lottery_ticket uuid, p_fazendinha_bet uuid
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_referrer "users"%ROWTYPE;
  v_referral_rate integer;
  v_promoter_rate integer;
  v_referral bigint;
  v_promoter bigint;
  v_commission uuid;
BEGIN
  SELECT r.* INTO v_referrer
    FROM "users" b
    JOIN "users" r ON r."tenant_id" = b."tenant_id" AND r."id" = b."referred_by_user_id"
   WHERE b."tenant_id" = p_tenant AND b."id" = p_bettor;
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
                                 "wagered_cents", "referral_rate_bps", "promoter_rate_bps", "referral_cents",
                                 "promoter_cents")
  VALUES (p_tenant, v_referrer."id", p_bettor, p_lottery_ticket, p_fazendinha_bet, p_wagered, v_referral_rate,
          v_promoter_rate, v_referral, v_promoter)
  RETURNING "id" INTO v_commission;

  UPDATE "wallets" SET "balance_jb" = "balance_jb" + v_referral + v_promoter, "updated_at" = now()
   WHERE "tenant_id" = p_tenant AND "user_id" = v_referrer."id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                "bet_commission_id", "note")
  VALUES (p_tenant, v_referrer."id", 'COMMISSION', v_referral + v_promoter, 0, v_commission, 'Comissão de aposta');
END;
$$;

REVOKE ALL ON FUNCTION "bet_commission_credit"(uuid, uuid, bigint, uuid, uuid) FROM PUBLIC;

-- Débito do pule de Loterias + comissão de quem indicou (o resto igual à versão anterior).
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
  v_from_balance bigint;
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
  IF v_wallet."balance_jb" + v_wallet."prizes_jb" < v_ticket."total_cents" THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'SJ001';
  END IF;

  v_from_balance := LEAST(v_wallet."balance_jb", v_ticket."total_cents");
  UPDATE "wallets"
     SET "balance_jb" = "balance_jb" - v_from_balance,
         "prizes_jb"  = "prizes_jb" - (v_ticket."total_cents" - v_from_balance),
         "updated_at" = now()
   WHERE "id" = v_wallet."id";

  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "lottery_ticket_id")
  VALUES (v_tenant, v_ticket."user_id", 'LOTTERY_BET', -v_from_balance, -(v_ticket."total_cents" - v_from_balance),
          p_ticket_id);

  PERFORM "bet_commission_credit"(v_tenant, v_ticket."user_id", v_ticket."total_cents", p_ticket_id, NULL);
END;
$$;

-- Débito do pule da Fazendinha + comissão de quem indicou (o resto igual à versão anterior).
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
  v_from_balance bigint;
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
  IF v_wallet."balance_jb" + v_wallet."prizes_jb" < v_bet."total_cents" THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'SJ001';
  END IF;

  v_from_balance := LEAST(v_wallet."balance_jb", v_bet."total_cents");
  UPDATE "wallets"
     SET "balance_jb" = "balance_jb" - v_from_balance,
         "prizes_jb"  = "prizes_jb" - (v_bet."total_cents" - v_from_balance),
         "updated_at" = now()
   WHERE "id" = v_wallet."id";

  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "fazendinha_bet_id")
  VALUES (v_tenant, v_bet."user_id", 'FAZENDINHA_BET', -v_from_balance, -(v_bet."total_cents" - v_from_balance), p_bet_id);

  PERFORM "bet_commission_credit"(v_tenant, v_bet."user_id", v_bet."total_cents", NULL, p_bet_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancelamento de um pule de Loterias pelo próprio jogador, antes do horário limite: devolve a aposta para as
-- mesmas bolsas do débito e estorna a comissão de quem indicou (do saldo e depois dos prêmios dele; se ele já gastou,
-- volta o que houver e o restante fica registrado como não recuperado). Tudo numa transação, uma vez só.
-- Pule inexistente ou de outro jogador: no_data_found. Já cancelado: SJ005. Horário encerrado: SJ002.
-- Travas na mesma ordem da aposta: pule, carteira do apostador, carteira de quem indicou.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "lottery_cancel"(p_pule_number integer, p_user_id uuid) RETURNS uuid
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
         "updated_at" = now()
   WHERE "tenant_id" = v_tenant AND "user_id" = v_ticket."user_id";
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                "lottery_ticket_id", "note")
  VALUES (v_tenant, v_ticket."user_id", 'LOTTERY_REFUND', -v_debit."balance_jb_delta", -v_debit."prizes_jb_delta",
          v_ticket."id", 'Pule cancelado');

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

REVOKE ALL ON FUNCTION "lottery_cancel"(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "lottery_cancel"(integer, uuid) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- O fechamento mensal de comissões de Loterias/Fazendinha deixa de existir: pagaria de novo o que já foi pago na
-- aposta. Os fechamentos já feitos continuam nas tabelas, como histórico.
-- ---------------------------------------------------------------------------
DROP FUNCTION "commission_close_month"(date, uuid);
DROP FUNCTION "commission_month_totals"(date);

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime
--   bet_commissions: somente leitura (as funções gravam).
--   users.casino_commission_bps: o Gerente altera pela API (com auditoria), como a comissão de promotor.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "bet_commissions" FROM PUBLIC;
GRANT SELECT ON "bet_commissions" TO "sysjb_app";
GRANT UPDATE ("casino_commission_bps") ON "users" TO "sysjb_app";
