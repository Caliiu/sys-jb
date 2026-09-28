-- Cadastro de sorteios por banca (uma lista para Loterias e Fazendinha) e exceções de data (feriado/cancelado/
-- extra). A venda passa a ser conferida contra o cadastro: o trigger de cada jogo procura o sorteio, confere
-- ativo, jogo, dia (semana + exceções) e horário limite. Alterações que deixariam apostas vendidas sem sorteio
-- são recusadas (SQLSTATE SJ005); o estorno vem junto com a apuração de resultados.
-- DDL no formato do Prisma; regras, RLS, funções, triggers, padrão e privilégios na segunda parte.

-- CreateTable
CREATE TABLE "draws" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "group_name" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "draw_minutes" SMALLINT NOT NULL,
    "closes_minutes" SMALLINT NOT NULL,
    "weekdays" SMALLINT[],
    "lotteries" BOOLEAN NOT NULL DEFAULT true,
    "fazendinha" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draw_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "draw_id" UUID,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draw_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draws_tenant_id_id_key" ON "draws"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "draws_tenant_id_name_key" ON "draws"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "draws_tenant_id_sort_order_idx" ON "draws"("tenant_id", "sort_order");

-- CreateIndex
CREATE INDEX "draw_exceptions_tenant_id_date_idx" ON "draw_exceptions"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "fazendinha_bets_tenant_id_lottery_draw_hour_draw_date_idx" ON "fazendinha_bets"("tenant_id", "lottery", "draw_hour", "draw_date");

-- CreateIndex
CREATE INDEX "lottery_tickets_tenant_id_lottery_draw_hour_draw_date_idx" ON "lottery_tickets"("tenant_id", "lottery", "draw_hour", "draw_date");

