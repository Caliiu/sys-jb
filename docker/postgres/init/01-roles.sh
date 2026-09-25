#!/bin/sh
# Executado apenas na primeira inicialização do volume.
# sysjb_migrator: dona do schema e das tabelas (migrations/seed). CREATEDB para o shadow DB do `prisma migrate dev`.
# sysjb_app: credencial de runtime da API. Sem SUPERUSER, sem BYPASSRLS, não é dona de nada.
set -eu

psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres \
  -v migrator_password="$SYSJB_MIGRATOR_PASSWORD" \
  -v app_password="$SYSJB_APP_PASSWORD" <<'SQL'
CREATE ROLE sysjb_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE CREATEDB PASSWORD :'migrator_password';
CREATE ROLE sysjb_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOINHERIT PASSWORD :'app_password';
CREATE DATABASE sysjb OWNER sysjb_migrator;
CREATE DATABASE sysjb_test OWNER sysjb_migrator;
SQL

for db in sysjb sysjb_test; do
  psql -v ON_ERROR_STOP=1 --username postgres --dbname "$db" <<SQL
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE $db TO sysjb_migrator;
GRANT CONNECT ON DATABASE $db TO sysjb_app;
ALTER SCHEMA public OWNER TO sysjb_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO sysjb_app;
SQL
done
