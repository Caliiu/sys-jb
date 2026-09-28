-- Fazendinha: pules, números vendidos e movimentações da carteira (débito da compra).
-- DDL gerado pelo Prisma; constraints, RLS, função de débito, triggers e privilégios na segunda parte.
-- CreateEnum
CREATE TYPE "fazendinha_mode" AS ENUM ('GRUPO', 'DEZENA', 'CENTENA');

-- CreateTable
CREATE TABLE "fazendinha_bets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pule_number" SERIAL NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "draw_date" DATE NOT NULL,
    "lottery" TEXT NOT NULL,
    "draw_hour" SMALLINT NOT NULL,
    "mode" "fazendinha_mode" NOT NULL,
    "stake_cents" INTEGER NOT NULL,
    "multiplier" INTEGER NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fazendinha_bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fazendinha_bet_numbers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "bet_id" UUID NOT NULL,
    "draw_date" DATE NOT NULL,
    "lottery" TEXT NOT NULL,
    "draw_hour" SMALLINT NOT NULL,
    "mode" "fazendinha_mode" NOT NULL,
    "stake_cents" INTEGER NOT NULL,
    "number" SMALLINT NOT NULL,

    CONSTRAINT "fazendinha_bet_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "balance_jb_delta" BIGINT NOT NULL,
    "prizes_jb_delta" BIGINT NOT NULL,
    "fazendinha_bet_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fazendinha_bets_pule_number_key" ON "fazendinha_bets"("pule_number");

-- CreateIndex
CREATE INDEX "fazendinha_bets_tenant_id_user_id_created_at_idx" ON "fazendinha_bets"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "fazendinha_bets_tenant_id_id_key" ON "fazendinha_bets"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fazendinha_bets_tenant_id_user_id_idempotency_key_key" ON "fazendinha_bets"("tenant_id", "user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "fazendinha_bets_tenant_id_id_draw_date_lottery_draw_hour_mo_key" ON "fazendinha_bets"("tenant_id", "id", "draw_date", "lottery", "draw_hour", "mode", "stake_cents");

-- CreateIndex
CREATE INDEX "fazendinha_bet_numbers_tenant_id_bet_id_idx" ON "fazendinha_bet_numbers"("tenant_id", "bet_id");

-- CreateIndex
CREATE UNIQUE INDEX "fazendinha_bet_numbers_tenant_id_draw_date_lottery_draw_hou_key" ON "fazendinha_bet_numbers"("tenant_id", "draw_date", "lottery", "draw_hour", "mode", "stake_cents", "number");

-- CreateIndex
CREATE INDEX "wallet_entries_tenant_id_user_id_created_at_idx" ON "wallet_entries"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_fazendinha_bet_id_key" ON "wallet_entries"("tenant_id", "fazendinha_bet_id");

-- AddForeignKey
ALTER TABLE "fazendinha_bets" ADD CONSTRAINT "fazendinha_bets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazendinha_bets" ADD CONSTRAINT "fazendinha_bets_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazendinha_bet_numbers" ADD CONSTRAINT "fazendinha_bet_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazendinha_bet_numbers" ADD CONSTRAINT "fazendinha_bet_numbers_tenant_id_bet_id_draw_date_lottery__fkey" FOREIGN KEY ("tenant_id", "bet_id", "draw_date", "lottery", "draw_hour", "mode", "stake_cents") REFERENCES "fazendinha_bets"("tenant_id", "id", "draw_date", "lottery", "draw_hour", "mode", "stake_cents") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_fazendinha_bet_id_fkey" FOREIGN KEY ("tenant_id", "fazendinha_bet_id") REFERENCES "fazendinha_bets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Número do pule: sequence do PostgreSQL, 9 dígitos, lacunas aceitas. int4 é inteiro seguro em JSON.
-- ---------------------------------------------------------------------------
ALTER SEQUENCE "fazendinha_bets_pule_number_seq" START WITH 100000000 RESTART WITH 100000000;

-- ---------------------------------------------------------------------------
-- CHECK constraints (segunda linha de defesa; a API valida o catálogo antes)
-- ---------------------------------------------------------------------------
ALTER TABLE "fazendinha_bets"
  ADD CONSTRAINT "fazendinha_bets_lottery_length" CHECK (char_length("lottery") BETWEEN 1 AND 40),
  ADD CONSTRAINT "fazendinha_bets_draw_hour_range" CHECK ("draw_hour" BETWEEN 0 AND 23),
  ADD CONSTRAINT "fazendinha_bets_stake_positive" CHECK ("stake_cents" > 0),
  ADD CONSTRAINT "fazendinha_bets_multiplier_positive" CHECK ("multiplier" > 0),
  ADD CONSTRAINT "fazendinha_bets_total_range" CHECK ("total_cents" > 0 AND "total_cents" <= 9007199254740991);