-- AddForeignKey
ALTER TABLE "draws" ADD CONSTRAINT "draws_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_exceptions" ADD CONSTRAINT "draw_exceptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_exceptions" ADD CONSTRAINT "draw_exceptions_tenant_id_draw_id_fkey" FOREIGN KEY ("tenant_id", "draw_id") REFERENCES "draws"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- CHECKs (a API valida antes; aqui é a segunda linha de defesa)
-- ---------------------------------------------------------------------------
-- Dias da semana: pelo menos um, todos de 0 a 6, sem repetição (CHECK não aceita subconsulta).
CREATE FUNCTION "weekdays_valid"(p_days smallint[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$
  SELECT cardinality(p_days) BETWEEN 1 AND 7
     AND array_position(p_days, NULL) IS NULL
     AND p_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
     AND cardinality(p_days) = (SELECT count(DISTINCT d) FROM unnest(p_days) AS d)
$$;

ALTER TABLE "draws"
  ALTER COLUMN "weekdays" SET NOT NULL,
  ADD CONSTRAINT "draws_group_name_length" CHECK (char_length(btrim("group_name")) BETWEEN 1 AND 30),
  ADD CONSTRAINT "draws_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 40 AND "name" = btrim("name")),
  ADD CONSTRAINT "draws_minutes_range" CHECK (
    "draw_minutes" BETWEEN 0 AND 1439 AND "closes_minutes" BETWEEN 0 AND 1439 AND "closes_minutes" <= "draw_minutes"
  ),
  ADD CONSTRAINT "draws_weekdays_valid" CHECK ("weekdays_valid"("weekdays")),
  ADD CONSTRAINT "draws_some_game" CHECK ("lotteries" OR "fazendinha"),
  ADD CONSTRAINT "draws_sort_order_range" CHECK ("sort_order" BETWEEN 0 AND 100000);

ALTER TABLE "draw_exceptions"
  ADD CONSTRAINT "draw_exceptions_kind" CHECK ("kind" IN ('CANCEL', 'EXTRA')),
  -- Extra é sempre de um sorteio; cancelamento sem sorteio = o dia todo (feriado).
  ADD CONSTRAINT "draw_exceptions_extra_has_draw" CHECK ("kind" <> 'EXTRA' OR "draw_id" IS NOT NULL),
  ADD CONSTRAINT "draw_exceptions_note_length" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 80);

-- Uma exceção por data e sorteio (e uma "dia todo" por data).
CREATE UNIQUE INDEX "draw_exceptions_tenant_date_draw_key"
  ON "draw_exceptions" ("tenant_id", "date", "draw_id") NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE "draws" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "draws" FORCE ROW LEVEL SECURITY;
CREATE POLICY "draws_tenant_isolation" ON "draws"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "draw_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "draw_exceptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "draw_exceptions_tenant_isolation" ON "draw_exceptions"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Regras de calendário
-- ---------------------------------------------------------------------------

-- Hoje em Brasília.
CREATE FUNCTION "brasilia_today"() RETURNS date
  LANGUAGE sql VOLATILE
  AS $$ SELECT (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- O sorteio corre na data: ativo, sem cancelamento (dele ou do dia todo) e no dia da semana ou com extra.
CREATE FUNCTION "draw_runs_on"(p_draw "draws", p_date date) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
  SELECT p_draw."active"
     AND NOT EXISTS (
       SELECT 1 FROM "draw_exceptions" e
       WHERE e."tenant_id" = p_draw."tenant_id" AND e."date" = p_date AND e."kind" = 'CANCEL'
         AND (e."draw_id" IS NULL OR e."draw_id" = p_draw."id"))
     AND (extract(dow FROM p_date)::smallint = ANY (p_draw."weekdays")
          OR EXISTS (
            SELECT 1 FROM "draw_exceptions" e
            WHERE e."tenant_id" = p_draw."tenant_id" AND e."date" = p_date AND e."kind" = 'EXTRA'
              AND e."draw_id" = p_draw."id"))
$$;

-- Há apostas vendidas (de hoje em diante) que deixariam de ter sorteio com o cadastro como está agora.
CREATE FUNCTION "draw_orphans_bets"(p_draw "draws") RETURNS boolean
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
      AND NOT (p_draw."lotteries" AND "draw_runs_on"(p_draw, t."draw_date"))
  )
$$;

-- Alguma aposta (de qualquer data) já foi vendida com este nome e hora.
CREATE FUNCTION "draw_has_bets"(p_tenant uuid, p_name text, p_hour integer) RETURNS boolean
  LANGUAGE sql STABLE
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM "fazendinha_bets" b WHERE b."tenant_id" = p_tenant AND b."lottery" = p_name AND b."draw_hour" = p_hour
  ) OR EXISTS (
    SELECT 1 FROM "lottery_tickets" t WHERE t."tenant_id" = p_tenant AND t."lottery" = p_name AND t."draw_hour" = p_hour
  )
$$;

-- ---------------------------------------------------------------------------
-- Venda: o sorteio precisa existir, estar ativo, valer para o jogo, correr na data e estar antes do horário
-- limite (e a data dentro da janela de 6 dias). Devolve o horário limite. SQLSTATE SJ002 (DRAW_CLOSED).
-- FOR SHARE: uma alteração do cadastro espera a compra terminar (e vice-versa), então a trava de apostas
-- vendidas enxerga sempre a compra concorrente.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "draw_for_sale"(p_tenant uuid, p_lottery text, p_hour integer, p_date date, p_game text)
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
     OR NOT (CASE p_game WHEN 'lotteries' THEN v_draw."lotteries" WHEN 'fazendinha' THEN v_draw."fazendinha" ELSE false END)
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

CREATE OR REPLACE FUNCTION "fazendinha_bets_draw_open"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM "draw_for_sale"(NEW."tenant_id", NEW."lottery", NEW."draw_hour", NEW."draw_date", 'fazendinha');
  RETURN NEW;
END;
$$;

