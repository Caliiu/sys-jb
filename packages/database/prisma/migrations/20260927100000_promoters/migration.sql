-- Promotores. Promotor = usuário com comissão definida (promoter_commission_bps, em centésimos de %).
-- Quem se cadastra pelo link de convite de um promotor fica vinculado a ele (referred_by_user_id).
-- DDL gerado pelo Prisma; constraints, trigger e privilégios ficam na segunda parte.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "promoter_commission_bps" INTEGER,
ADD COLUMN     "referred_by_user_id" UUID;

-- CreateIndex
CREATE INDEX "users_tenant_id_referred_by_user_id_created_at_id_idx" ON "users"("tenant_id", "referred_by_user_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "users_tenant_id_promoter_commission_bps_idx" ON "users"("tenant_id", "promoter_commission_bps");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_referred_by_user_id_fkey" FOREIGN KEY ("tenant_id", "referred_by_user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints (segunda linha de defesa; a API valida antes)
--   comissão: 0,01% a 100%. Ninguém indica a si mesmo. A FK composta (tenant_id, referred_by_user_id)
--   já impede o promotor de ser de outra banca.
-- ---------------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_promoter_commission_range" CHECK (
    "promoter_commission_bps" IS NULL OR "promoter_commission_bps" BETWEEN 1 AND 10000
  ),
  ADD CONSTRAINT "users_not_self_referred" CHECK ("referred_by_user_id" IS NULL OR "referred_by_user_id" <> "id");

-- ---------------------------------------------------------------------------
-- O vínculo só nasce no cadastro e só com um promotor ativo. Como o valor vem do link de convite (dado
-- do navegador), o banco confere de novo. Roda com os privilégios de quem insere: com o RLS da banca.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "users_referrer_must_be_active_promoter"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."referred_by_user_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "users" r
    WHERE r."tenant_id" = NEW."tenant_id"
      AND r."id" = NEW."referred_by_user_id"
      AND r."promoter_commission_bps" IS NOT NULL
      AND r."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'referrer must be an active promoter' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "users_referrer_on_insert"
  BEFORE INSERT ON "users"
  FOR EACH ROW EXECUTE FUNCTION "users_referrer_must_be_active_promoter"();

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime (por coluna, como no resto da tabela)
--   referred_by_user_id:      só INSERT (no cadastro); nunca UPDATE, então o vínculo não muda depois.
--   promoter_commission_bps:  só UPDATE (o operador promove/rebaixa); usuário nunca nasce promotor.
-- ---------------------------------------------------------------------------
GRANT INSERT ("referred_by_user_id") ON "users" TO "sysjb_app";
GRANT UPDATE ("promoter_commission_bps") ON "users" TO "sysjb_app";
