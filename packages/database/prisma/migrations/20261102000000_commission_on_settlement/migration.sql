-- Comissão de Loterias e Fazendinha (Indique e ganhe + promotor) paga na APURAÇÃO do pule, não mais na aposta:
--   * na aposta, a comissão fica registrada como pendente (bet_commissions, sem crédito);
--   * na apuração (resultado chegou e passou a carência), é paga no Saldo de quem indicou, junto com os prêmios
--     (pule_settlement_record), uma vez só; quem indicou e está bloqueado nesse momento não recebe (forfeited_at);
--   * pule cancelado antes da apuração anula a comissão pendente (nada a estornar).
-- E o cancelamento do pule de Loterias pelo jogador passa a valer só nos 5 primeiros minutos depois da aposta (e nunca
-- depois do horário de venda). SQLSTATE novo: SJ021 = prazo de cancelamento encerrado.
-- Comissões criadas antes desta migration já tinham sido pagas na aposta: ficam como pagas (credited_at).
-- DDL no formato do Prisma; regras e funções na segunda parte.

-- AlterTable
ALTER TABLE "bet_commissions" ADD COLUMN     "credited_at" TIMESTAMPTZ(3),
ADD COLUMN     "forfeited_at" TIMESTAMPTZ(3);



-- As comissões existentes foram creditadas na aposta. O RLS forçado é suspenso só aqui, para a dona enxergar todas as
-- bancas; é restaurado logo abaixo.
ALTER TABLE "bet_commissions" NO FORCE ROW LEVEL SECURITY;
UPDATE "bet_commissions" SET "credited_at" = "created_at";
ALTER TABLE "bet_commissions" FORCE ROW LEVEL SECURITY;

-- Pendente (as duas nulas), paga ou perdida, nunca as duas. Estorno de pendente devolve 0 (nada tinha sido pago).
ALTER TABLE "bet_commissions"
  ADD CONSTRAINT "bet_commissions_settlement" CHECK (
    ("credited_at" IS NULL OR "forfeited_at" IS NULL)
    AND ("reversed_at" IS NULL OR "forfeited_at" IS NULL)
    AND ("reversed_at" IS NULL OR "credited_at" IS NOT NULL OR "reversed_cents" = 0)
  );

-- ---------------------------------------------------------------------------
-- Na aposta: só registra a comissão pendente (o resto igual à versão anterior, migration bet_commissions). Chamada
-- pelos débitos (lottery_debit / fazendinha_debit) com o valor pago com Saldo e Prêmios. Quem indicou e está
-- bloqueado não ganha registro; ganho zero também não.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "bet_commission_credit"(
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
          v_promoter_rate, v_referral, v_promoter);
END;
$$;

-- ---------------------------------------------------------------------------
-- Na apuração: paga a comissão pendente do pule no Saldo de quem indicou (uma vez só: a linha fica travada e marcada).
-- Quem indicou bloqueado agora não recebe (perdida). Sem comissão, já paga, perdida ou anulada: nada a fazer. Uso
-- interno de pule_settlement_record; a role de runtime não executa. Trava a carteira de quem indicou depois da do
-- apostador (mesma ordem da aposta: sempre "para cima" na cadeia de indicação).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "bet_commission_pay"(p_tenant uuid, p_lottery_ticket uuid, p_fazendinha_bet uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_commission "bet_commissions"%ROWTYPE;
  v_amount bigint;
BEGIN
  SELECT * INTO v_commission FROM "bet_commissions"
   WHERE "tenant_id" = p_tenant
     AND (("lottery_ticket_id" = p_lottery_ticket) OR ("fazendinha_bet_id" = p_fazendinha_bet))
     FOR UPDATE;
  IF NOT FOUND OR v_commission."credited_at" IS NOT NULL OR v_commission."forfeited_at" IS NOT NULL
     OR v_commission."reversed_at" IS NOT NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "users"
     WHERE "tenant_id" = p_tenant AND "id" = v_commission."user_id" AND "status" = 'ACTIVE'
  ) THEN
    UPDATE "bet_commissions" SET "forfeited_at" = now() WHERE "id" = v_commission."id";
    RETURN;
  END IF;

  v_amount := v_commission."referral_cents" + v_commission."promoter_cents";
  UPDATE "wallets" SET "balance_jb" = "balance_jb" + v_amount, "updated_at" = now()
   WHERE "tenant_id" = p_tenant AND "user_id" = v_commission."user_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta",
                                "bet_commission_id", "note")
  VALUES (p_tenant, v_commission."user_id", 'COMMISSION', v_amount, 0, v_commission."id", 'Comissão de aposta');
  UPDATE "bet_commissions" SET "credited_at" = now() WHERE "id" = v_commission."id";
END;
$$;

REVOKE ALL ON FUNCTION "bet_commission_pay"(uuid, uuid, uuid) FROM PUBLIC;

-- Apuração do pule + prêmio (igual à versão anterior, migration prize_settlement) + a comissão de quem indicou, por
-- último (depois da carteira do apostador).
CREATE OR REPLACE FUNCTION "pule_settlement_record"(
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

  IF p_prize > 0 THEN
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
  END IF;

  PERFORM "bet_commission_pay"(p_tenant, p_ticket, p_bet);
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancelamento do pule pelo jogador: só nos 5 primeiros minutos depois da aposta (SJ021) e antes do horário de venda
-- (SJ002). Devolve a aposta às mesmas bolsas (bônus incluído). A comissão pendente é anulada; uma comissão já paga
-- (pules de antes desta migration) é estornada como antes. O resto igual à versão anterior (migration deposit_bonus).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "lottery_cancel"(p_pule_number integer, p_user_id uuid) RETURNS uuid
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
  IF v_now >= v_ticket."created_at" + interval '5 minutes' THEN
    RAISE EXCEPTION 'cancellation window is over' USING ERRCODE = 'SJ021';
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
         "bonus_jb"   = "bonus_jb" - v_debit."bonus_jb_delta",
         "updated_at" = now()
   WHERE "tenant_id" = v_tenant AND "user_id" = v_ticket."user_id";
  INSERT INTO "wallet_entries" ("tenant_id", "user_id", "kind", "balance_jb_delta", "prizes_jb_delta", "bonus_jb_delta",
                                "lottery_ticket_id", "note")
  VALUES (v_tenant, v_ticket."user_id", 'LOTTERY_REFUND', -v_debit."balance_jb_delta", -v_debit."prizes_jb_delta",
          -v_debit."bonus_jb_delta", v_ticket."id", 'Pule cancelado');

  UPDATE "lottery_tickets" SET "canceled_at" = v_now WHERE "tenant_id" = v_tenant AND "id" = v_ticket."id";

  SELECT * INTO v_commission FROM "bet_commissions"
   WHERE "tenant_id" = v_tenant AND "lottery_ticket_id" = v_ticket."id"
     FOR UPDATE;
  IF FOUND AND v_commission."credited_at" IS NULL THEN
    -- Pendente: nada foi pago, a comissão só deixa de existir.
    UPDATE "bet_commissions" SET "reversed_at" = v_now, "reversed_cents" = 0 WHERE "id" = v_commission."id";
  ELSIF FOUND THEN
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
