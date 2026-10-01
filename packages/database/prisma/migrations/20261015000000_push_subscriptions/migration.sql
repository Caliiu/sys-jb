-- Notificações do app instalado (Web Push): aparelho inscrito por banca e jogador. A API guarda a inscrição que o
-- navegador gerou e assina os envios com a chave privada VAPID (que nunca vem para o banco).
-- DDL no formato do Prisma; regras, RLS e privilégios na segunda parte.

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "push_subscriptions_tenant_id_user_id_idx" ON "push_subscriptions"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_tenant_id_endpoint_key" ON "push_subscriptions"("tenant_id", "endpoint");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Formato: endpoint HTTPS (o serviço é conferido pela API), chaves em base64url (p256dh = 65 bytes, auth = 16).
ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_endpoint" CHECK ("endpoint" ~ '^https://[^\s]+$' AND char_length("endpoint") <= 2048),
  ADD CONSTRAINT "push_subscriptions_p256dh" CHECK ("p256dh" ~ '^[A-Za-z0-9_-]{86,88}={0,2}$'),
  ADD CONSTRAINT "push_subscriptions_auth" CHECK ("auth" ~ '^[A-Za-z0-9_-]{22,24}={0,2}$');

-- Isolamento por banca (como as outras tabelas de jogador).
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "push_subscriptions_tenant_isolation" ON "push_subscriptions"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- Privilégios da role de runtime: inscreve, renova (outra conta no aparelho, chaves novas), lê para enviar e apaga
-- (sair da conta, inscrição expirada).
REVOKE ALL ON "push_subscriptions" FROM PUBLIC;
GRANT SELECT, DELETE ON "push_subscriptions" TO "sysjb_app";
GRANT INSERT ("tenant_id", "user_id", "endpoint", "p256dh", "auth", "created_at", "last_seen_at")
  ON "push_subscriptions" TO "sysjb_app";
GRANT UPDATE ("user_id", "p256dh", "auth", "last_seen_at") ON "push_subscriptions" TO "sysjb_app";
