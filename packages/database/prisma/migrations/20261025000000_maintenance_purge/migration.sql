-- Limpeza diária do que é descartável e só cresceria: sessões encerradas (de jogadores e operadores), tentativas de
-- login antigas e o histórico de consultas ao provedor de resultados. Nada de dinheiro, prêmio, rodada ou auditoria:
-- essas tabelas não entram aqui (e as de dinheiro são só inclusão).
--
-- Prazos fixos aqui (a API só chama; não escolhe o que nem até quando apagar):
--   - sessões: 7 dias depois de expirar ou de serem encerradas (sobra para investigar um acesso);
--   - tentativas de login: 1 dia (o bloqueio olha só os últimos 15 minutos);
--   - consultas ao provedor de resultados: 90 dias (a cota é do mês corrente).
-- A role de runtime não tem DELETE nessas tabelas: só executa esta função. Ela roda como dona e entra em cada banca
-- (o RLS forçado vale também para a dona), com o contexto restaurado no fim.

CREATE FUNCTION "maintenance_purge"()
  RETURNS TABLE ("sessions" bigint, "operator_sessions" bigint, "login_failures" bigint,
                 "operator_login_failures" bigint, "result_consultations" bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
DECLARE
  v_previous text := current_setting('app.tenant_id', true);
  v_tenant uuid;
  v_count bigint;
  v_sessions bigint := 0;
  v_operator_sessions bigint := 0;
  v_login_failures bigint := 0;
  v_operator_login_failures bigint;
  v_result_consultations bigint;
BEGIN
  FOR v_tenant IN SELECT "id" FROM "tenants" LOOP
    PERFORM set_config('app.tenant_id', v_tenant::text, true);

    DELETE FROM "sessions"
     WHERE "tenant_id" = v_tenant
       AND ("expires_at" < now() - interval '7 days' OR "revoked_at" < now() - interval '7 days');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_sessions := v_sessions + v_count;

    DELETE FROM "operator_sessions"
     WHERE "tenant_id" = v_tenant
       AND ("expires_at" < now() - interval '7 days' OR "revoked_at" < now() - interval '7 days');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_operator_sessions := v_operator_sessions + v_count;

    DELETE FROM "login_failures" WHERE "tenant_id" = v_tenant AND "created_at" < now() - interval '1 day';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_login_failures := v_login_failures + v_count;
  END LOOP;
  PERFORM set_config('app.tenant_id', COALESCE(v_previous, ''), true);

  -- Tabelas globais (sem banca).
  DELETE FROM "operator_login_failures" WHERE "created_at" < now() - interval '1 day';
  GET DIAGNOSTICS v_operator_login_failures = ROW_COUNT;

  DELETE FROM "result_consultations" WHERE "requested_at" < now() - interval '90 days';
  GET DIAGNOSTICS v_result_consultations = ROW_COUNT;

  RETURN QUERY SELECT v_sessions, v_operator_sessions, v_login_failures, v_operator_login_failures,
                      v_result_consultations;
END;
$$;

REVOKE ALL ON FUNCTION "maintenance_purge"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "maintenance_purge"() TO "sysjb_app";
