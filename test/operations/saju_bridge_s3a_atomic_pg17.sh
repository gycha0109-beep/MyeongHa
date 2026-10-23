#!/usr/bin/env bash
set -euo pipefail
[[ "$GITHUB_ACTIONS" == 'true' && "$PGHOST" == 'localhost' &&
    "$PGDATABASE" == myeongha_s3a_ci* && "$PGUSER" == postgres ]] || {
  echo 'HOLD_S3A_TEST_MUST_BE_DISPOSABLE_PG17' >&2; exit 1;
}
[[ ! -v SUPABASE_DB_PASSWORD && ! -v SUPABASE_PROJECT_ID &&
    ! -v DATABASE_URL ]] || {
  echo 'HOLD_S3A_TEST_NO_PRODUCTION_SECRETS_ALLOWED' >&2; exit 1;
}
psql -X -v ON_ERROR_STOP=1 -f test/db/bootstrap_supabase_auth_stub.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(
  version text primary key, name text not null
);
insert into supabase_migrations.schema_migrations(version,name)
select 'synthetic_' || lpad(n::text,4,'0'), 'disposable_test'
from generate_series(1,172) as n;
insert into supabase_migrations.schema_migrations values
('20261008090417','synthetic_frontier_only');
create role myeongha_api_executor nologin;
create role myeongha_runtime nologin;
create role myeongha_worker_runtime nologin;
SQL
[[ "$(psql -X -At -v ON_ERROR_STOP=1 -c \
  "select count(*) from supabase_migrations.schema_migrations;")" == 173 ]]

# The exact proposed SQL and exact pre-COMMIT checker run as one transaction.
psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql \
  -f scripts/operations/saju-bridge-s3a-postcheck.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 \
  -f scripts/operations/saju-bridge-s3a-postcheck.sql >/dev/null

# Inject forbidden client SELECT in a NEW transaction. Postcheck must fail
# and ROLLBACK the GRANT, preserving the previous safe state.
set +e
psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -c 'grant select on saju_bridge_private.operator_permits_v1 to anon' \
  -f scripts/operations/saju-bridge-s3a-postcheck.sql >/dev/null 2>&1
code=$?
set -e
[[ "$code" -ne 0 ]] || { echo 'HOLD_S3A_ACL_POSTCHECK_FAIL_OPEN' >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 \
  -f scripts/operations/saju-bridge-s3a-postcheck.sql >/dev/null
[[ "$(psql -X -At -v ON_ERROR_STOP=1 -c \
  "select count(*) from saju_bridge_private.operator_permits_v1;")" == 0 ]]
echo 'PASS_S3A_PINNED_SQL_POSTCHECK_AND_ATOMIC_ACL_ROLLBACK'
