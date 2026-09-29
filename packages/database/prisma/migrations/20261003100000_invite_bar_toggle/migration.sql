-- Barra "Indique um amigo" do app do jogador: o Gerente liga ou desliga (Personalização > Identidade visual).
-- Ligada, aparece no topo de todas as telas do jogador; desligada, em nenhuma.

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "invite_bar_enabled" BOOLEAN NOT NULL DEFAULT true;

GRANT UPDATE ("invite_bar_enabled") ON "tenants" TO "sysjb_app";
