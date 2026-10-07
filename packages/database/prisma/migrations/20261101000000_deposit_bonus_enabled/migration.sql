-- Bônus de recarga: cada regra ganha um "ativa" próprio (o interruptor do painel). Pausar uma regra mantém a % e o
-- teto gravados; regra ativa exige % e teto maiores que zero. As regras que já tinham % > 0 continuam ativas.

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "bonus_daily_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bonus_federal_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bonus_first_enabled" BOOLEAN NOT NULL DEFAULT false;



-- Antes, % > 0 era o "ligada". O RLS forçado é suspenso só aqui, para a dona enxergar todas as bancas.
ALTER TABLE "tenant_settings" NO FORCE ROW LEVEL SECURITY;
UPDATE "tenant_settings"
   SET "bonus_first_enabled" = "bonus_first_bps" > 0,
       "bonus_daily_enabled" = "bonus_daily_bps" > 0,
       "bonus_federal_enabled" = "bonus_federal_bps" > 0;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;

ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_deposit_bonus_enabled" CHECK (
        (NOT "bonus_first_enabled" OR ("bonus_first_bps" > 0 AND "bonus_first_max_cents" > 0))
    AND (NOT "bonus_daily_enabled" OR ("bonus_daily_bps" > 0 AND "bonus_daily_max_cents" > 0))
    AND (NOT "bonus_federal_enabled" OR ("bonus_federal_bps" > 0 AND "bonus_federal_max_cents" > 0)));

-- ---------------------------------------------------------------------------
-- Gravação pelo painel (só Gerente ativo): agora com o "ativa" de cada regra.
-- ---------------------------------------------------------------------------
DROP FUNCTION "deposit_bonus_settings_save"(uuid, integer, integer, integer, integer, integer, integer, integer);

CREATE FUNCTION "deposit_bonus_settings_save"(
  p_actor uuid, p_min integer,
  p_first_enabled boolean, p_first_bps integer, p_first_max integer,
  p_daily_enabled boolean, p_daily_bps integer, p_daily_max integer,
  p_federal_enabled boolean, p_federal_bps integer, p_federal_max integer
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  INSERT INTO "tenant_settings" ("tenant_id", "deposit_bonus_min_cents",
                                 "bonus_first_enabled", "bonus_first_bps", "bonus_first_max_cents",
                                 "bonus_daily_enabled", "bonus_daily_bps", "bonus_daily_max_cents",
                                 "bonus_federal_enabled", "bonus_federal_bps", "bonus_federal_max_cents", "updated_at")
  VALUES ("app_current_tenant_id"(), p_min, p_first_enabled, p_first_bps, p_first_max, p_daily_enabled, p_daily_bps,
          p_daily_max, p_federal_enabled, p_federal_bps, p_federal_max, now())
  ON CONFLICT ("tenant_id") DO UPDATE
    SET "deposit_bonus_min_cents" = EXCLUDED."deposit_bonus_min_cents",
        "bonus_first_enabled" = EXCLUDED."bonus_first_enabled",
        "bonus_first_bps" = EXCLUDED."bonus_first_bps",
        "bonus_first_max_cents" = EXCLUDED."bonus_first_max_cents",
        "bonus_daily_enabled" = EXCLUDED."bonus_daily_enabled",
        "bonus_daily_bps" = EXCLUDED."bonus_daily_bps",
        "bonus_daily_max_cents" = EXCLUDED."bonus_daily_max_cents",
        "bonus_federal_enabled" = EXCLUDED."bonus_federal_enabled",
        "bonus_federal_bps" = EXCLUDED."bonus_federal_bps",
        "bonus_federal_max_cents" = EXCLUDED."bonus_federal_max_cents",
        "updated_at" = now();
END;
$$;

REVOKE ALL ON FUNCTION "deposit_bonus_settings_save"(uuid, integer, boolean, integer, integer, boolean, integer, integer, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "deposit_bonus_settings_save"(uuid, integer, boolean, integer, integer, boolean, integer, integer, boolean, integer, integer) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Regras que valem agora: só as ativas (o resto igual à versão anterior, migration deposit_bonus).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "deposit_bonus_rules"(p_user uuid, p_exclude uuid)
RETURNS TABLE ("rule" text, "rate_bps" integer, "max_cents" integer, "priority" integer)
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
  AS $$
  WITH s AS (
    SELECT * FROM "tenant_settings" WHERE "tenant_id" = "app_current_tenant_id"()
  ),
  today AS (
    SELECT ("brasilia_today"()::timestamp AT TIME ZONE 'America/Sao_Paulo') AS start_at
  ),
  paid AS (
    SELECT
      EXISTS (
        SELECT 1 FROM "pix_deposits" d
        WHERE d."tenant_id" = "app_current_tenant_id"() AND d."user_id" = p_user AND d."status" = 'PAID'
          AND d."destination" = 'LOTTERIES' AND d."id" IS DISTINCT FROM p_exclude
      ) AS ever,
      EXISTS (
        SELECT 1 FROM "pix_deposits" d CROSS JOIN today
        WHERE d."tenant_id" = "app_current_tenant_id"() AND d."user_id" = p_user AND d."status" = 'PAID'
          AND d."destination" = 'LOTTERIES' AND d."id" IS DISTINCT FROM p_exclude
          AND d."paid_at" >= today.start_at
      ) AS today
  ),
  federal AS (
    SELECT EXISTS (
      SELECT 1 FROM "draws" dr
      WHERE dr."tenant_id" = "app_current_tenant_id"() AND dr."result_lottery" = 'fd'
        AND "draw_runs_on"(dr, "brasilia_today"())
    ) AS today
  )
  SELECT 'FIRST_DEPOSIT', s."bonus_first_bps", s."bonus_first_max_cents", 1
    FROM s, paid WHERE s."bonus_first_enabled" AND s."bonus_first_bps" > 0 AND NOT paid.ever
  UNION ALL
  SELECT 'FEDERAL', s."bonus_federal_bps", s."bonus_federal_max_cents", 2
    FROM s, paid, federal WHERE s."bonus_federal_enabled" AND s."bonus_federal_bps" > 0 AND NOT paid.today AND federal.today
  UNION ALL
  SELECT 'DAILY', s."bonus_daily_bps", s."bonus_daily_max_cents", 3
    FROM s, paid WHERE s."bonus_daily_enabled" AND s."bonus_daily_bps" > 0 AND NOT paid.today
$$;

