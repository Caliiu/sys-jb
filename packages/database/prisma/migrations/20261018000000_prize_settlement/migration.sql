-- Apuração de prêmios: confere cada pule (Loterias e Fazendinha) contra o resultado do sorteio ligado a ele, depois da
-- carência (o resultado precisa ficar alguns minutos sem correção), e paga o prêmio na bolsa de prêmios. A API calcula
-- (regras em @sysjb/contracts, settlement.ts); as funções daqui conferem tudo de novo e gravam, numa transação, a
-- apuração (pule_settlements), a pule premiada (pule_prizes) e o crédito (movimentação PRIZE), uma vez só por pule.
-- Correção do resultado depois da apuração não mexe no que foi pago: vira aviso para o operador (checked_*).
-- Também: venda recusada quando o resultado do sorteio já chegou, e a cotação da centena gravada na MILHAR E CENTENA.
-- DDL no formato do Prisma; regras, RLS, funções, triggers e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "lottery_ticket_items" ADD COLUMN     "centena_quote_cents" INTEGER;

-- AlterTable
ALTER TABLE "pule_prizes" ADD COLUMN     "items" JSONB;

-- AlterTable
ALTER TABLE "wallet_entries" ADD COLUMN     "pule_prize_id" UUID;

-- CreateTable
CREATE TABLE "pule_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game" TEXT NOT NULL,
    "pule_number" INTEGER NOT NULL,
    "lottery_ticket_id" UUID,
    "fazendinha_bet_id" UUID,
    "draw_date" DATE NOT NULL,
    "result_id" UUID NOT NULL,
    "settled_revision" INTEGER NOT NULL,
    "prize_cents" BIGINT NOT NULL,
    "settled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_revision" INTEGER NOT NULL,
    "checked_prize_cents" BIGINT NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pule_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pule_settlements_tenant_id_draw_date_idx" ON "pule_settlements"("tenant_id", "draw_date");

-- CreateIndex
CREATE INDEX "pule_settlements_result_id_idx" ON "pule_settlements"("result_id");

-- CreateIndex
CREATE UNIQUE INDEX "pule_settlements_tenant_id_game_pule_number_key" ON "pule_settlements"("tenant_id", "game", "pule_number");

