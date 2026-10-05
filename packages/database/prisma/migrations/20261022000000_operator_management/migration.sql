-- Cadastro de operadores pelo painel (Administração > Operadores): o Gerente cadastra, altera, ativa/desativa e gera
-- nova senha dos operadores da própria banca. A role de runtime continua sem INSERT/UPDATE em operators: tudo passa
-- pelas funções abaixo (SECURITY DEFINER, sujeitas ao RLS da banca corrente), que conferem de novo, no banco, que quem
-- age é um operador ATIVO desta banca com perfil MANAGER (o único com operators.manage em ROLE_PERMISSIONS — mudar lá
-- exige migration) e que ele não mexe no próprio perfil, na própria situação nem na própria senha (assim a banca nunca
-- fica sem Gerente ativo). Desativar e gerar senha encerram as sessões abertas do operador.
-- SQLSTATE SJ009: o Gerente tentou mexer no próprio perfil, situação ou senha (a API traduz para 409).
-- E-mail repetido (único no sistema todo): unique_violation (a API traduz para 409 no campo e-mail).
-- Só funções e privilégios; nenhuma mudança de tabela.

-- Quem age: operador ativo desta banca com perfil MANAGER.
CREATE FUNCTION "operator_assert_manager"(p_actor uuid) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  IF "app_current_tenant_id"() IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "operators" o
    WHERE o."tenant_id" = "app_current_tenant_id"() AND o."id" = p_actor AND o."active" AND o."role" = 'MANAGER'
  ) THEN
    RAISE EXCEPTION 'operator not allowed to manage operators' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION "operator_assert_manager"(uuid) FROM PUBLIC;

-- Encerra as sessões abertas de um operador da banca corrente.
CREATE FUNCTION "operator_revoke_sessions"(p_operator uuid) RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  UPDATE "operator_sessions" SET "revoked_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "operator_id" = p_operator AND "revoked_at" IS NULL
$$;

REVOKE ALL ON FUNCTION "operator_revoke_sessions"(uuid) FROM PUBLIC;

-- Cadastra um operador na banca corrente (ativo). Devolve o id.
CREATE FUNCTION "operator_create"(p_actor uuid, p_name text, p_email text, p_role text, p_password_hash text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  INSERT INTO "operators" ("tenant_id", "name", "email", "password_hash", "role", "active", "updated_at")
  VALUES ("app_current_tenant_id"(), p_name, p_email, p_password_hash, p_role::"operator_role", true, now())
  RETURNING "id" INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION "operator_create"(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "operator_create"(uuid, text, text, text, text) TO "sysjb_app";

-- Altera nome, e-mail e perfil. O próprio Gerente não muda o próprio perfil (SJ009).
CREATE FUNCTION "operator_update"(p_actor uuid, p_id uuid, p_name text, p_email text, p_role text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_operator "operators"%ROWTYPE;
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  SELECT * INTO v_operator FROM "operators" WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operator not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_id = p_actor AND v_operator."role"::text <> p_role THEN
    RAISE EXCEPTION 'managers cannot change their own role' USING ERRCODE = 'SJ009';
  END IF;
  UPDATE "operators"
     SET "name" = p_name, "email" = p_email, "role" = p_role::"operator_role", "updated_at" = now()
   WHERE "id" = p_id;
END;
$$;

REVOKE ALL ON FUNCTION "operator_update"(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "operator_update"(uuid, uuid, text, text, text) TO "sysjb_app";

-- Ativa ou desativa (desativar encerra as sessões). O próprio Gerente não muda a própria situação (SJ009).
CREATE FUNCTION "operator_set_active"(p_actor uuid, p_id uuid, p_active boolean)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  IF p_id = p_actor THEN
    RAISE EXCEPTION 'managers cannot change their own status' USING ERRCODE = 'SJ009';
  END IF;
  UPDATE "operators" SET "active" = p_active, "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operator not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT p_active THEN
    PERFORM "operator_revoke_sessions"(p_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION "operator_set_active"(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "operator_set_active"(uuid, uuid, boolean) TO "sysjb_app";

-- Troca a senha (hash gerado pela API) e encerra as sessões do operador. Não vale para o próprio Gerente (SJ009).
CREATE FUNCTION "operator_set_password"(p_actor uuid, p_id uuid, p_password_hash text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
BEGIN
  PERFORM "operator_assert_manager"(p_actor);
  IF p_id = p_actor THEN
    RAISE EXCEPTION 'managers cannot reset their own password here' USING ERRCODE = 'SJ009';
  END IF;
  UPDATE "operators" SET "password_hash" = p_password_hash, "updated_at" = now()
   WHERE "tenant_id" = "app_current_tenant_id"() AND "id" = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operator not found' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM "operator_revoke_sessions"(p_id);
END;
$$;

REVOKE ALL ON FUNCTION "operator_set_password"(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "operator_set_password"(uuid, uuid, text) TO "sysjb_app";