ALTER TABLE "fazendinha_bet_numbers"
  ADD CONSTRAINT "fazendinha_bet_numbers_range" CHECK (
       ("mode" = 'GRUPO'   AND "number" BETWEEN 1 AND 25)
    OR ("mode" = 'DEZENA'  AND "number" BETWEEN 0 AND 99)
    OR ("mode" = 'CENTENA' AND "number" BETWEEN 0 AND 999)
  );

ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN ('FAZENDINHA_BET')),
  ADD CONSTRAINT "wallet_entries_fazendinha_debit" CHECK (
    "kind" <> 'FAZENDINHA_BET'
    OR ("fazendinha_bet_id" IS NOT NULL AND "balance_jb_delta" <= 0 AND "prizes_jb_delta" <= 0)
  );

-- ---------------------------------------------------------------------------
-- RLS: mesma regra das outras tabelas (banca corrente via app_current_tenant_id()).
-- ---------------------------------------------------------------------------
ALTER TABLE "fazendinha_bets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fazendinha_bets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fazendinha_bets_tenant_isolation" ON "fazendinha_bets"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "fazendinha_bet_numbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fazendinha_bet_numbers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fazendinha_bet_numbers_tenant_isolation" ON "fazendinha_bet_numbers"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "wallet_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wallet_entries_tenant_isolation" ON "wallet_entries"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Débito da compra. A role de runtime continua SEM UPDATE em wallets: o único jeito de reduzir saldo é
-- esta função, que só debita o total de um pule da banca corrente, uma única vez (UNIQUE em
-- wallet_entries), conferindo total = valor x quantidade de números. Tira primeiro do saldo e depois dos
-- prêmios; bônus não é usado. SECURITY DEFINER roda como a dona das tabelas, que também está sujeita ao
-- FORCE RLS: sem contexto de banca, nada é visto.
-- Saldo insuficiente: SQLSTATE SJ001 (a API traduz para INSUFFICIENT_FUNDS).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "fazendinha_debit"(p_bet_id uuid) RETURNS void
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
END;
$$;

REVOKE ALL ON FUNCTION "fazendinha_debit"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "fazendinha_debit"(uuid) TO "sysjb_app";

-- Todo pule precisa do débito correspondente até o fim da transação (trigger adiado): não existe pule
-- "de graça", mesmo que a aplicação esqueça de chamar fazendinha_debit.
CREATE FUNCTION "fazendinha_bets_require_debit"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "wallet_entries" e
    WHERE e."tenant_id" = NEW."tenant_id"
      AND e."fazendinha_bet_id" = NEW."id"
      AND -(e."balance_jb_delta" + e."prizes_jb_delta") = NEW."total_cents"
  ) THEN
    RAISE EXCEPTION 'fazendinha bet without matching debit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "fazendinha_bets_debit_required"
  AFTER INSERT ON "fazendinha_bets"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "fazendinha_bets_require_debit"();

-- Depois do débito, o pule está fechado: nenhum número novo entra nele.
CREATE FUNCTION "fazendinha_bet_numbers_before_debit"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "wallet_entries" e WHERE e."tenant_id" = NEW."tenant_id" AND e."fazendinha_bet_id" = NEW."bet_id"
  ) THEN
    RAISE EXCEPTION 'fazendinha bet already debited' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "fazendinha_bet_numbers_open_bet"
  BEFORE INSERT ON "fazendinha_bet_numbers"
  FOR EACH ROW EXECUTE FUNCTION "fazendinha_bet_numbers_before_debit"();

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: somente leitura e inclusão. Sem UPDATE/DELETE (pule é imutável) e sem
-- escrita em wallet_entries (só a função grava).
-- ---------------------------------------------------------------------------
REVOKE ALL ON "fazendinha_bets", "fazendinha_bet_numbers", "wallet_entries" FROM PUBLIC;

GRANT SELECT ON "fazendinha_bets" TO "sysjb_app";
GRANT INSERT ("tenant_id", "user_id", "idempotency_key", "draw_date", "lottery", "draw_hour", "mode", "stake_cents",
              "multiplier", "total_cents", "created_at") ON "fazendinha_bets" TO "sysjb_app";
GRANT USAGE ON SEQUENCE "fazendinha_bets_pule_number_seq" TO "sysjb_app";

GRANT SELECT ON "fazendinha_bet_numbers" TO "sysjb_app";
GRANT INSERT ("tenant_id", "bet_id", "draw_date", "lottery", "draw_hour", "mode", "stake_cents", "number")
  ON "fazendinha_bet_numbers" TO "sysjb_app";

GRANT SELECT ON "wallet_entries" TO "sysjb_app";
