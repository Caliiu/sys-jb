-- WhatsApp do suporte da banca (Personalização > Identidade visual). O botão de atendimento do app usa o telefone
-- do promotor que indicou o jogador (se ainda for promotor ativo) e, sem ele, este. Null = sem número.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "support_phone" TEXT;

-- Mesmo formato do telefone do jogador: DDD + 8 dígitos (fixo) ou DDD + 9 + 8 dígitos (celular).
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_support_phone_format"
    CHECK ("support_phone" IS NULL OR "support_phone" ~ '^[1-9]{2}(9[0-9]{8}|[2-8][0-9]{7})$');

GRANT UPDATE ("support_phone") ON "tenants" TO "sysjb_app";
