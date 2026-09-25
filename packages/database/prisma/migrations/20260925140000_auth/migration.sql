-- Cadastro com CPF, data de nascimento e senha; sessões de cliente e bloqueio de login.
-- As colunas novas de users são obrigatórias: esta migration falha se já houver usuários
-- (não há como inventar data de nascimento ou senha). Ambiente ainda sem produção.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birth_date" DATE NOT NULL,
ADD COLUMN     "password_hash" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_failures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "identifier_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_user_id_idx" ON "sessions"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "login_failures_tenant_id_identifier_hash_created_at_idx" ON "login_failures"("tenant_id", "identifier_hash", "created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_failures" ADD CONSTRAINT "login_failures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------
-- Dígitos verificadores do CPF. Só formato: não é verificação de identidade.
CREATE FUNCTION "is_valid_cpf"(doc text) RETURNS boolean
  LANGUAGE plpgsql IMMUTABLE STRICT
  AS $$
DECLARE
  d int[];
  s int;
  r int;
BEGIN
  IF doc !~ '^[0-9]{11}$' OR doc ~ '^(.)\1{10}$' THEN
    RETURN false;
  END IF;
  d := string_to_array(doc, NULL)::int[];
  s := 0;
  FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP;
  r := (s * 10) % 11 % 10;
  IF r <> d[10] THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP;
  r := (s * 10) % 11 % 10;
  RETURN r = d[11];
END;
$$;

ALTER TABLE "users"
  ADD CONSTRAINT "users_document_cpf" CHECK ("is_valid_cpf"("document")),
  ADD CONSTRAINT "users_birth_date_range" CHECK ("birth_date" >= DATE '1900-01-01'),
  ADD CONSTRAINT "users_password_hash_format" CHECK ("password_hash" LIKE '$argon2id$%');

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_expiry_after_creation" CHECK ("expires_at" > "created_at");

ALTER TABLE "login_failures"
  ADD CONSTRAINT "login_failures_identifier_hash_format" CHECK ("identifier_hash" ~ '^[0-9a-f]{64}$');

-- ---------------------------------------------------------------------------
-- RLS (mesmo modelo de users/wallets)
-- ---------------------------------------------------------------------------
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sessions_tenant_isolation" ON "sessions"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "login_failures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_failures" FORCE ROW LEVEL SECURITY;
CREATE POLICY "login_failures_tenant_isolation" ON "login_failures"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime
--   users:          grava birth_date e password_hash só no cadastro (sem UPDATE nesta etapa).
--   sessions:       cria e revoga (UPDATE só de revoked_at). Sem DELETE.
--   login_failures: registra, conta e limpa falhas.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "sessions", "login_failures" FROM PUBLIC;

GRANT INSERT ("birth_date", "password_hash") ON "users" TO "sysjb_app";

GRANT SELECT ON "sessions" TO "sysjb_app";
GRANT INSERT ("tenant_id", "user_id", "token_hash", "created_at", "expires_at") ON "sessions" TO "sysjb_app";
GRANT UPDATE ("revoked_at") ON "sessions" TO "sysjb_app";

GRANT SELECT, DELETE ON "login_failures" TO "sysjb_app";
GRANT INSERT ("tenant_id", "identifier_hash", "created_at") ON "login_failures" TO "sysjb_app";
