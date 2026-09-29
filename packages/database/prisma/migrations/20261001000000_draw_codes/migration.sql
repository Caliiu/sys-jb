-- Código curto da extração (ex.: PT14, NAC12), usado nos relatórios do jogador (Consultar pule, Movimento
-- loterias). Editável no painel; vazio = gerado do nome e da hora. Cada pule guarda o código da venda
-- (draw_code), gravado pelo trigger de venda a partir do cadastro: mudar o código depois não altera pules.
-- DDL no formato do Prisma; regras, funções, triggers e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "draws" ADD COLUMN "code" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "lottery_tickets" ADD COLUMN "draw_code" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "fazendinha_bets" ADD COLUMN "draw_code" TEXT NOT NULL DEFAULT '';


-- ---------------------------------------------------------------------------
-- Código padrão: o nome sem o prefixo "LT " e sem a hora ("14HS"), só letras e dígitos, até 10 caracteres,
-- mais a hora com 2 dígitos: a do nome, ou a do sorteio quando o nome não tem.
-- "LT PT RIO 14HS" -> PTRIO14; "LT BA MALUCA 19HS" (sorteio às 20h) -> BAMALUCA19; "LT FEDERAL" -> FEDERAL20.
-- ---------------------------------------------------------------------------
CREATE FUNCTION "draw_default_code"(p_name text, p_draw_minutes integer) RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$
  SELECT left(
           upper(regexp_replace(
             regexp_replace(regexp_replace(p_name, '\s*\d{1,2}\s*HS\s*$', '', 'i'), '^LT\s+', '', 'i'),
             '[^A-Za-z0-9]', '', 'g')),
           10)
         || lpad(COALESCE(substring(p_name FROM '(?i)(\d{1,2})\s*HS\s*$'), (p_draw_minutes / 60)::text), 2, '0')
$$;

-- Dados existentes, banca por banca (FORCE RLS vale também para a dona das tabelas):
-- - sorteios: código padrão; repetido na banca ganha um sufixo (2, 3...) no lugar do fim;
-- - pules: o código atual do sorteio (ou o padrão, se o sorteio não existir mais).
DO $$
DECLARE
  v_tenant uuid;
BEGIN
  FOR v_tenant IN SELECT "id" FROM "tenants" LOOP
    PERFORM set_config('app.tenant_id', v_tenant::text, true);

    UPDATE "draws" d
    SET "code" = CASE WHEN r.rn = 1 THEN r.base ELSE left(r.base, 12 - length(r.rn::text)) || r.rn END
    FROM (
      SELECT "id", "draw_default_code"("name", "draw_minutes") AS base,
             row_number() OVER (PARTITION BY "draw_default_code"("name", "draw_minutes") ORDER BY "sort_order", "name") AS rn
      FROM "draws" WHERE "tenant_id" = v_tenant
    ) r
    WHERE d."id" = r."id";

    UPDATE "lottery_tickets" t
    SET "draw_code" = COALESCE(
      (SELECT d."code" FROM "draws" d WHERE d."tenant_id" = t."tenant_id" AND d."name" = t."lottery"),
      "draw_default_code"(t."lottery", t."draw_hour" * 60))
    WHERE t."tenant_id" = v_tenant;

    UPDATE "fazendinha_bets" b
    SET "draw_code" = COALESCE(
      (SELECT d."code" FROM "draws" d WHERE d."tenant_id" = b."tenant_id" AND d."name" = b."lottery"),
      "draw_default_code"(b."lottery", b."draw_hour" * 60))
    WHERE b."tenant_id" = v_tenant;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END;
$$;

ALTER TABLE "draws"
  ADD CONSTRAINT "draws_code_format" CHECK ("code" ~ '^[A-Z0-9]{1,12}$');

-- CreateIndex
CREATE UNIQUE INDEX "draws_tenant_id_code_key" ON "draws"("tenant_id", "code");

-- Vazio (cadastro sem código, inclusive o padrão de banca nova) = código padrão.
CREATE FUNCTION "draws_default_code"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW."code" = '' THEN
    NEW."code" := "draw_default_code"(NEW."name", NEW."draw_minutes");
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "draws_default_code"
  BEFORE INSERT OR UPDATE OF "code", "name", "draw_minutes" ON "draws"
  FOR EACH ROW EXECUTE FUNCTION "draws_default_code"();

-- ---------------------------------------------------------------------------
-- Pules: código da venda, sempre o do cadastro no momento da venda (o que a API mandar é ignorado).
-- ---------------------------------------------------------------------------
ALTER TABLE "lottery_tickets"
  ADD CONSTRAINT "lottery_tickets_draw_code_format" CHECK ("draw_code" ~ '^[A-Z0-9]{1,12}$');
ALTER TABLE "fazendinha_bets"
  ADD CONSTRAINT "fazendinha_bets_draw_code_format" CHECK ("draw_code" ~ '^[A-Z0-9]{1,12}$');

-- draw_for_sale travou a linha do sorteio (FOR SHARE): o código lido é o do cadastro conferido na venda.
CREATE OR REPLACE FUNCTION "fazendinha_bets_draw_open"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM "draw_for_sale"(NEW."tenant_id", NEW."lottery", NEW."draw_hour", NEW."draw_date", 'fazendinha');
  NEW."draw_code" := (SELECT "code" FROM "draws" WHERE "tenant_id" = NEW."tenant_id" AND "name" = NEW."lottery");
  RETURN NEW;
END;
$$;

-- O horário limite e o código gravados no pule são sempre os do cadastro (o que a API mandou é ignorado).
CREATE OR REPLACE FUNCTION "lottery_tickets_draw_open"() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW."closes_at" := "draw_for_sale"(NEW."tenant_id", NEW."lottery", NEW."draw_hour", NEW."draw_date", 'lotteries');
  NEW."draw_code" := (SELECT "code" FROM "draws" WHERE "tenant_id" = NEW."tenant_id" AND "name" = NEW."lottery");
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: o painel cadastra e altera o código. Nos pules, draw_code só pelo trigger.
-- ---------------------------------------------------------------------------
GRANT INSERT ("code") ON "draws" TO "sysjb_app";
GRANT UPDATE ("code") ON "draws" TO "sysjb_app";
