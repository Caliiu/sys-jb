-- Fechamento cassino (Relatórios > Cassino > Fechamento cassino): cada promotor recebe, no Saldo, a % de cassino dele
-- sobre o GGR (turnover − payout) dos indicados no mês (Brasília); GGR negativo paga 0 e promotor bloqueado não recebe.
-- O cálculo do mês é um só (casino_commission_month), usado pela tela e pelo pagamento. Pagamento só pelo Gerente, só
-- de mês encerrado (as rodadas de um mês encerrado não mudam: são gravadas com a hora do banco e somente inclusão), uma
-- vez por promotor e mês (UNIQUE + trava do mês), com a movimentação CASINO_COMMISSION na mesma transação.
-- SQLSTATEs: SJ004 mês ainda não terminou; SJ020 nada a pagar (já pago, zero ou bloqueado).
-- DDL no formato do Prisma; regras, RLS, funções e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "casino_commission_payout_id" UUID;

-- CreateTable
CREATE TABLE "casino_commission_payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "user_id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "turnover_cents" BIGINT NOT NULL,
    "payout_cents" BIGINT NOT NULL,
    "ggr_cents" BIGINT NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_commission_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "casino_commission_payouts_tenant_id_id_key" ON "casino_commission_payouts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "casino_commission_payouts_tenant_id_month_user_id_key" ON "casino_commission_payouts"("tenant_id", "month", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_casino_commission_payout_id_key" ON "wallet_entries"("tenant_id", "casino_commission_payout_id");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_casino_commission_payout_id_fkey" FOREIGN KEY ("tenant_id", "casino_commission_payout_id") REFERENCES "casino_commission_payouts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_commission_payouts" ADD CONSTRAINT "casino_commission_payouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_commission_payouts" ADD CONSTRAINT "casino_commission_payouts_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_commission_payouts" ADD CONSTRAINT "casino_commission_payouts_tenant_id_operator_id_fkey" FOREIGN KEY ("tenant_id", "operator_id") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Pagamentos: mês pelo primeiro dia, valores coerentes (GGR = turnover − payout; valor = % do GGR, arredondado para
-- baixo no centavo, maior que zero). Somente inclusão (nem a dona altera ou apaga).
-- ---------------------------------------------------------------------------
ALTER TABLE "casino_commission_payouts"
  ADD CONSTRAINT "casino_commission_payouts_month_first_day" CHECK ("month" = date_trunc('month', "month")::date),
  ADD CONSTRAINT "casino_commission_payouts_rate_range" CHECK ("rate_bps" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "casino_commission_payouts_amounts" CHECK (
    "turnover_cents" >= 0 AND "payout_cents" >= 0 AND "ggr_cents" = "turnover_cents" - "payout_cents"
    AND "ggr_cents" > 0
    AND "amount_cents" = floor("ggr_cents"::numeric * "rate_bps" / 10000)::bigint
    AND "amount_cents" BETWEEN 1 AND 9007199254740991);

CREATE FUNCTION "casino_commission_payouts_append_only"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'casino commission payouts are append-only' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "casino_commission_payouts_append_only"
  BEFORE UPDATE OR DELETE ON "casino_commission_payouts"
  FOR EACH ROW EXECUTE FUNCTION "casino_commission_payouts_append_only"();

ALTER TABLE "casino_commission_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "casino_commission_payouts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "casino_commission_payouts_tenant_isolation" ON "casino_commission_payouts"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Movimentação CASINO_COMMISSION: crédito no Saldo, ligado a um pagamento do fechamento cassino (um por pagamento).
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN (
    'FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION', 'LOTTERY_BET',
    'LOTTERY_REFUND', 'COMMISSION_REVERSAL', 'PRIZE', 'CASINO', 'DEPOSIT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND',
    'CASINO_COMMISSION'
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
                  'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'CASINO_COMMISSION')
  );

ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_casino_commission_rules" CHECK (
    ("kind" = 'CASINO_COMMISSION') = ("casino_commission_payout_id" IS NOT NULL)
    AND ("kind" <> 'CASINO_COMMISSION' OR (
          "balance_jb_delta" > 0 AND "prizes_jb_delta" = 0 AND "bonus_jb_delta" = 0
      AND "balance_games_delta" = 0 AND "prizes_games_delta" = 0
      AND "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL
      AND "pule_prize_id" IS NULL AND "casino_transaction_id" IS NULL AND "pix_deposit_id" IS NULL
      AND "pix_withdrawal_id" IS NULL))
  );