-- CreateIndex
CREATE UNIQUE INDEX "pule_settlements_tenant_id_lottery_ticket_id_key" ON "pule_settlements"("tenant_id", "lottery_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "pule_settlements_tenant_id_fazendinha_bet_id_key" ON "pule_settlements"("tenant_id", "fazendinha_bet_id");

-- CreateIndex
CREATE UNIQUE INDEX "pule_prizes_tenant_id_id_key" ON "pule_prizes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_entries_tenant_id_pule_prize_id_key" ON "wallet_entries"("tenant_id", "pule_prize_id");

-- AddForeignKey
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_tenant_id_pule_prize_id_fkey" FOREIGN KEY ("tenant_id", "pule_prize_id") REFERENCES "pule_prizes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pule_settlements" ADD CONSTRAINT "pule_settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pule_settlements" ADD CONSTRAINT "pule_settlements_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pule_settlements" ADD CONSTRAINT "pule_settlements_tenant_id_lottery_ticket_id_fkey" FOREIGN KEY ("tenant_id", "lottery_ticket_id") REFERENCES "lottery_tickets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pule_settlements" ADD CONSTRAINT "pule_settlements_tenant_id_fazendinha_bet_id_fkey" FOREIGN KEY ("tenant_id", "fazendinha_bet_id") REFERENCES "fazendinha_bets"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pule_settlements" ADD CONSTRAINT "pule_settlements_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "lottery_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- MILHAR E CENTENA: a cotação do item é a soma das duas, e quem acerta só a centena recebe pela cotação dela. Os itens
-- já vendidos recebem a da tabela da venda, gravada no pule ("centena/1/milhar" em reais, ex.: 800/1/8000). O RLS
-- forçado é suspenso só aqui, para a dona enxergar todas as bancas; é restaurado logo abaixo.
-- ---------------------------------------------------------------------------
ALTER TABLE "lottery_ticket_items" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "lottery_tickets" NO FORCE ROW LEVEL SECURITY;

UPDATE "lottery_ticket_items" i
   SET "centena_quote_cents" = round(replace(split_part(t."quote_table", '/', 1), ',', '.')::numeric * 100)::integer
  FROM "lottery_tickets" t
 WHERE t."tenant_id" = i."tenant_id" AND t."id" = i."ticket_id" AND i."modality" = 'milhar_centena'
   AND t."quote_table" ~ '^[0-9]{1,7}(,[0-9]{1,2})?/1/[0-9]{1,7}(,[0-9]{1,2})?$';

-- Rótulo fora do formato (não deveria existir): a proporção da tabela padrão (centena = 1/11 da soma).
UPDATE "lottery_ticket_items"
   SET "centena_quote_cents" = GREATEST(1, "quote_cents" / 11)
 WHERE "modality" = 'milhar_centena'
   AND ("centena_quote_cents" IS NULL OR "centena_quote_cents" <= 0 OR "centena_quote_cents" >= "quote_cents");

ALTER TABLE "lottery_ticket_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lottery_tickets" FORCE ROW LEVEL SECURITY;

ALTER TABLE "lottery_ticket_items"
  ADD CONSTRAINT "lottery_ticket_items_centena_quote" CHECK (
    ("modality" = 'milhar_centena') = ("centena_quote_cents" IS NOT NULL)
    AND ("centena_quote_cents" IS NULL OR ("centena_quote_cents" > 0 AND "centena_quote_cents" < "quote_cents"))
  );

-- ---------------------------------------------------------------------------
-- Itens premiados de uma pule (pule_prizes.items): [{ "position", "guesses", "prizeCents" }], posições distintas de 1 a
-- 20, palpites só de dígitos e a soma igual ao prêmio. CHECK não aceita subconsulta: função IMMUTABLE. Cada campo é
-- conferido (formato antes de converter) num passo próprio, sem depender da ordem de avaliação de um OR.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pule_prize_items_valid"(p_items jsonb, p_total bigint) RETURNS boolean
  LANGUAGE plpgsql IMMUTABLE
  AS $$
DECLARE
  v_item jsonb;
  v_guess jsonb;
  v_position integer;
  v_positions integer[] := '{}';
  v_sum numeric := 0;
BEGIN
  IF p_items IS NULL OR p_total IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN
    RETURN false;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_item -> 'position') IS DISTINCT FROM 'number'
       OR (v_item ->> 'position') !~ '^([1-9]|1[0-9]|20)$' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_item -> 'prizeCents') IS DISTINCT FROM 'number'
       OR (v_item ->> 'prizeCents') !~ '^[1-9][0-9]{0,15}$' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_item -> 'guesses') IS DISTINCT FROM 'array' THEN
      RETURN false;
    END IF;
    IF jsonb_array_length(v_item -> 'guesses') NOT BETWEEN 1 AND 100 THEN
      RETURN false;
    END IF;
    FOR v_guess IN SELECT value FROM jsonb_array_elements(v_item -> 'guesses') LOOP
      IF jsonb_typeof(v_guess) IS DISTINCT FROM 'string' OR (v_guess #>> '{}') !~ '^[0-9]{1,20}$' THEN
        RETURN false;
      END IF;
    END LOOP;
    v_position := (v_item ->> 'position')::integer;
    IF v_position = ANY (v_positions) THEN
      RETURN false;
    END IF;
    v_positions := v_positions || v_position;
    v_sum := v_sum + (v_item ->> 'prizeCents')::numeric;
  END LOOP;
  RETURN v_sum = p_total;
END;
$$;

ALTER TABLE "pule_prizes"
  ADD CONSTRAINT "pule_prizes_items" CHECK ("items" IS NULL OR "pule_prize_items_valid"("items", "prize_cents"));

-- Pule premiada é somente inclusão, inclusive para a dona (TRUNCATE dos testes não dispara isto).
CREATE FUNCTION "pule_prizes_append_only"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'pule prizes are append-only' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "pule_prizes_append_only"
  BEFORE UPDATE OR DELETE ON "pule_prizes"
  FOR EACH ROW EXECUTE FUNCTION "pule_prizes_append_only"();

-- ---------------------------------------------------------------------------
-- Apuração de cada pule: uma por pule, do jogo certo, valores coerentes. A conferência com uma revisão nova só avança.
-- ---------------------------------------------------------------------------
ALTER TABLE "pule_settlements"
  ADD CONSTRAINT "pule_settlements_game" CHECK (
    ("game" = 'lotteries' AND "lottery_ticket_id" IS NOT NULL AND "fazendinha_bet_id" IS NULL)
    OR ("game" = 'fazendinha' AND "fazendinha_bet_id" IS NOT NULL AND "lottery_ticket_id" IS NULL)),
  ADD CONSTRAINT "pule_settlements_pule_number_positive" CHECK ("pule_number" > 0),
  ADD CONSTRAINT "pule_settlements_amounts" CHECK (
    "prize_cents" BETWEEN 0 AND 9007199254740991 AND "checked_prize_cents" BETWEEN 0 AND 9007199254740991),
  ADD CONSTRAINT "pule_settlements_revisions" CHECK ("settled_revision" >= 1 AND "checked_revision" >= "settled_revision");

-- O que foi apurado e pago não muda; só a conferência (checked_*) avança. Nada é apagado.
CREATE FUNCTION "pule_settlements_guard"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pule settlements cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW."id", NEW."tenant_id", NEW."user_id", NEW."game", NEW."pule_number", NEW."lottery_ticket_id",
      NEW."fazendinha_bet_id", NEW."draw_date", NEW."result_id", NEW."settled_revision", NEW."prize_cents",
      NEW."settled_at")
     IS DISTINCT FROM
     (OLD."id", OLD."tenant_id", OLD."user_id", OLD."game", OLD."pule_number", OLD."lottery_ticket_id",
      OLD."fazendinha_bet_id", OLD."draw_date", OLD."result_id", OLD."settled_revision", OLD."prize_cents",
      OLD."settled_at")
     OR NEW."checked_revision" <= OLD."checked_revision" THEN
    RAISE EXCEPTION 'pule settlement is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pule_settlements_guard"
  BEFORE UPDATE OR DELETE ON "pule_settlements"
  FOR EACH ROW EXECUTE FUNCTION "pule_settlements_guard"();

