-- Milhar Brinde da unidade ligada por padrão: todo cadastro novo já vem com users.gift_milhar_enabled = true, e as
-- unidades existentes são ligadas (a funcionalidade não tinha sido usada). O brinde continua só saindo com a da banca
-- (tenant_settings.gift_milhar_enabled, desligada por padrão) também ligada; o painel desliga por unidade.

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "gift_milhar_enabled" SET DEFAULT true;

UPDATE "users" SET "gift_milhar_enabled" = true WHERE NOT "gift_milhar_enabled";