-- ---------------------------------------------------------------------------
-- Cálculo do mês na banca corrente (a tela e o pagamento usam o mesmo): para cada promotor (com ou sem movimento), o
-- turnover (apostado) e o payout (prêmios) das rodadas dos indicados dele no mês (Brasília, pela hora da rodada), o
-- GGR e a comissão = GGR x % de cassino vigente, arredondada para baixo no centavo (GGR negativo ou zero paga 0).
-- `active` = o promotor pode receber (não está bloqueado). SECURITY INVOKER: vale o RLS da banca corrente.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "casino_commission_month"(p_month date)
RETURNS TABLE (
  "user_id" uuid, "turnover_cents" bigint, "payout_cents" bigint, "ggr_cents" bigint, "rate_bps" integer,
  "amount_cents" bigint, "active" boolean
)
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
  AS $$
  WITH bounds AS (
    SELECT (date_trunc('month', p_month)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS start_at,
           ((date_trunc('month', p_month) + interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo') AS end_at
  ),
  played AS (
    SELECT u."referred_by_user_id" AS promoter, sum(t."bet_cents")::bigint AS turnover,
           sum(t."win_cents")::bigint AS payout
    FROM "casino_transactions" t
    JOIN "users" u ON u."tenant_id" = t."tenant_id" AND u."id" = t."user_id"
    CROSS JOIN bounds b
    WHERE t."tenant_id" = "app_current_tenant_id"()
      AND u."referred_by_user_id" IS NOT NULL
      AND t."created_at" >= b.start_at AND t."created_at" < b.end_at
    GROUP BY u."referred_by_user_id"
  )
  SELECT p."id",
         COALESCE(x.turnover, 0),
         COALESCE(x.payout, 0),
         COALESCE(x.turnover, 0) - COALESCE(x.payout, 0),
         p."casino_commission_bps",
         CASE WHEN COALESCE(x.turnover, 0) > COALESCE(x.payout, 0)
              THEN floor((x.turnover - x.payout)::numeric * p."casino_commission_bps" / 10000)::bigint
              ELSE 0 END,
         p."status" = 'ACTIVE'
  FROM "users" p
  LEFT JOIN played x ON x.promoter = p."id"
  WHERE p."tenant_id" = "app_current_tenant_id"() AND p."promoter_commission_bps" IS NOT NULL
$$;

REVOKE ALL ON FUNCTION "casino_commission_month"(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "casino_commission_month"(date) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Paga o fechamento cassino de um mês encerrado: um promotor (p_user) ou todos os pendentes (p_user NULL). Só o
-- Gerente ativo da banca. Paga quem tem comissão > 0, não está bloqueado e ainda não recebeu o mês; os valores vêm do
-- cálculo acima, nunca de quem chama. A trava do mês serializa pagamentos concorrentes (o segundo não acha mais nada a
-- pagar); o UNIQUE (banca, mês, promotor) é a última garantia. Devolve quem recebeu e quanto; nada a pagar = SJ020.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "casino_commission_pay"(p_actor uuid, p_month date, p_user uuid)
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

    UPDATE "wallets" SET "balance_jb" = "balance_jb" + r."amount_cents", "updated_at" = now()
     WHERE "tenant_id" = v_tenant AND "user_id" = r."user_id";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
    END IF;
    INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                  "casino_commission_payout_id", "note")
    VALUES (v_tenant, r."user_id", 'CASINO_COMMISSION', r."amount_cents", 0, v_payout,
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

REVOKE ALL ON FUNCTION "casino_commission_pay"(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "casino_commission_pay"(uuid, date, uuid) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: só lê os pagamentos (grava só a função acima).
-- ---------------------------------------------------------------------------
REVOKE ALL ON "casino_commission_payouts" FROM PUBLIC;
GRANT SELECT ON "casino_commission_payouts" TO "sysjb_app";
