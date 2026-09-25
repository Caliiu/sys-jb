-- Constraints adicionais, privilégios da role de runtime e Row Level Security.
--
-- Roles (criadas em docker/postgres/init/01-roles.sh):
--   sysjb_migrator  dona das tabelas; executa migrations e seed.
--   sysjb_app       runtime da API; NOSUPERUSER, NOBYPASSRLS, não é dona de nenhuma tabela.

-- ---------------------------------------------------------------------------
-- displayId: sequence do PostgreSQL (nunca MAX + 1). Lacunas são aceitas.
-- int4 (máx. 2.147.483.647) é sempre um inteiro seguro em JSON.
-- ---------------------------------------------------------------------------
ALTER SEQUENCE "users_display_id_seq" START WITH 100000 RESTART WITH 100000;

-- ---------------------------------------------------------------------------
-- CHECK constraints (segunda linha de defesa; a API normaliza antes)
-- ---------------------------------------------------------------------------
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "tenants_domain_format" CHECK ("domain" = lower("domain") AND "domain" ~ '^[a-z0-9.-]+$'),
  ADD CONSTRAINT "tenants_primary_color_format" CHECK ("primary_color" ~ '^#[0-9a-fA-F]{6}$'),
  ADD CONSTRAINT "tenants_secondary_color_format" CHECK ("secondary_color" ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE "users"
  ADD CONSTRAINT "users_name_length" CHECK (char_length("name") BETWEEN 2 AND 120 AND "name" = btrim("name")),
  ADD CONSTRAINT "users_email_normalized" CHECK (
    "email" IS NULL OR ("email" = lower(btrim("email")) AND char_length("email") BETWEEN 3 AND 254 AND "email" LIKE '_%@_%')
  ),
  ADD CONSTRAINT "users_phone_digits" CHECK ("phone" ~ '^[0-9]{10,11}$'),
  ADD CONSTRAINT "users_document_digits" CHECK ("document" ~ '^[0-9]{11}$'),
  ADD CONSTRAINT "users_avatar_http" CHECK ("avatar" IS NULL OR ("avatar" ~* '^https?://' AND char_length("avatar") <= 2048)),
  ADD CONSTRAINT "users_display_id_positive" CHECK ("display_id" > 0);

-- Centavos: não negativos e, somados, dentro de Number.MAX_SAFE_INTEGER (2^53 - 1).
ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_amounts_range" CHECK (
        "balance_jb"    BETWEEN 0 AND 9007199254740991
    AND "bonus_jb"      BETWEEN 0 AND 9007199254740991
    AND "prizes_jb"     BETWEEN 0 AND 9007199254740991
    AND "balance_games" BETWEEN 0 AND 9007199254740991
    AND "bonus_games"   BETWEEN 0 AND 9007199254740991
    AND "prizes_games"  BETWEEN 0 AND 9007199254740991
  ),
  ADD CONSTRAINT "wallets_totals_safe" CHECK (
        "balance_jb" + "bonus_jb" + "prizes_jb" <= 9007199254740991
    AND "balance_games" + "bonus_games" + "prizes_games" <= 9007199254740991
  );

-- ---------------------------------------------------------------------------
-- Contexto de tenant: definido por transação com set_config('app.tenant_id', <uuid>, true).
-- Sem contexto => NULL => nenhuma linha visível e nenhuma escrita permitida.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "app_current_tenant_id"() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

REVOKE ALL ON FUNCTION "app_current_tenant_id"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "app_current_tenant_id"() TO "sysjb_app";

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY "users_tenant_isolation" ON "users"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "wallets_tenant_isolation" ON "wallets"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Privilégios mínimos da role de runtime.
--   tenants: somente leitura (resolução por hostname acontece antes do contexto).
--   users:   leitura, inserção e atualização APENAS dos campos editáveis. Sem DELETE.
--            id e display_id não podem ser escolhidos pela aplicação.
--   wallets: leitura e criação. Sem UPDATE/DELETE: não há movimentação nesta fase.
-- ---------------------------------------------------------------------------
REVOKE ALL ON "tenants", "users", "wallets" FROM PUBLIC;

GRANT SELECT ON "tenants" TO "sysjb_app";

GRANT SELECT ON "users" TO "sysjb_app";
GRANT INSERT ("tenant_id", "name", "email", "phone", "document", "avatar", "created_at", "updated_at") ON "users" TO "sysjb_app";
GRANT UPDATE ("name", "email", "phone", "document", "avatar", "updated_at") ON "users" TO "sysjb_app";
GRANT USAGE ON SEQUENCE "users_display_id_seq" TO "sysjb_app";

GRANT SELECT ON "wallets" TO "sysjb_app";
-- O Prisma envia os defaults (0) explicitamente no INSERT, por isso as colunas de saldo
-- precisam de INSERT. O trigger abaixo garante que a carteira nasce zerada.
GRANT INSERT ("tenant_id", "user_id", "balance_jb", "bonus_jb", "prizes_jb", "balance_games", "bonus_games",
              "prizes_games", "created_at", "updated_at") ON "wallets" TO "sysjb_app";

-- Idempotente e necessário após `prisma migrate reset`, que recria o schema public.
GRANT USAGE ON SCHEMA "public" TO "sysjb_app";

-- ---------------------------------------------------------------------------
-- Nesta fase não há movimentação: toda carteira é criada com saldo zero.
-- Remover quando existir um fluxo de movimentação auditado.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "wallets_enforce_zero_on_insert"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."balance_jb" <> 0 OR NEW."bonus_jb" <> 0 OR NEW."prizes_jb" <> 0
     OR NEW."balance_games" <> 0 OR NEW."bonus_games" <> 0 OR NEW."prizes_games" <> 0 THEN
    RAISE EXCEPTION 'wallets must be created with zero balances' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "wallets_zero_on_insert"
  BEFORE INSERT ON "wallets"
  FOR EACH ROW EXECUTE FUNCTION "wallets_enforce_zero_on_insert"();
