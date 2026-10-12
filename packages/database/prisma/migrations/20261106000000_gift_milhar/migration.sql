-- Milhar Brinde: aposta grátis de MILHAR para as unidades com users.gift_milhar_enabled (coluna da migration
-- quote_tables_unit_settings).
--
-- 1. tenant_settings: interruptor da banca, total mínimo do pule, valor do brinde (base do prêmio) e colocação (das
--    que valem nos dois jogos; padrão 1º prêmio). Gravados pelo painel (Gerente com quotes.manage), sob a trava da
--    cotação: nenhuma venda em andamento vê a configuração mudar no meio.
-- 2. lottery_ticket_items.is_gift: o brinde é um item do pule (milhar de 4 dígitos sorteada pela API, um palpite,
--    "TODOS"), com total_cents = 0 (não cobrado: fica fora do total do pule, do débito, da comissão, do limite diário e
--    das vendas) e amount_cents = valor do brinde (a apuração paga valor × cotação da milhar, como uma milhar comum).
--    No máximo um por pule, sempre depois das apostas (posição até 21: o pule pode ter 20 apostas).
-- 3. Trigger: o brinde só entra se a banca estiver com a regra ligada, a unidade também, o pule chegar ao mínimo e
--    valor e colocação forem os da banca (segunda linha de defesa; a API decide antes).
-- 4. pule_prize_items_valid: aceita a posição 21 (brinde premiado num pule de 20 apostas).
-- DDL no formato do Prisma; regras e funções na segunda parte.

-- AlterTable
ALTER TABLE "lottery_ticket_items" ADD COLUMN     "is_gift" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "gift_milhar_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gift_milhar_min_pule_cents" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "gift_milhar_placement" TEXT NOT NULL DEFAULT 'p1'::text,
ADD COLUMN     "gift_milhar_stake_cents" INTEGER NOT NULL DEFAULT 10;

-- ---------------------------------------------------------------------------
-- Configuração: mínimo de R$ 0,01 a R$ 100.000,00; brinde de R$ 0,01 a R$ 100,00; colocação da Tradicional 1/7 (todas
-- valem também na 1/10). Mesmos limites de @sysjb/contracts (GIFT_MILHAR_LIMITS, GIFT_MILHAR_PLACEMENTS).
-- ---------------------------------------------------------------------------
ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_gift_milhar" CHECK (
    "gift_milhar_min_pule_cents" BETWEEN 1 AND 10000000
    AND "gift_milhar_stake_cents" BETWEEN 1 AND 10000
    AND "lottery_placement_allowed"('tradicional', "gift_milhar_placement")
  );

-- ---------------------------------------------------------------------------
-- Itens: o brinde tem total zero e o valor do brinde; as apostas pagas continuam como antes.
-- ---------------------------------------------------------------------------
ALTER TABLE "lottery_ticket_items"
  DROP CONSTRAINT "lottery_ticket_items_position_range",
  DROP CONSTRAINT "lottery_ticket_items_amounts",
  DROP CONSTRAINT "lottery_ticket_items_total_matches",
  ADD CONSTRAINT "lottery_ticket_items_position_range" CHECK (
    "position" BETWEEN 1 AND 20 OR ("is_gift" AND "position" = 21)
  ),
  ADD CONSTRAINT "lottery_ticket_items_amounts" CHECK (
    "amount_cents" > 0 AND "total_cents" <= 9007199254740991
    AND "quote_cents" > 0 AND "possible_prize_cents" >= 0
    AND (CASE WHEN "is_gift" THEN "total_cents" = 0 ELSE "total_cents" > 0 END)
  ),
  -- Total coerente com o modo: "Cada" = valor × palpites; "Todos" = o valor. O brinde não tem total.
  ADD CONSTRAINT "lottery_ticket_items_total_matches" CHECK (
    "is_gift"
    OR ("split" = 'each' AND "total_cents" = "amount_cents" * cardinality("guesses"))
    OR ("split" = 'total' AND "total_cents" = "amount_cents")
  ),
  ADD CONSTRAINT "lottery_ticket_items_gift_shape" CHECK (
    NOT "is_gift"
    OR ("modality" = 'milhar' AND "split" = 'total' AND cardinality("guesses") = 1 AND "guesses"[1] ~ '^[0-9]{4}$')
  );

CREATE UNIQUE INDEX "lottery_ticket_items_one_gift_key" ON "lottery_ticket_items"("ticket_id") WHERE "is_gift";

-- ---------------------------------------------------------------------------
-- Brinde só com a regra da banca e da unidade, no pule que chega ao mínimo, com o valor e a colocação da banca. Lê o pule
-- (já gravado), a configuração e a unidade com o RLS da banca corrente (SECURITY INVOKER).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "lottery_ticket_items_gift_rules"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_ticket "lottery_tickets"%ROWTYPE;
  v_settings "tenant_settings"%ROWTYPE;
BEGIN
  SELECT * INTO v_ticket FROM "lottery_tickets" WHERE "tenant_id" = NEW."tenant_id" AND "id" = NEW."ticket_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift milhar without ticket' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_settings FROM "tenant_settings" WHERE "tenant_id" = NEW."tenant_id";
  IF NOT FOUND OR NOT v_settings."gift_milhar_enabled"
     OR v_ticket."total_cents" < v_settings."gift_milhar_min_pule_cents"
     OR NEW."amount_cents" <> v_settings."gift_milhar_stake_cents"
     OR NEW."placement" <> v_settings."gift_milhar_placement"
     OR NOT EXISTS (
       SELECT 1 FROM "users" u
        WHERE u."tenant_id" = NEW."tenant_id" AND u."id" = v_ticket."user_id" AND u."gift_milhar_enabled"
     ) THEN
    RAISE EXCEPTION 'gift milhar not allowed for this ticket' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "lottery_ticket_items_gift_rules"
  BEFORE INSERT ON "lottery_ticket_items"
  FOR EACH ROW WHEN (NEW."is_gift") EXECUTE FUNCTION "lottery_ticket_items_gift_rules"();

-- ---------------------------------------------------------------------------
-- Itens premiados: posições distintas de 1 a 21 (o brinde de um pule de 20 apostas é a 21ª). O resto igual à versão
-- anterior (migration prize_settlement).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "pule_prize_items_valid"(p_items jsonb, p_total bigint) RETURNS boolean
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
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 21 THEN
    RETURN false;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_item -> 'position') IS DISTINCT FROM 'number'
       OR (v_item ->> 'position') !~ '^([1-9]|1[0-9]|2[01])$' THEN
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

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: o painel grava a configuração; a venda grava o item como brinde.
-- ---------------------------------------------------------------------------
GRANT INSERT ("gift_milhar_enabled", "gift_milhar_min_pule_cents", "gift_milhar_stake_cents", "gift_milhar_placement")
  ON "tenant_settings" TO "sysjb_app";
GRANT UPDATE ("gift_milhar_enabled", "gift_milhar_min_pule_cents", "gift_milhar_stake_cents", "gift_milhar_placement")
  ON "tenant_settings" TO "sysjb_app";
GRANT INSERT ("is_gift") ON "lottery_ticket_items" TO "sysjb_app";