ALTER TABLE "pule_settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pule_settlements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pule_settlements_tenant_isolation" ON "pule_settlements"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Movimentação PRIZE: o prêmio de uma pule, na bolsa de prêmios, um por pule premiada (UNIQUE em pule_prize_id).
-- ---------------------------------------------------------------------------
ALTER TABLE "wallet_entries"
  DROP CONSTRAINT "wallet_entries_kind",
  ADD CONSTRAINT "wallet_entries_kind" CHECK ("kind" IN (
    'FAZENDINHA_BET', 'MANUAL_ADJUSTMENT', 'OPERATOR_CREDIT', 'OPENING_BALANCE', 'COMMISSION', 'LOTTERY_BET',
    'LOTTERY_REFUND', 'COMMISSION_REVERSAL', 'PRIZE'
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
    OR "kind" IN ('COMMISSION', 'COMMISSION_REVERSAL', 'LOTTERY_BET', 'LOTTERY_REFUND', 'PRIZE')
  );

ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_prize_rules" CHECK (
    ("kind" = 'PRIZE') = ("pule_prize_id" IS NOT NULL)
    AND ("kind" <> 'PRIZE' OR (
          "prizes_jb_delta" > 0 AND "balance_jb_delta" = 0 AND "bonus_jb_delta" = 0 AND "balance_games_delta" = 0
      AND "fazendinha_bet_id" IS NULL AND "lottery_ticket_id" IS NULL AND "operator_id" IS NULL
      AND "idempotency_key" IS NULL AND "commission_payout_id" IS NULL AND "bet_commission_id" IS NULL))
  );

