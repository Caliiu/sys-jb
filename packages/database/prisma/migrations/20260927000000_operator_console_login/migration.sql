-- Painel administrativo único (admin.<domínio>): o login descobre a banca pelo operador.
-- Por isso o e-mail do operador passa a ser único no sistema todo (antes: por banca), e o controle de
-- tentativas e a leitura de sessão passam a funcionar ANTES de a banca ser conhecida.
-- Falha se já existir o mesmo e-mail em duas bancas: resolva os duplicados antes de aplicar.

-- DropIndex
DROP INDEX "operators_tenant_id_email_key";

-- CreateTable
CREATE TABLE "operator_login_failures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_login_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operator_login_failures_identifier_hash_created_at_idx" ON "operator_login_failures"("identifier_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "operators_email_key" ON "operators"("email");

-- ---------------------------------------------------------------------------
-- Tentativas de login: sem banca e sem dado pessoal (só o HMAC do e-mail), portanto sem RLS.
-- A role de runtime insere e limpa; não lê nem altera nada além disso.
-- ---------------------------------------------------------------------------
ALTER TABLE "operator_login_failures"
  ADD CONSTRAINT "operator_login_failures_hash_format" CHECK ("identifier_hash" ~ '^[0-9a-f]{64}$');

REVOKE ALL ON "operator_login_failures" FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON "operator_login_failures" TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Leitura por chave, antes de haver banca. As policies de isolamento por banca continuam valendo; estas
-- duas se somam a elas (OR) e só liberam SELECT de UMA linha, escolhida por um valor que a transação
-- informa com set_config(..., true) e que o chamador só conhece se já tiver a credencial:
--   app.login_email  -> o operador daquele e-mail (para conferir a senha no login)
--   app.session_hash -> a sessão daquele hash de token (para saber a banca e o operador da sessão)
-- Sem o valor definido, nenhuma linha extra fica visível. Escrita continua exigindo o contexto de banca.
-- ---------------------------------------------------------------------------
CREATE POLICY "operators_login_lookup" ON "operators"
  FOR SELECT
  USING ("email" = NULLIF(current_setting('app.login_email', true), ''));

CREATE POLICY "operator_sessions_token_lookup" ON "operator_sessions"
  FOR SELECT
  USING ("token_hash" = NULLIF(current_setting('app.session_hash', true), ''));
