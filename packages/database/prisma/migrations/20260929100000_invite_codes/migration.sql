-- Código de convite próprio (?convite=CDYGE) no lugar do ID exibido.
-- 5 caracteres de um alfabeto sem ambíguos (sem O, 0, I, 1): 32^5 ≈ 33,5 milhões de códigos.
-- Único no sistema todo (índice UNIQUE: nunca se repete, nem entre bancas) e fixo: a role de runtime só
-- informa no INSERT (na prática nem isso: o banco gera pelo DEFAULT) e não tem UPDATE na coluna.
-- Em colisão no cadastro (chance ínfima), o INSERT falha pelo UNIQUE e a API tenta de novo.

CREATE FUNCTION "generate_invite_code"() RETURNS text
  LANGUAGE sql
  VOLATILE
  AS $$
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  FROM generate_series(1, 5)
$$;

REVOKE ALL ON FUNCTION "generate_invite_code"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "generate_invite_code"() TO "sysjb_app";

ALTER TABLE "users" ADD COLUMN "invite_code" TEXT;

-- Usuários existentes: um código por vez, sorteando de novo enquanto já existir (RLS forçado suspenso só
-- aqui, para a dona enxergar todas as bancas e garantir a unicidade global).
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  r record;
  v_code text;
BEGIN
  FOR r IN SELECT "id" FROM "users" WHERE "invite_code" IS NULL ORDER BY "created_at" LOOP
    LOOP
      v_code := "generate_invite_code"();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "users" WHERE "invite_code" = v_code);
    END LOOP;
    UPDATE "users" SET "invite_code" = v_code WHERE "id" = r."id";
  END LOOP;
END;
$$;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

ALTER TABLE "users"
  ALTER COLUMN "invite_code" SET DEFAULT generate_invite_code(),
  ALTER COLUMN "invite_code" SET NOT NULL,
  ADD CONSTRAINT "users_invite_code_format" CHECK ("invite_code" ~ '^[A-HJ-NP-Z2-9]{5}$');

-- CreateIndex (nome do Prisma)
CREATE UNIQUE INDEX "users_invite_code_key" ON "users"("invite_code");

-- A API só lê o código. (INSERT explícito da coluna não é concedido: o DEFAULT é quem gera.)