-- ---------------------------------------------------------------------------
-- Venda: além do que já conferia, o resultado do sorteio na data não pode ter chegado (quem sabe o resultado não
-- aposta nele, mesmo com o horário de venda mal configurado). Resto igual à versão anterior.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "draw_for_sale"(p_tenant uuid, p_lottery text, p_hour integer, p_date date, p_game text)
  RETURNS timestamptz
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_draw "draws"%ROWTYPE;
  v_closes timestamptz;
BEGIN
  SELECT * INTO v_draw FROM "draws" WHERE "tenant_id" = p_tenant AND "name" = p_lottery FOR SHARE;
  IF NOT FOUND
     OR v_draw."draw_minutes" / 60 <> p_hour
     OR NOT (CASE p_game
               WHEN 'lotteries' THEN v_draw."lotteries"
               WHEN 'lotteries10' THEN v_draw."lotteries_10"
               WHEN 'fazendinha' THEN v_draw."fazendinha"
               ELSE false END)
     OR NOT "draw_runs_on"(v_draw, p_date) THEN
    RAISE EXCEPTION 'draw not for sale' USING ERRCODE = 'SJ002';
  END IF;

  v_closes := (p_date + make_interval(mins => v_draw."closes_minutes")) AT TIME ZONE 'America/Sao_Paulo';
  IF clock_timestamp() >= v_closes OR p_date > "brasilia_today"() + 6 THEN
    RAISE EXCEPTION 'draw closed' USING ERRCODE = 'SJ002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "lottery_results" r
    WHERE r."draw_date" = p_date AND r."lottery" = v_draw."result_lottery" AND r."extraction" = v_draw."result_extraction"
  ) THEN
    RAISE EXCEPTION 'draw result already known' USING ERRCODE = 'SJ002';
  END IF;
  RETURN v_closes;
END;
$$;

-- ---------------------------------------------------------------------------
-- Funções da apuração (SECURITY DEFINER, sujeitas ao RLS: só a banca do contexto). A role de runtime chama as três
-- públicas; as auxiliares não têm GRANT.
-- SQLSTATE SJ007: o resultado mudou desde a leitura (a API confere de novo na próxima rodada).
-- SQLSTATE SJ008: o pule não pode ser apurado com este resultado (outro sorteio/data, pule cancelado ou vendido depois
--                 de o resultado chegar).
-- ---------------------------------------------------------------------------

-- Posições de uma colocação ("p2_5" = 4; "p1_e_1_5" = 5).
CREATE FUNCTION "lottery_placement_size"(p_placement text) RETURNS integer
  LANGUAGE sql IMMUTABLE
  AS $$
  SELECT CASE
    WHEN p_placement = 'p1_e_1_5' THEN 5
    WHEN p_placement ~ '^p[0-9]{1,2}$' THEN 1
    WHEN p_placement ~ '^p[0-9]{1,2}_[0-9]{1,2}$' THEN
      GREATEST(0, split_part(substr(p_placement, 2), '_', 2)::integer - split_part(substr(p_placement, 2), '_', 1)::integer + 1)
    ELSE 0 END
$$;

-- Resultado que vale para o pule: o ligado ao sorteio da venda (nome + hora) na data do pule, na revisão informada,
-- recebido depois da venda. Trava o resultado e o sorteio (FOR SHARE) até o fim da transação.
CREATE FUNCTION "pule_settlement_result"(
  p_tenant uuid, p_lottery text, p_hour integer, p_date date, p_sold_at timestamptz, p_result_id uuid, p_revision integer
) RETURNS "lottery_results"
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_result "lottery_results"%ROWTYPE;
  v_draw "draws"%ROWTYPE;
