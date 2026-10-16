#!/usr/bin/env bash
# Positive control for S3A's exact zero-membership contract.
# Only a disposable PostgreSQL 17 GitHub Actions service may run this probe.
# This explicitly does NOT establish a supported Supabase-hosted execution path.
set -euo pipefail

[[ "${GITHUB_ACTIONS:-}" == true &&
   "${PGHOST:-}" == localhost &&
   "${PGPORT:-}" == 5432 &&
   "${PGUSER:-}" == postgres &&
   "${PGDATABASE:-}" == postgres &&
   "${PGPASSWORD:-}" == s3a-test-only &&
   -n "${RUNNER_TEMP:-}" &&
   -z "${DATABASE_URL:-}" &&
   -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PROJECT_ID:-}" &&
   -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" ]] || {
  echo 'HOLD_S3A_PRIVILEGED_CONTROL_DISPOSABLE_PG17_ONLY' >&2
  exit 1
}

identity="$(psql -X -At -v ON_ERROR_STOP=1 -c "
select current_database(), current_user,
  (current_setting('server_version_num')::integer / 10000),
  (select rolsuper from pg_catalog.pg_roles where rolname=current_user);
")"
[[ "$identity" == 'postgres|postgres|17|t' ]] || {
  echo 'HOLD_S3A_PRIVILEGED_CONTROL_WRONG_EXECUTOR' >&2
  exit 1
}

before="$(psql -X -At -v ON_ERROR_STOP=1 -c "
select (pg_catalog.to_regnamespace('saju_bridge_private') is null)::int,
  (select count(*) from pg_catalog.pg_roles
    where rolname in ('myeongha_saju_bridge_permit_owner',
                      'myeongha_saju_bridge_permit_executor'));
")"
[[ "$before" == '1|0' ]] || {
  echo 'HOLD_S3A_PRIVILEGED_CONTROL_DIRTY_START' >&2
  exit 1
}

# This local fixture mirrors ONLY the verified migration count/frontier.
# The fixture is created in the disposable service's 'postgres' database.
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
SQL

# Unlike existing S3A atomic tests, this positive control includes the EXACT
# preflight first. Entire bundle is run inside a disposable transaction, and
# always explicitly ROLLBACK after the unchanged postcheck has succeeded.
# The 1730 proposal's pinned SHA is separately checked by the workflow.
psql -X -q -v ON_ERROR_STOP=1 \
  -c 'begin;' \
  -f scripts/operations/saju-bridge-s3a-preflight.sql \
  -f supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql \
  -f scripts/operations/saju-bridge-s3a-postcheck.sql \
  -c 'rollback;' >/dev/null

after="$(psql -X -At -v ON_ERROR_STOP=1 -c "
select (pg_catalog.to_regnamespace('saju_bridge_private') is null)::int,
  (select count(*) from pg_catalog.pg_roles
    where rolname in ('myeongha_saju_bridge_permit_owner',
                      'myeongha_saju_bridge_permit_executor')),
  (select count(*) from supabase_migrations.schema_migrations),
  (select max(version) from supabase_migrations.schema_migrations
     where version ~ '^[0-9]{14}$');
")"
[[ "$after" == '1|0|173|20261008090417' ]] || {
  echo 'HOLD_S3A_PRIVILEGED_CONTROL_DID_NOT_ROLLBACK' >&2
  exit 1
}

echo 'PASS_S3A_PG17_PRIVILEGED_EXACT_PREFLIGHT_PROPOSAL_POSTCHECK_ROLLBACK'
