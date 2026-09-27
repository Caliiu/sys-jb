-- Troca de senha pelo próprio usuário (POST /v1/me/password): a role de runtime passa a poder atualizar
-- o hash. Antes só o cadastro gravava a coluna. Continuam fora do UPDATE: birth_date, tenant_id, id,
-- display_id e status (este só por operador, via a concessão da migration do painel).
-- O CHECK "users_password_hash_format" (argon2id) segue valendo para qualquer valor gravado.
GRANT UPDATE ("password_hash") ON "users" TO "sysjb_app";