BEGIN
  SELECT * INTO v_result FROM "lottery_results" WHERE "id" = p_result_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'result not found' USING ERRCODE = 'SJ008';
  END IF;
  SELECT * INTO v_draw FROM "draws"
   WHERE "tenant_id" = p_tenant AND "name" = p_lottery AND "draw_minutes" / 60 = p_hour
     FOR SHARE;
  IF NOT FOUND
     OR v_draw."result_lottery" IS DISTINCT FROM v_result."lottery"
     OR v_draw."result_extraction" IS DISTINCT FROM v_result."extraction"
     OR v_result."draw_date" <> p_date THEN
    RAISE EXCEPTION 'result is not the pule draw result' USING ERRCODE = 'SJ008';
  END IF;
  IF v_result."revision" <> p_revision THEN
    RAISE EXCEPTION 'result changed' USING ERRCODE = 'SJ007';
  END IF;
  IF p_sold_at >= v_result."received_at" THEN
    RAISE EXCEPTION 'pule sold after the result arrived' USING ERRCODE = 'SJ008';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION "pule_settlement_result"(uuid, text, integer, date, timestamptz, uuid, integer) FROM PUBLIC;

-- Prêmio de um pule de Loterias calculado pela API: zero sem itens, ou itens válidos (pule_prize_items_valid), cada um
-- um item do pule, com palpites dele e no máximo o "possível prêmio" do item × palpites premiados × posições da
-- colocação (um palpite ganha no máximo uma vez por posição). Fora disso, recusa.
CREATE FUNCTION "lottery_prize_within_limits"(p_tenant uuid, p_ticket_id uuid, p_prize bigint, p_items jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF p_prize IS NULL OR p_prize < 0 OR (p_prize = 0) <> (p_items IS NULL)
     OR (p_items IS NOT NULL AND NOT "pule_prize_items_valid"(p_items, p_prize)) THEN
    RAISE EXCEPTION 'invalid prize' USING ERRCODE = 'check_violation';
  END IF;
  IF p_items IS NOT NULL AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS e
    LEFT JOIN "lottery_ticket_items" i
      ON i."tenant_id" = p_tenant AND i."ticket_id" = p_ticket_id AND i."position" = (e ->> 'position')::smallint
    WHERE i."id" IS NULL
       OR NOT (ARRAY(SELECT jsonb_array_elements_text(e -> 'guesses')) <@ i."guesses")
       OR (e ->> 'prizeCents')::numeric
          > i."possible_prize_cents"::numeric * jsonb_array_length(e -> 'guesses') * "lottery_placement_size"(i."placement")
  ) THEN
    RAISE EXCEPTION 'prize above the pule limits' USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION "lottery_prize_within_limits"(uuid, uuid, bigint, jsonb) FROM PUBLIC;

-- Prêmio exato de um pule da Fazendinha: vale o 1º prêmio (milhar = 4 últimos dígitos; a Federal tem 5) e cada número
-- foi vendido uma vez, então ganha no máximo um, pelo prêmio gravado na compra.
CREATE FUNCTION "fazendinha_expected_prize"(p_tenant uuid, p_bet_id uuid, p_head text) RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_bet "fazendinha_bets"%ROWTYPE;
  v_tens integer := right(p_head, 2)::integer;
  v_number integer;
BEGIN
  SELECT * INTO v_bet FROM "fazendinha_bets" WHERE "tenant_id" = p_tenant AND "id" = p_bet_id;
  v_number := CASE v_bet."mode"
    WHEN 'GRUPO' THEN CASE WHEN v_tens = 0 THEN 25 ELSE (v_tens + 3) / 4 END
    WHEN 'DEZENA' THEN v_tens
    ELSE right(p_head, 3)::integer END;
  RETURN CASE WHEN EXISTS (
    SELECT 1 FROM "fazendinha_bet_numbers" n
    WHERE n."tenant_id" = p_tenant AND n."bet_id" = p_bet_id AND n."number" = v_number
  ) THEN v_bet."prize_cents"::bigint ELSE 0 END;
END;
$$;

REVOKE ALL ON FUNCTION "fazendinha_expected_prize"(uuid, uuid, text) FROM PUBLIC;