-- O horário limite gravado no pule é sempre o do cadastro (o que a API mandou é ignorado).
CREATE OR REPLACE FUNCTION "lottery_tickets_draw_open"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW."closes_at" := "draw_for_sale"(NEW."tenant_id", NEW."lottery", NEW."draw_hour", NEW."draw_date", 'lotteries');
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trava de apostas vendidas (SQLSTATE SJ005):
-- - trocar nome/hora ou excluir: só se nunca houve aposta com esse nome e hora;
-- - desativar, tirar um jogo, tirar dias: só se nenhuma aposta de hoje em diante ficar sem sorteio.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "draws_guard_bets"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."name" <> NEW."name" OR OLD."draw_minutes" / 60 <> NEW."draw_minutes" / 60 THEN
    IF "draw_has_bets"(OLD."tenant_id", OLD."name", OLD."draw_minutes" / 60) THEN
      RAISE EXCEPTION 'draw has bets' USING ERRCODE = 'SJ005';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND "draw_orphans_bets"(NEW) THEN
    RAISE EXCEPTION 'draw has open bets' USING ERRCODE = 'SJ005';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "draws_guard_bets"
  AFTER UPDATE OR DELETE ON "draws"
  FOR EACH ROW EXECUTE FUNCTION "draws_guard_bets"();

-- Exceções: trava os sorteios afetados (espera compras em andamento) e confere as apostas.
CREATE FUNCTION "draw_exceptions_guard_bets"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_row "draw_exceptions"%ROWTYPE;
  v_draw "draws"%ROWTYPE;
BEGIN
  FOREACH v_row IN ARRAY (CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW] WHEN 'DELETE' THEN ARRAY[OLD] ELSE ARRAY[OLD, NEW] END)
  LOOP
    FOR v_draw IN
      SELECT * FROM "draws" d
      WHERE d."tenant_id" = v_row."tenant_id" AND (v_row."draw_id" IS NULL OR d."id" = v_row."draw_id")
      ORDER BY d."id"
      FOR UPDATE
    LOOP
      IF "draw_orphans_bets"(v_draw) THEN
        RAISE EXCEPTION 'draw exception orphans bets' USING ERRCODE = 'SJ005';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "draw_exceptions_guard_bets"
  AFTER INSERT OR UPDATE OR DELETE ON "draw_exceptions"
  FOR EACH ROW EXECUTE FUNCTION "draw_exceptions_guard_bets"();

