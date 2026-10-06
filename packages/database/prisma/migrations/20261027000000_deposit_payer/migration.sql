-- Depósito só credita sozinho se quem pagou é o próprio jogador. O CPF/CNPJ de quem pagou chega no aviso do gateway
-- (webhook; a consulta da transação não o traz) e fica gravado no depósito (pix_deposit_set_payer, uma vez só).
-- pix_deposit_confirm passa a exigir esse dado: pago e pagador igual ao CPF do jogador = credita; pagador diferente =
-- REVIEW (PAYER_MISMATCH); pago sem o aviso do pagador = aguarda até 15 minutos e depois REVIEW (PAYER_UNKNOWN). Em
-- análise, o Gerente decide (pix_deposit_review): libera o crédito ou recusa (REJECTED; a devolução ao pagador é feita
-- fora do sistema). Pago e recusado são finais.
-- SQLSTATE SJ012: o depósito não está em análise (não há o que liberar ou recusar).
-- DDL no formato do Prisma; regras, funções e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "pix_deposits" ADD COLUMN     "payer_document" TEXT,
ADD COLUMN     "payer_name" TEXT,
ADD COLUMN     "payment_seen_at" TIMESTAMPTZ(3),
ADD COLUMN     "review_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_by" UUID;

-- AddForeignKey
ALTER TABLE "pix_deposits" ADD CONSTRAINT "pix_deposits_tenant_id_reviewed_by_fkey" FOREIGN KEY ("tenant_id", "reviewed_by") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Regras das colunas novas.
-- ---------------------------------------------------------------------------
ALTER TABLE "pix_deposits"
  DROP CONSTRAINT "pix_deposits_status",
  ADD CONSTRAINT "pix_deposits_status" CHECK (
    "status" IN ('PENDING', 'PAID', 'EXPIRED', 'CANCELED', 'REVIEW', 'REJECTED')),
  ADD CONSTRAINT "pix_deposits_payer_document_format" CHECK (
    "payer_document" IS NULL OR "payer_document" ~ '^([0-9]{11}|[0-9]{14})$'),
  ADD CONSTRAINT "pix_deposits_payer_name_format" CHECK (
    "payer_name" IS NULL OR (char_length("payer_name") BETWEEN 1 AND 120 AND "payer_name" !~ '[[:cntrl:]]')),
  ADD CONSTRAINT "pix_deposits_review_reason" CHECK (
    ("review_reason" IS NULL OR "review_reason" IN ('PAYER_MISMATCH', 'PAYER_UNKNOWN'))
    AND ("status" <> 'REVIEW' OR "review_reason" IS NOT NULL)),
  ADD CONSTRAINT "pix_deposits_reviewed" CHECK (
    ("reviewed_by" IS NULL) = ("reviewed_at" IS NULL)
    AND ("status" <> 'REJECTED' OR "reviewed_by" IS NOT NULL));

-- Depois de pago ou recusado, nada muda; quem pagou, depois de informado, também não.
CREATE OR REPLACE FUNCTION "pix_deposits_guard"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'deposits are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" IN ('PAID', 'REJECTED') THEN
    RAISE EXCEPTION 'paid deposit is final' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."tenant_id" <> OLD."tenant_id" OR NEW."user_id" <> OLD."user_id" OR NEW."gateway" <> OLD."gateway"
     OR NEW."destination" <> OLD."destination" OR NEW."amount_cents" <> OLD."amount_cents"
     OR NEW."created_at" <> OLD."created_at" OR NEW."expires_at" <> OLD."expires_at"
     OR (OLD."provider_transaction_id" IS NOT NULL
         AND NEW."provider_transaction_id" IS DISTINCT FROM OLD."provider_transaction_id")
     OR (OLD."pix_code" IS NOT NULL AND NEW."pix_code" IS DISTINCT FROM OLD."pix_code")
     OR (OLD."payer_document" IS NOT NULL AND NEW."payer_document" IS DISTINCT FROM OLD."payer_document")
     OR (OLD."payer_document" IS NOT NULL AND NEW."payer_name" IS DISTINCT FROM OLD."payer_name")
     OR (OLD."payment_seen_at" IS NOT NULL AND NEW."payment_seen_at" IS DISTINCT FROM OLD."payment_seen_at") THEN
    RAISE EXCEPTION 'deposit identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "pix_deposits_new"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."status" <> 'PENDING' OR NEW."paid_at" IS NOT NULL OR NEW."provider_transaction_id" IS NOT NULL
     OR NEW."pix_code" IS NOT NULL OR NEW."last_checked_at" IS NOT NULL OR NEW."payer_document" IS NOT NULL
     OR NEW."payer_name" IS NOT NULL OR NEW."payment_seen_at" IS NOT NULL OR NEW."review_reason" IS NOT NULL
     OR NEW."reviewed_by" IS NOT NULL OR NEW."reviewed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'deposits start pending' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Fechar sem pagamento não vale para quem já está em análise (o dinheiro chegou) nem para os finais.
CREATE OR REPLACE FUNCTION "pix_deposit_close"(p_deposit uuid, p_status text) RETURNS boolean
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
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_deposit AND "payment_seen_at" IS NULL
     AND ("status" = 'PENDING' OR ("status" = 'EXPIRED' AND p_status = 'CANCELED'));
  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- Quem pagou (do aviso do gateway, já conferido pela API: endereço assinado e transação do próprio depósito). Uma vez