-- Grava a apuração do pule e, se premiado, a pule premiada e o crédito na bolsa de prêmios (movimentação PRIZE).
CREATE FUNCTION "pule_settlement_record"(
  p_tenant uuid, p_user uuid, p_game text, p_pule integer, p_ticket uuid, p_bet uuid, p_date date, p_lottery text,
  p_hour integer, p_code text, p_stake bigint, p_result uuid, p_revision integer, p_prize bigint, p_items jsonb
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_prize_id uuid;
BEGIN
  INSERT INTO "pule_settlements" ("tenant_id", "user_id", "game", "pule_number", "lottery_ticket_id", "fazendinha_bet_id",
                                  "draw_date", "result_id", "settled_revision", "prize_cents", "checked_revision",
                                  "checked_prize_cents")
  VALUES (p_tenant, p_user, p_game, p_pule, p_ticket, p_bet, p_date, p_result, p_revision, p_prize, p_revision, p_prize);

  IF p_prize = 0 THEN
    RETURN;
  END IF;

  INSERT INTO "pule_prizes" ("tenant_id", "user_id", "game", "pule_number", "draw_date", "lottery", "draw_hour",
                             "draw_code", "stake_cents", "prize_cents", "items")
  VALUES (p_tenant, p_user, p_game, p_pule, p_date, p_lottery, p_hour, p_code, p_stake, p_prize, p_items)
  RETURNING "id" INTO v_prize_id;

  UPDATE "wallets" SET "prizes_jb" = "prizes_jb" + p_prize, "updated_at" = now()
   WHERE "tenant_id" = p_tenant AND "user_id" = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "pule_prize_id",
                                "note")
  VALUES (p_tenant, p_user, 'PRIZE', 0, p_prize, v_prize_id, 'Prêmio');
END;
$$;

REVOKE ALL ON FUNCTION "pule_settlement_record"(uuid, uuid, text, integer, uuid, uuid, date, text, integer, text, bigint,
                                                uuid, integer, bigint, jsonb) FROM PUBLIC;