-- ---------------------------------------------------------------------------
-- Cadastro padrão (base enviada pela operação). Horário do sorteio: a hora cheia do nome, ou 2 minutos
-- depois do limite de venda quando ele passa da hora cheia. Federal: quartas e domingos.
-- Roda como dona da tabela e com o contexto da banca (FORCE RLS vale também para ela); só semeia banca
-- sem nenhum sorteio.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "draws_seed_defaults"(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_previous text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  IF NOT EXISTS (SELECT 1 FROM "draws" WHERE "tenant_id" = p_tenant) THEN
    INSERT INTO "draws" ("tenant_id", "sort_order", "group_name", "name", "draw_minutes", "closes_minutes", "weekdays")
    SELECT p_tenant, v.ord, v.grp, v.name,
           CASE WHEN v.hh * 60 >= v.closes THEN v.hh * 60 ELSE v.closes + 2 END,
           v.closes,
           CASE WHEN v.name LIKE '%FEDERAL%' THEN ARRAY[0, 3]::smallint[] ELSE ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[] END
    FROM (VALUES
      (10,  'RIO/FEDERAL',  'LT PT RIO 09HS',       9,  9 * 60 + 18),
      (20,  'RIO/FEDERAL',  'LT PT RIO 11HS',       11, 11 * 60 + 18),
      (30,  'RIO/FEDERAL',  'LT PT RIO 14HS',       14, 14 * 60 + 18),
      (40,  'RIO/FEDERAL',  'LT PT RIO 16HS',       16, 16 * 60 + 18),
      (50,  'RIO/FEDERAL',  'LT FEDERAL',           20, 19 * 60 + 58),
      (60,  'RIO/FEDERAL',  'LT PT RIO 21HS',       21, 21 * 60 + 18),
      (110, 'MALUQUINHA',   'LT MALUQ RIO 09HS',    9,  9 * 60 + 18),
      (120, 'MALUQUINHA',   'LT MALUQ RIO 11HS',    11, 11 * 60 + 18),
      (130, 'MALUQUINHA',   'LT MALUQ RIO 14HS',    14, 14 * 60 + 18),
      (140, 'MALUQUINHA',   'LT MALUQ RIO 16HS',    16, 16 * 60 + 18),
      (150, 'MALUQUINHA',   'LT MALUQ FEDERAL',     20, 19 * 60 + 58),
      (160, 'MALUQUINHA',   'LT MALUQ RIO 21HS',    21, 21 * 60 + 18),
      (210, 'NACIONAL',     'LT NACIONAL 02HS',     2,  1 * 60 + 57),
      (220, 'NACIONAL',     'LT NACIONAL 08HS',     8,  7 * 60 + 57),
      (230, 'NACIONAL',     'LT NACIONAL 10HS',     10, 9 * 60 + 57),
      (240, 'NACIONAL',     'LT NACIONAL 12HS',     12, 11 * 60 + 57),
      (250, 'NACIONAL',     'LT NACIONAL 15HS',     15, 14 * 60 + 57),
      (260, 'NACIONAL',     'LT NACIONAL 17HS',     17, 16 * 60 + 57),
      (270, 'NACIONAL',     'LT NACIONAL 21HS',     21, 20 * 60 + 57),
      (280, 'NACIONAL',     'LT NACIONAL 23HS',     23, 22 * 60 + 57),
      (310, 'LOOK/GOIAS',   'LT LOOK 07HS',         7,  7 * 60 + 18),
      (320, 'LOOK/GOIAS',   'LT BOASORTE 09HS',     9,  9 * 60 + 10),
      (330, 'LOOK/GOIAS',   'LT LOOK 09HS',         9,  9 * 60 + 18),
      (340, 'LOOK/GOIAS',   'LT BOASORTE 11HS',     11, 11 * 60 + 10),
      (350, 'LOOK/GOIAS',   'LT LOOK 11HS',         11, 11 * 60 + 18),
      (360, 'LOOK/GOIAS',   'LT BOASORTE 14HS',     14, 14 * 60 + 10),
      (370, 'LOOK/GOIAS',   'LT LOOK 14HS',         14, 14 * 60 + 18),
      (380, 'LOOK/GOIAS',   'LT BOASORTE 16HS',     16, 16 * 60 + 10),
      (390, 'LOOK/GOIAS',   'LT LOOK 16HS',         16, 16 * 60 + 18),
      (400, 'LOOK/GOIAS',   'LT BOASORTE 18HS',     18, 18 * 60 + 10),
      (410, 'LOOK/GOIAS',   'LT LOOK 18HS',         18, 18 * 60 + 18),
      (420, 'LOOK/GOIAS',   'LT BOASORTE 21HS',     21, 21 * 60 + 10),
      (430, 'LOOK/GOIAS',   'LT LOOK 21HS',         21, 21 * 60 + 18),
      (440, 'LOOK/GOIAS',   'LT LOOK 23HS',         23, 23 * 60 + 18),
      (510, 'SAO-PAULO',    'PT SP 08HS',           8,  8 * 60 + 15),
      (520, 'SAO-PAULO',    'PT SP 10HS',           10, 10 * 60 + 15),
      (530, 'SAO-PAULO',    'PT SP 12HS',           12, 12 * 60 + 15),
      (540, 'SAO-PAULO',    'PT SP 13HS',           13, 13 * 60 + 15),
      (550, 'SAO-PAULO',    'LT BAND 15HS',         15, 15 * 60 + 15),
      (560, 'SAO-PAULO',    'PT SP 17HS',           17, 17 * 60 + 15),
      (570, 'SAO-PAULO',    'PT SP 19HS',           19, 19 * 60 + 15),
      (610, 'LOTECE/LOTEP', 'LT LOTEP 09HS',        9,  9 * 60 + 30),
      (620, 'LOTECE/LOTEP', 'LT LOTECE 10HS',       10, 10 * 60 + 20),
      (630, 'LOTECE/LOTEP', 'LT LOTEP 10HS',        10, 10 * 60 + 30),
      (640, 'LOTECE/LOTEP', 'LT LOTEP 12HS',        12, 12 * 60 + 30),
      (650, 'LOTECE/LOTEP', 'LT LOTECE 14HS',       14, 13 * 60 + 20),
      (660, 'LOTECE/LOTEP', 'LT LOTEP 15HS',        15, 15 * 60 + 30),
      (670, 'LOTECE/LOTEP', 'LT LOTECE 16HS',       16, 15 * 60 + 20),
      (680, 'LOTECE/LOTEP', 'LT LOTEP 18HS',        18, 17 * 60 + 50),
      (690, 'LOTECE/LOTEP', 'LT LOTECE 19HS',       19, 19 * 60),
      (700, 'LOTECE/LOTEP', 'LT LOTEP 20HS',        20, 19 * 60 + 45),
      (710, 'BAHIA',        'LT BAHIA 10HS',        10, 10 * 60 + 5),
      (720, 'BAHIA',        'LT BA MALUCA 10HS',    10, 10 * 60 + 5),
      (730, 'BAHIA',        'LT BAHIA 12HS',        12, 12 * 60 + 5),
      (740, 'BAHIA',        'LT BA MALUCA 12HS',    12, 12 * 60 + 5),
      (750, 'BAHIA',        'LT BAHIA 15HS',        15, 15 * 60 + 5),
      (760, 'BAHIA',        'LT BA MALUCA 15HS',    15, 15 * 60 + 5),
      (770, 'BAHIA',        'LT BAHIA 19HS',        19, 19 * 60 + 58),
      (780, 'BAHIA',        'LT BA MALUCA 19HS',    19, 19 * 60 + 58),
      (790, 'BAHIA',        'LT BAHIA 21HS',        21, 21 * 60 + 5),
      (800, 'BAHIA',        'LT BA MALUCA 21HS',    21, 21 * 60 + 5),
      (810, 'CAPITAL',      'LT CAPITAL 10HS',      10, 10 * 60),
      (820, 'CAPITAL',      'LT CAPITAL 11HS',      11, 11 * 60),
      (830, 'CAPITAL',      'LT CAPITAL 13HS',      13, 13 * 60),
      (840, 'CAPITAL',      'LT CAPITAL 14HS',      14, 14 * 60),
      (850, 'CAPITAL',      'LT CAPITAL 16HS',      16, 16 * 60),
      (860, 'CAPITAL',      'LT CAPITAL 18HS',      18, 18 * 60),
      (870, 'CAPITAL',      'LT CAPITAL 20HS',      20, 20 * 60),
      (880, 'CAPITAL',      'LT CAPITAL 22HS',      22, 22 * 60),
      (910, 'MINAS GERAIS', 'LT ALVORADA 12HS',     12, 11 * 60 + 55),
      (920, 'MINAS GERAIS', 'LT MINAS DIA 15HS',    15, 14 * 60 + 55),
      (930, 'MINAS GERAIS', 'LT MINAS PREF 21HS',   21, 20 * 60 + 30)
    ) AS v(ord, grp, name, hh, closes);
  END IF;
  PERFORM set_config('app.tenant_id', COALESCE(v_previous, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION "draws_seed_defaults"(uuid) FROM PUBLIC;

-- Banca nova já nasce com o cadastro padrão.
CREATE FUNCTION "tenants_seed_draws"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM "draws_seed_defaults"(NEW."id");
  RETURN NULL;
END;
$$;

CREATE TRIGGER "tenants_seed_draws"
  AFTER INSERT ON "tenants"
  FOR EACH ROW EXECUTE FUNCTION "tenants_seed_draws"();

-- Bancas existentes.
SELECT "draws_seed_defaults"("id") FROM "tenants";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: o painel cadastra, altera e exclui (as travas acima valem para ela).
-- ---------------------------------------------------------------------------
REVOKE ALL ON "draws", "draw_exceptions" FROM PUBLIC;
GRANT SELECT, DELETE ON "draws", "draw_exceptions" TO "sysjb_app";
GRANT INSERT ("tenant_id", "group_name", "name", "draw_minutes", "closes_minutes", "weekdays", "lotteries",
              "fazendinha", "active", "sort_order", "created_at", "updated_at") ON "draws" TO "sysjb_app";
GRANT UPDATE ("group_name", "name", "draw_minutes", "closes_minutes", "weekdays", "lotteries", "fazendinha",
              "active", "sort_order", "updated_at") ON "draws" TO "sysjb_app";
GRANT INSERT ("tenant_id", "date", "draw_id", "kind", "note", "created_at") ON "draw_exceptions" TO "sysjb_app";
