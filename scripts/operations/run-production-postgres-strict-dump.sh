#!/usr/bin/env bash
set -euo pipefail
umask 077

mode="${1:-}"
output_file="${2:-}"

[[ "$mode" == 'roles' || "$mode" == 'schema' || "$mode" == 'data' ]]
[[ -n "$output_file" ]]
[[ "$output_file" == "$RUNNER_TEMP/"* ]]
[[ "$SUPABASE_POSTGRES_IMAGE" == 'supabase/postgres:17.6.1.167' ]]
[[ "$PGSSLMODE" == 'verify-full' ]]
[[ -n "$PGSSLROOTCERT" && -f "$PGSSLROOTCERT" ]]
[[ -n "$PGHOST" && -n "$PGPORT" && -n "$PGUSER" && -n "$PGPASSWORD" && -n "$PGDATABASE" ]]

container_root_certificate='/run/myeongha/server-root.crt'

role_script="$(cat <<'BASH'
set -euo pipefail
reserved_roles='anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin'
allowed_configs='pgaudit.*|pgrst.*|session_replication_role|statement_timeout|track_io_timing'
pg_dumpall \
  --roles-only \
  --role "postgres" \
  --quote-all-identifier \
  --no-role-passwords \
  --no-comments \
| sed -E 's/^\\(un)?restrict .*$/-- &/' \
| sed -E "s/^CREATE ROLE \\"($reserved_roles)\\"/-- &/" \
| sed -E "s/^ALTER ROLE \\"($reserved_roles)\\"/-- &/" \
| sed -E 's/ (NOSUPERUSER|NOREPLICATION)//g' \
| sed -E "s/^-- (.* SET \\"($allowed_configs)\\" .*)/\\1/" \
| sed -E "s/GRANT \\".*\\" TO \\"($reserved_roles)\\"/-- &/" \
| sed -E '/^--/d' \
| uniq
echo "RESET ALL;"
BASH
)"

schema_script="$(cat <<'BASH'
set -euo pipefail
excluded_schemas='information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault'
pg_dump \
  --schema-only \
  --quote-all-identifier \
  --role "postgres" \
  --exclude-schema "$excluded_schemas" \
| sed -E 's/^\\(un)?restrict .*$/-- &/' \
| sed -E 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' \
| sed -E 's/^CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/' \
| sed -E 's/^CREATE SEQUENCE "/CREATE SEQUENCE IF NOT EXISTS "/' \
| sed -E 's/^CREATE VIEW "/CREATE OR REPLACE VIEW "/' \
| sed -E 's/^CREATE FUNCTION "/CREATE OR REPLACE FUNCTION "/' \
| sed -E 's/^CREATE TRIGGER "/CREATE OR REPLACE TRIGGER "/' \
| sed -E 's/^CREATE PUBLICATION "supabase_realtime/-- &/' \
| sed -E 's/^CREATE EVENT TRIGGER /-- &/' \
| sed -E 's/^         WHEN TAG IN /-- &/' \
| sed -E 's/^   EXECUTE FUNCTION /-- &/' \
| sed -E 's/^ALTER EVENT TRIGGER /-- &/' \
| sed -E 's/^ALTER PUBLICATION "supabase_realtime_/-- &/' \
| sed -E 's/^ALTER FOREIGN DATA WRAPPER (.+) OWNER TO /-- &/' \
| sed -E 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' \
| sed -E 's/^GRANT ALL ON FOREIGN DATA WRAPPER (.+) TO "postgres" WITH GRANT OPTION/-- &/' \
| sed -E "s/^GRANT (.+) ON (.+) \\"($excluded_schemas)\\"/-- &/" \
| sed -E "s/^REVOKE (.+) ON (.+) \\"($excluded_schemas)\\"/-- &/" \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pg_tle").+/\\1;/' \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgsodium").+/\\1;/' \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgmq").+/\\1;/' \
| sed -E 's/^COMMENT ON EXTENSION (.+)/-- &/' \
| sed -E 's/^CREATE POLICY "cron_job_/-- &/' \
| sed -E 's/^ALTER TABLE "cron"/-- &/' \
| sed -E 's/^SET transaction_timeout = 0;/-- &/' \
| sed -E '/^--/d'
BASH
)"

data_script="$(cat <<'BASH'
set -euo pipefail
excluded_schemas='information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor'
echo "SET session_replication_role = replica;
"
pg_dump \
  --data-only \
  --quote-all-identifier \
  --role "postgres" \
  --exclude-schema "$excluded_schemas" \
  --exclude-table "auth.schema_migrations" \
  --exclude-table "storage.migrations" \
  --exclude-table "supabase_functions.migrations" \
  --exclude-table "storage.buckets_vectors" \
  --exclude-table "storage.vector_indexes" \
  --exclude-table "public.member_auth_rate_limit_buckets" \
  --schema "*" \
| sed -E 's/^\\(un)?restrict .*$/-- &/'
echo "RESET ALL;"
BASH
)"

case "$mode" in
  roles) dump_script="$role_script" ;;
  schema) dump_script="$schema_script" ;;
  data) dump_script="$data_script" ;;
esac

docker run --rm \
  --network host \
  --add-host host.docker.internal:host-gateway \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$PGSSLROOTCERT,dst=$container_root_certificate,readonly" \
  --env PGHOST \
  --env PGPORT \
  --env PGUSER \
  --env PGPASSWORD \
  --env PGDATABASE \
  --env PGSSLMODE=verify-full \
  --env PGSSLROOTCERT="$container_root_certificate" \
  --entrypoint bash \
  "$SUPABASE_POSTGRES_IMAGE" \
  -c "$dump_script" > "$output_file"

test -s "$output_file"
printf 'strict_dump_transport=pass mode=%s tls_mode=verify-full root_certificate_mounted=true\n' "$mode"