-- Apura um pule de Loterias com o prêmio calculado pela API (conferido contra os limites do pule). Devolve false se o
-- pule já estava apurado (nada muda). Travas na ordem: pule, resultado, sorteio, carteira.
CREATE FUNCTION "lottery_settle"(p_ticket_id uuid, p_result_id uuid, p_revision integer, p_prize bigint, p_items jsonb)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_ticket "lottery_tickets"%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_ticket FROM "lottery_tickets" WHERE "tenant_id" = v_tenant AND "id" = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM "pule_settlements" WHERE "tenant_id" = v_tenant AND "lottery_ticket_id" = p_ticket_id) THEN
    RETURN false;
  END IF;
  IF v_ticket."canceled_at" IS NOT NULL THEN
    RAISE EXCEPTION 'canceled pule cannot be settled' USING ERRCODE = 'SJ008';
  END IF;
  PERFORM "pule_settlement_result"(v_tenant, v_ticket."lottery", v_ticket."draw_hour", v_ticket."draw_date",
                                   v_ticket."created_at", p_result_id, p_revision);
  PERFORM "lottery_prize_within_limits"(v_tenant, p_ticket_id, p_prize, p_items);
  PERFORM "pule_settlement_record"(v_tenant, v_ticket."user_id", 'lotteries', v_ticket."pule_number", v_ticket."id",
                                   NULL, v_ticket."draw_date", v_ticket."lottery", v_ticket."draw_hour",
                                   v_ticket."draw_code", v_ticket."total_cents", p_result_id, p_revision, p_prize,
                                   p_items);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION "lottery_settle"(uuid, uuid, integer, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "lottery_settle"(uuid, uuid, integer, bigint, jsonb) TO "sysjb_app";

-- Apura um pule da Fazendinha. O prêmio da API tem de ser exatamente o que o banco calcula pelo 1º prêmio; os itens
-- são montados aqui. Devolve false se o pule já estava apurado.
CREATE FUNCTION "fazendinha_settle"(p_bet_id uuid, p_result_id uuid, p_revision integer, p_prize bigint)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_bet "fazendinha_bets"%ROWTYPE;
  v_result "lottery_results"%ROWTYPE;
  v_head text;
  v_items jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_bet FROM "fazendinha_bets" WHERE "tenant_id" = v_tenant AND "id" = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bet not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM "pule_settlements" WHERE "tenant_id" = v_tenant AND "fazendinha_bet_id" = p_bet_id) THEN
    RETURN false;
  END IF;
  v_result := "pule_settlement_result"(v_tenant, v_bet."lottery", v_bet."draw_hour", v_bet."draw_date",
                                       v_bet."created_at", p_result_id, p_revision);
  v_head := v_result."prizes"[1];
  IF p_prize IS DISTINCT FROM "fazendinha_expected_prize"(v_tenant, p_bet_id, v_head) THEN
    RAISE EXCEPTION 'fazendinha prize does not match the result' USING ERRCODE = 'check_violation';
  END IF;
  IF p_prize > 0 THEN
    v_items := jsonb_build_array(jsonb_build_object(
      'position', 1,
      'guesses', jsonb_build_array(CASE v_bet."mode"
        WHEN 'GRUPO' THEN lpad((CASE WHEN right(v_head, 2)::integer = 0 THEN 25
                                     ELSE (right(v_head, 2)::integer + 3) / 4 END)::text, 2, '0')
        WHEN 'DEZENA' THEN right(v_head, 2)
        ELSE right(v_head, 3) END),
      'prizeCents', p_prize));
  END IF;
  PERFORM "pule_settlement_record"(v_tenant, v_bet."user_id", 'fazendinha', v_bet."pule_number", NULL, v_bet."id",
                                   v_bet."draw_date", v_bet."lottery", v_bet."draw_hour", v_bet."draw_code",
                                   v_bet."total_cents", p_result_id, p_revision, p_prize, v_items);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION "fazendinha_settle"(uuid, uuid, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "fazendinha_settle"(uuid, uuid, integer, bigint) TO "sysjb_app";

-- Resultado corrigido depois da apuração: registra o prêmio pela revisão nova (o pago não muda). Só avança de revisão e
-- só com a revisão atual do resultado da apuração. Devolve false se não havia o que registrar.
CREATE FUNCTION "pule_settlement_check"(p_settlement_id uuid, p_revision integer, p_prize bigint, p_items jsonb)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_settlement "pule_settlements"%ROWTYPE;
  v_result "lottery_results"%ROWTYPE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_settlement FROM "pule_settlements" WHERE "tenant_id" = v_tenant AND "id" = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_settlement."checked_revision" >= p_revision THEN
    RETURN false;
  END IF;
  SELECT * INTO v_result FROM "lottery_results" WHERE "id" = v_settlement."result_id" FOR SHARE;
  IF v_result."revision" <> p_revision THEN
    RAISE EXCEPTION 'result changed' USING ERRCODE = 'SJ007';
  END IF;
  IF v_settlement."game" = 'lotteries' THEN
    PERFORM "lottery_prize_within_limits"(v_tenant, v_settlement."lottery_ticket_id", p_prize, p_items);
  ELSIF p_prize IS DISTINCT FROM "fazendinha_expected_prize"(v_tenant, v_settlement."fazendinha_bet_id",
                                                             v_result."prizes"[1]) THEN
    RAISE EXCEPTION 'fazendinha prize does not match the result' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE "pule_settlements"
     SET "checked_revision" = p_revision, "checked_prize_cents" = p_prize, "checked_at" = clock_timestamp()
   WHERE "id" = v_settlement."id";
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION "pule_settlement_check"(uuid, integer, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pule_settlement_check"(uuid, integer, bigint, jsonb) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: lê a apuração; grava só pelas funções acima. A venda grava a cotação da centena.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "pule_settlements" FROM PUBLIC;
GRANT SELECT ON "pule_settlements" TO "sysjb_app";
GRANT INSERT ("centena_quote_cents") ON "lottery_ticket_items" TO "sysjb_app";
