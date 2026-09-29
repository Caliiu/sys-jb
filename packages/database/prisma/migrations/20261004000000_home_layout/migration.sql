-- Ordem e visibilidade dos blocos e cards do início do app do jogador (Personalização > Cards do início).
-- Null = ordem padrão. A API valida o formato completo antes de gravar; aqui só o tipo e o tamanho.

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN "home_layout" JSONB;

ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_home_layout_shape"
    CHECK ("home_layout" IS NULL OR (jsonb_typeof("home_layout") = 'object' AND pg_column_size("home_layout") <= 8192));

GRANT INSERT ("home_layout") ON "tenant_settings" TO "sysjb_app";
GRANT UPDATE ("home_layout") ON "tenant_settings" TO "sysjb_app";
