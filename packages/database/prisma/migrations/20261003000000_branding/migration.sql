-- Identidade visual editável pelo Gerente (Personalização no painel): nome, cores, texto da barra "Indique um
-- amigo" e logo. A logo enviada fica em tenant_logos (bytea, com RLS); a coluna logo_url continua sendo a logo
-- padrão (sem logo enviada, vale ela).
-- DDL no formato do Prisma; regras, RLS e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "invite_bar_text" TEXT NOT NULL DEFAULT 'Indique um amigo e ganhe bônus',
ADD COLUMN "logo_updated_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "tenant_logos" (
    "tenant_id" UUID NOT NULL,
    "image" BYTEA NOT NULL,
    "image_type" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_logos_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "tenant_logos" ADD CONSTRAINT "tenant_logos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- CHECKs (a API valida antes; aqui é a segunda linha de defesa)
-- ---------------------------------------------------------------------------
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_name_length" CHECK (char_length("name") BETWEEN 2 AND 40 AND "name" = btrim("name")),
  ADD CONSTRAINT "tenants_invite_bar_text_length"
    CHECK (char_length("invite_bar_text") BETWEEN 1 AND 60 AND "invite_bar_text" = btrim("invite_bar_text"));

ALTER TABLE "tenant_logos"
  ADD CONSTRAINT "tenant_logos_image_type" CHECK ("image_type" IN ('image/png', 'image/jpeg', 'image/webp')),
  ADD CONSTRAINT "tenant_logos_image_size" CHECK (octet_length("image") BETWEEN 1 AND 1048576);

-- ---------------------------------------------------------------------------
-- RLS
-- tenants: a leitura continua livre (a banca é resolvida pelo hostname antes de haver contexto); alteração só
-- da banca do contexto. ENABLE sem FORCE: a dona (migrations, seed, testes) segue criando bancas.
-- ---------------------------------------------------------------------------
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_read" ON "tenants" FOR SELECT USING (true);
CREATE POLICY "tenants_update_own" ON "tenants"
  FOR UPDATE
  USING ("id" = "app_current_tenant_id"())
  WITH CHECK ("id" = "app_current_tenant_id"());

ALTER TABLE "tenant_logos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_logos" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_logos_tenant_isolation" ON "tenant_logos"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: só as colunas de identidade visual (slug, domínio, logo padrão e ativa não).
-- ---------------------------------------------------------------------------
GRANT UPDATE ("name", "primary_color", "secondary_color", "invite_bar_text", "logo_updated_at", "updated_at")
  ON "tenants" TO "sysjb_app";

REVOKE ALL ON "tenant_logos" FROM PUBLIC;
GRANT SELECT, DELETE ON "tenant_logos" TO "sysjb_app";
GRANT INSERT ("tenant_id", "image", "image_type", "updated_at") ON "tenant_logos" TO "sysjb_app";
GRANT UPDATE ("image", "image_type", "updated_at") ON "tenant_logos" TO "sysjb_app";
