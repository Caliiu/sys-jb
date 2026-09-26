-- Painel administrativo: status de usuário, operadores por banca (com perfis), sessões de operador e
-- trilha de auditoria. DDL gerado pelo Prisma; constraints, RLS e privilégios ficam na segunda parte.

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "operator_role" AS ENUM ('MANAGER', 'FINANCE', 'SUPPORT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "operators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "operator_role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "operator_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "operator_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operators_tenant_id_id_key" ON "operators"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "operators_tenant_id_email_key" ON "operators"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "operator_sessions_token_hash_key" ON "operator_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "operator_sessions_tenant_id_operator_id_idx" ON "operator_sessions"("tenant_id", "operator_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_target_type_target_id_created_at_idx" ON "audit_logs"("tenant_id", "target_type", "target_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "users_tenant_id_created_at_id_idx" ON "users"("tenant_id", "created_at" DESC, "id");

-- AddForeignKey
ALTER TABLE "operators" ADD CONSTRAINT "operators_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_tenant_id_operator_id_fkey" FOREIGN KEY ("tenant_id", "operator_id") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_operator_id_fkey" FOREIGN KEY ("tenant_id", "operator_id") REFERENCES "operators"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Constraints (segunda linha de defesa; a API normaliza antes)
-- ---------------------------------------------------------------------------
ALTER TABLE "operators"
  ADD CONSTRAINT "operators_name_length" CHECK (char_length("name") BETWEEN 2 AND 120 AND "name" = btrim("name")),
  ADD CONSTRAINT "operators_email_normalized" CHECK (
    "email" = lower(btrim("email")) AND char_length("email") BETWEEN 3 AND 254 AND "email" LIKE '_%@_%'
  ),
  ADD CONSTRAINT "operators_password_hash_format" CHECK ("password_hash" LIKE '$argon2id$%');

ALTER TABLE "operator_sessions"
  ADD CONSTRAINT "operator_sessions_token_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "operator_sessions_expiry_after_creation" CHECK ("expires_at" > "created_at");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_action_format" CHECK ("action" ~ '^[a-z]+(\.[a-z]+)+$' AND char_length("action") <= 64),
  ADD CONSTRAINT "audit_logs_target_type_format" CHECK ("target_type" ~ '^[a-z_]+$' AND char_length("target_type") <= 32);

-- ---------------------------------------------------------------------------
-- RLS (mesmo modelo de users/wallets/sessions)
-- ---------------------------------------------------------------------------
ALTER TABLE "operators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operators" FORCE ROW LEVEL SECURITY;
CREATE POLICY "operators_tenant_isolation" ON "operators"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "operator_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operator_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "operator_sessions_tenant_isolation" ON "operator_sessions"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime
--   users:            passa a poder alterar o status (bloquear/desbloquear). O Prisma envia o default
--                     no INSERT, por isso a coluna precisa de INSERT; o trigger abaixo garante ACTIVE.
--   operators:        somente leitura. Operadores são criados por script com a credencial de migração.
--   operator_sessions: cria e revoga (UPDATE só de revoked_at). Sem DELETE.
--   audit_logs:       somente inclusão e leitura. Sem UPDATE/DELETE: a trilha não é reescrita.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "operators", "operator_sessions", "audit_logs" FROM PUBLIC;

GRANT INSERT ("status") ON "users" TO "sysjb_app";
GRANT UPDATE ("status") ON "users" TO "sysjb_app";

GRANT SELECT ON "operators" TO "sysjb_app";

GRANT SELECT ON "operator_sessions" TO "sysjb_app";
GRANT INSERT ("tenant_id", "operator_id", "token_hash", "created_at", "expires_at") ON "operator_sessions" TO "sysjb_app";
GRANT UPDATE ("revoked_at") ON "operator_sessions" TO "sysjb_app";

GRANT SELECT ON "audit_logs" TO "sysjb_app";
GRANT INSERT ("tenant_id", "operator_id", "action", "target_type", "target_id", "details", "created_at")
  ON "audit_logs" TO "sysjb_app";

-- Todo usuário nasce ACTIVE: só um operador (UPDATE) pode bloquear.
CREATE FUNCTION "users_enforce_active_on_insert"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'users must be created with status ACTIVE' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "users_active_on_insert"
  BEFORE INSERT ON "users"
  FOR EACH ROW EXECUTE FUNCTION "users_enforce_active_on_insert"();