-- só e enquanto não for final. Devolve false se já havia pagador ou se o depósito é final.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_deposit_set_payer"(p_deposit uuid, p_document text, p_name text) RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "pix_deposits" SET "payer_document" = p_document, "payer_name" = p_name, "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_deposit AND "payer_document" IS NULL
     AND "status" NOT IN ('PAID', 'REJECTED');
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "pix_deposit_set_payer"(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_deposit_set_payer"(uuid, text, text) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Crédito do depósito (travado por quem chama): marca pago e lança DEPOSIT na bolsa do destino. Uso interno das
-- funções abaixo; a role de runtime não executa.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_deposit_credit"(p_tenant uuid, p_deposit uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_deposit "pix_deposits"%ROWTYPE;
  v_wallet "wallets"%ROWTYPE;
  v_jb bigint := 0;
  v_games bigint := 0;
BEGIN
  SELECT * INTO v_deposit FROM "pix_deposits" WHERE "tenant_id" = p_tenant AND "id" = p_deposit;
  SELECT * INTO v_wallet FROM "wallets" WHERE "tenant_id" = p_tenant AND "user_id" = v_deposit."user_id" FOR UPDATE;
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
  VALUES (p_tenant, v_deposit."user_id", 'DEPOSIT', v_jb, 0, v_games, v_deposit."id");
END;
$$;

REVOKE ALL ON FUNCTION "pix_deposit_credit"(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Pagamento conferido no gateway (a API só chama depois de consultar a transação lá). Depósito travado: o aviso, a
-- tela e a rodada automática se enfileiram. Valor tem de ser o do depósito (senão SJ011). Devolve o que aconteceu:
--   'applied'  creditado agora (pagador = CPF/CNPJ do jogador);
--   'waiting'  pago, mas o aviso com o pagador ainda não chegou (até 15 min depois da 1ª confirmação);
--   'review'   em análise (pagador diferente, ou o aviso não chegou em 15 min);
--   'final'    já pago ou recusado (nada a fazer).
-- Pagamento depois do prazo (expirado/cancelado) segue as mesmas regras. Credita mesmo jogador bloqueado.
-- Depósito inexistente: no_data_found.
-- ---------------------------------------------------------------------------
DROP FUNCTION "pix_deposit_confirm"(uuid, bigint);

CREATE FUNCTION "pix_deposit_confirm"(p_deposit uuid, p_paid_cents bigint) RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_deposit "pix_deposits"%ROWTYPE;
  v_document text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_deposit FROM "pix_deposits" WHERE "tenant_id" = v_tenant AND "id" = p_deposit FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_deposit."status" IN ('PAID', 'REJECTED') THEN
    RETURN 'final';
  END IF;
  IF v_deposit."status" = 'REVIEW' THEN
    RETURN 'review';
  END IF;
  IF p_paid_cents IS NULL OR p_paid_cents <> v_deposit."amount_cents" THEN
    RAISE EXCEPTION 'paid amount differs from the deposit' USING ERRCODE = 'SJ011';
  END IF;

  IF v_deposit."payment_seen_at" IS NULL THEN
    UPDATE "pix_deposits" SET "payment_seen_at" = now(), "updated_at" = now() WHERE "id" = v_deposit."id";
    v_deposit."payment_seen_at" := now();
  END IF;

  IF v_deposit."payer_document" IS NULL THEN
    IF v_deposit."payment_seen_at" > now() - interval '15 minutes' THEN
      RETURN 'waiting';
    END IF;
    UPDATE "pix_deposits" SET "status" = 'REVIEW', "review_reason" = 'PAYER_UNKNOWN', "updated_at" = now()
     WHERE "id" = v_deposit."id";
    RETURN 'review';
  END IF;

  SELECT "document" INTO v_document FROM "users" WHERE "tenant_id" = v_tenant AND "id" = v_deposit."user_id";
  IF v_deposit."payer_document" IS DISTINCT FROM v_document THEN
    UPDATE "pix_deposits" SET "status" = 'REVIEW', "review_reason" = 'PAYER_MISMATCH', "updated_at" = now()
     WHERE "id" = v_deposit."id";
    RETURN 'review';
  END IF;

  PERFORM "pix_deposit_credit"(v_tenant, v_deposit."id");
  RETURN 'applied';
END;
$$;

REVOKE ALL ON FUNCTION "pix_deposit_confirm"(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_deposit_confirm"(uuid, bigint) TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Análise pelo painel: só Gerente ativo da banca (operator_assert_manager). Liberar = credita como um depósito pago;
-- recusar = REJECTED (final). Só para depósito em análise (senão SJ012). Devolve 'applied' ou 'rejected'.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "pix_deposit_review"(p_actor uuid, p_deposit uuid, p_approve boolean) RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_tenant uuid := "app_current_tenant_id"();
  v_deposit "pix_deposits"%ROWTYPE;
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  SELECT * INTO v_deposit FROM "pix_deposits" WHERE "tenant_id" = v_tenant AND "id" = p_deposit FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deposit not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_deposit."status" <> 'REVIEW' THEN
    RAISE EXCEPTION 'deposit is not under review' USING ERRCODE = 'SJ012';
  END IF;
  UPDATE "pix_deposits" SET "reviewed_by" = p_actor, "reviewed_at" = now(), "updated_at" = now()
   WHERE "id" = v_deposit."id";
  IF p_approve THEN
    PERFORM "pix_deposit_credit"(v_tenant, v_deposit."id");
    RETURN 'applied';
  END IF;
  UPDATE "pix_deposits" SET "status" = 'REJECTED', "updated_at" = now() WHERE "id" = v_deposit."id";
  RETURN 'rejected';
END;
$$;

REVOKE ALL ON FUNCTION "pix_deposit_review"(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "pix_deposit_review"(uuid, uuid, boolean) TO "sysjb_app";
