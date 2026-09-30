-- Tradicional 1/10: mesmas modalidades e cotação da Tradicional (1/7), com colocações até o 10º prêmio, nos sorteios
-- marcados para ela no cadastro (loterias oficiais de 10 prêmios: BAHIA e LOTECE/LOTEP no cadastro padrão; um sorteio
-- pode valer para os dois jogos). O pule grava o jogo; a venda confere sorteio e colocação pelo jogo.
-- DDL no formato do Prisma; regras, dados, funções e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "lottery_tickets" ADD COLUMN     "game" TEXT NOT NULL DEFAULT 'tradicional';

-- AlterTable
ALTER TABLE "draws" ADD COLUMN     "lotteries_10" BOOLEAN NOT NULL DEFAULT false;


ALTER TABLE "lottery_tickets"
  ADD CONSTRAINT "lottery_tickets_game" CHECK ("game" IN ('tradicional', 'tradicional_10'));

ALTER TABLE "draws"
  DROP CONSTRAINT "draws_some_game",
  ADD CONSTRAINT "draws_some_game" CHECK ("lotteries" OR "lotteries_10" OR "fazendinha");

-- ---------------------------------------------------------------------------
-- Colocações de cada jogo (mesma lista de @sysjb/contracts, LOTTERY_GAME_PLACEMENTS; um teste confere as duas).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "lottery_placement_allowed"(p_game text, p_placement text) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$
  SELECT p_placement = ANY (CASE p_game
    WHEN 'tradicional' THEN ARRAY[
      'p1', 'p1_5', 'p1_e_1_5', 'p2', 'p3', 'p4', 'p5', 'p6', 'p1_2', 'p1_3', 'p1_4', 'p1_6', 'p2_3', 'p2_4', 'p2_5',
      'p2_6', 'p3_4', 'p3_5', 'p3_6', 'p4_5', 'p4_6', 'p5_6']
    WHEN 'tradicional_10' THEN ARRAY[
      'p1', 'p1_5', 'p1_10', 'p1_e_1_5', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p1_2', 'p1_3', 'p1_4',
      'p1_6', 'p1_7', 'p1_8', 'p1_9', 'p2_3', 'p2_4', 'p2_5', 'p2_6', 'p2_7', 'p2_8', 'p2_9', 'p2_10', 'p3_4', 'p3_5',
      'p3_6', 'p3_7', 'p3_8', 'p3_9', 'p3_10', 'p4_5', 'p4_6', 'p4_7', 'p4_8', 'p4_9', 'p4_10', 'p5_6', 'p5_7', 'p5_8',
      'p5_9', 'p5_10', 'p6_7', 'p6_8', 'p6_10', 'p7_8', 'p7_9', 'p7_10', 'p8_9', 'p8_10', 'p9_10']
    ELSE ARRAY[]::text[] END)
$$;

-- Item novo: a colocação tem de ser do jogo do pule (a API confere antes; aqui é a segunda linha de defesa).
CREATE FUNCTION "lottery_ticket_items_placement_game"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_game text;
BEGIN
  SELECT "game" INTO v_game FROM "lottery_tickets" WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."ticket_id";
  IF v_game IS NULL OR NOT "lottery_placement_allowed"(v_game, NEW."placement") THEN
    RAISE EXCEPTION 'placement not allowed for the lottery game' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "lottery_ticket_items_placement_game"
  BEFORE INSERT ON "lottery_ticket_items"
  FOR EACH ROW EXECUTE FUNCTION "lottery_ticket_items_placement_game"();

-- ---------------------------------------------------------------------------
-- Venda: o sorteio precisa valer para o jogo do pule ("lotteries" = 1/7, "lotteries10" = 1/10). Resto igual.
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
  RETURN v_closes;
END;
$$;

-- Jogo do cadastro de sorteios de um pule de loterias.
CREATE FUNCTION "lottery_ticket_draw_game"(p_game text) RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT CASE p_game WHEN 'tradicional_10' THEN 'lotteries10' ELSE 'lotteries' END $$;

-- O horário limite e o código gravados no pule são sempre os do cadastro (o que a API mandou é ignorado).
CREATE OR REPLACE FUNCTION "lottery_tickets_draw_open"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW."closes_at" := "draw_for_sale"(NEW."tenant_id", NEW."lottery", NEW."draw_hour", NEW."draw_date",
                                     "lottery_ticket_draw_game"(NEW."game"));
  NEW."draw_code" := (SELECT "code" FROM "draws" WHERE "tenant_id" = NEW."tenant_id" AND "name" = NEW."lottery");
  RETURN NEW;
END;
$$;

-- Trava de apostas vendidas: cada pule de loterias confere o jogo dele (1/7 ou 1/10).
CREATE OR REPLACE FUNCTION "draw_orphans_bets"(p_draw "draws") RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM "fazendinha_bets" b
    WHERE b."tenant_id" = p_draw."tenant_id" AND b."lottery" = p_draw."name"
      AND b."draw_hour" = p_draw."draw_minutes" / 60 AND b."draw_date" >= "brasilia_today"()
      AND NOT (p_draw."fazendinha" AND "draw_runs_on"(p_draw, b."draw_date"))
  ) OR EXISTS (
    SELECT 1 FROM "lottery_tickets" t
    WHERE t."tenant_id" = p_draw."tenant_id" AND t."lottery" = p_draw."name"
      AND t."draw_hour" = p_draw."draw_minutes" / 60 AND t."draw_date" >= "brasilia_today"()
      AND NOT ((CASE t."game" WHEN 'tradicional_10' THEN p_draw."lotteries_10" ELSE p_draw."lotteries" END)
               AND "draw_runs_on"(p_draw, t."draw_date"))
  )
$$;

-- ---------------------------------------------------------------------------
-- Cadastro padrão: BAHIA e LOTECE/LOTEP valem também para a 1/10. Só em banca sem nenhum sorteio da 1/10 marcado
-- (não mexe no que o painel já definiu).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "draws_seed_default_games"(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_previous text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  IF NOT EXISTS (SELECT 1 FROM "draws" WHERE "tenant_id" = p_tenant AND "lotteries_10") THEN
    UPDATE "draws" SET "lotteries_10" = true
    WHERE "tenant_id" = p_tenant AND "group_name" IN ('BAHIA', 'LOTECE/LOTEP');
  END IF;
  PERFORM set_config('app.tenant_id', COALESCE(v_previous, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION "draws_seed_default_games"(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION "draws_seed_defaults"(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM "draws_seed_default_rows"(p_tenant);
  PERFORM "draws_seed_default_results"(p_tenant);
  PERFORM "draws_seed_default_games"(p_tenant);
END;
$$;

-- Bancas existentes.
SELECT "draws_seed_default_games"("id") FROM "tenants";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: o painel marca o jogo no sorteio; a venda grava o jogo no pule (sem UPDATE).
-- ---------------------------------------------------------------------------
GRANT INSERT ("lotteries_10") ON "draws" TO "sysjb_app";
GRANT UPDATE ("lotteries_10") ON "draws" TO "sysjb_app";
GRANT INSERT ("game") ON "lottery_tickets" TO "sysjb_app";
