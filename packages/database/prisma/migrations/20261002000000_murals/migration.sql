-- Mural: aviso com imagem que aparece para o jogador ao abrir o app, dentro da vigência. Cadastrado por banca
-- no painel (Gerente). A imagem fica no banco (bytea), limitada a PNG/JPEG/WebP de até 2 MB. "Apenas uma vez"
-- é registrado por jogador em mural_views.
-- DDL no formato do Prisma; regras, RLS e privilégios na segunda parte.

-- CreateTable
CREATE TABLE "murals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "display_mode" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "image_type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "murals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mural_views" (
    "tenant_id" UUID NOT NULL,
    "mural_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mural_views_pkey" PRIMARY KEY ("mural_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "murals_tenant_id_id_key" ON "murals"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "murals_tenant_id_ends_on_idx" ON "murals"("tenant_id", "ends_on");

-- CreateIndex
CREATE INDEX "mural_views_tenant_id_user_id_idx" ON "mural_views"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "murals" ADD CONSTRAINT "murals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mural_views" ADD CONSTRAINT "mural_views_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mural_views" ADD CONSTRAINT "mural_views_tenant_id_mural_id_fkey" FOREIGN KEY ("tenant_id", "mural_id") REFERENCES "murals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mural_views" ADD CONSTRAINT "mural_views_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- CHECKs (a API valida antes; aqui é a segunda linha de defesa)
-- ---------------------------------------------------------------------------
ALTER TABLE "murals"
  ADD CONSTRAINT "murals_name_length" CHECK (char_length("name") BETWEEN 1 AND 60 AND "name" = btrim("name")),
  ADD CONSTRAINT "murals_period" CHECK ("ends_on" >= "starts_on"),
  ADD CONSTRAINT "murals_display_mode" CHECK ("display_mode" IN ('ONCE', 'ALWAYS')),
  ADD CONSTRAINT "murals_image_type" CHECK ("image_type" IN ('image/png', 'image/jpeg', 'image/webp')),
  ADD CONSTRAINT "murals_image_size" CHECK (octet_length("image") BETWEEN 1 AND 2097152);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE "murals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "murals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "murals_tenant_isolation" ON "murals"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

ALTER TABLE "mural_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mural_views" FORCE ROW LEVEL SECURITY;
CREATE POLICY "mural_views_tenant_isolation" ON "mural_views"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: o painel cadastra, altera e exclui murais; o jogador só registra que viu.
-- Excluir um mural apaga antes os registros de quem viu (DELETE em mural_views só para isso).
-- ---------------------------------------------------------------------------
REVOKE ALL ON "murals", "mural_views" FROM PUBLIC;
GRANT SELECT, DELETE ON "murals", "mural_views" TO "sysjb_app";
GRANT INSERT ("tenant_id", "name", "starts_on", "ends_on", "display_mode", "image", "image_type", "created_at",
              "updated_at") ON "murals" TO "sysjb_app";
GRANT UPDATE ("name", "starts_on", "ends_on", "display_mode", "image", "image_type", "updated_at")
  ON "murals" TO "sysjb_app";
GRANT INSERT ("tenant_id", "mural_id", "user_id", "seen_at") ON "mural_views" TO "sysjb_app";
