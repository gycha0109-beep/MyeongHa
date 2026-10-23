#!/usr/bin/env bash
# Disposable PostgreSQL 17 non-superuser CREATEROLE reproduction.
# Never connect to production or access backup, secrets or user records.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true &&
   "${PGHOST:-}" == localhost &&
   "${PGUSER:-}" == ci_root &&
   "${PGDATABASE:-}" == postgres &&
   -z "${PGPASSWORD:-}" &&
   -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PROJECT_ID:-}" &&
   -z "${DATABASE_URL:-}" ]] || {
  echo 'HOLD_S3A_NON_SUPER_TEST_MUST_BE_DISPOSABLE_PG17' >&2
  exit 1
}

psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role postgres login createrole;
grant connect, create on database postgres to postgres;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(
  version text primary key, name text not null
);
insert into supabase_migrations.schema_migrations(version,name)
select 'synthetic_' || lpad(n::text,4,'0'), 'disposable_test'
from generate_series(1,172) as n;
insert into supabase_migrations.schema_migrations values
('20261008090417','synthetic_frontier_only');
grant usage on schema supabase_migrations to postgres;
grant select on supabase_migrations.schema_migrations to postgres;
SQL

# A non-superuser CREATEROLE receives automatic ADMIN=TRUE from bootstrap.
# Even after the same explicit GRANT then REVOKE pattern as pinned 1730,
# PostgreSQL 17 retains the bootstrap-admin grant. Never commit probe DDL.
PGUSER=postgres \
  psql -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
begin;
create role s3a_ci_pg17_admin_probe nologin noinherit nobypassrls;
grant s3a_ci_pg17_admin_probe to current_user;
revoke s3a_ci_pg17_admin_probe from current_user;
do $pg17_auto_admin$
begin
  if not exists (
    select 1
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles granted on granted.oid=m.roleid
    join pg_catalog.pg_roles grantee on grantee.oid=m.member
    join pg_catalog.pg_roles grantor on grantor.oid=m.grantor
    where granted.rolname='s3a_ci_pg17_admin_probe'
      and grantee.rolname='postgres'
      and grantor.rolsuper
      and m.admin_option and not m.set_option and not m.inherit_option
  ) then
    raise exception 'S3A CI: PG17 implicit non-superuser ADMIN grant not reproduced';
  end if;
end
$pg17_auto_admin$;
rollback;
SQL

# The corrected preflight must stop before the immutable proposal runs.
# Assert both the explicit denial and an unchanged target catalog.
log_file="${RUNNER_TEMP}/s3a-nonsuper-pg17-guard.log"
set +e
PGUSER=postgres \
  psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -f scripts/operations/saju-bridge-s3a-preflight.sql \
  -f supabase/proposals/1730_saju_bridge_single_project_operator_permit_v1.sql \
  -f scripts/operations/saju-bridge-s3a-postcheck.sql > "$log_file" 2>&1
exit_code=$?
set -e
if [[ "$exit_code" -ne 3 ]] ||
   ! grep -Fq 'S3A HOLD: PostgreSQL 17 non-superuser role creator cannot satisfy zero-membership contract' "$log_file"; then
  echo 'HOLD_S3A_CI_NON_SUPER_PREFLIGHT_NOT_FAIL_CLOSED' >&2
  exit 1
fi

catalog_state="$(psql -X -At -v ON_ERROR_STOP=1 -c "
select
  (to_regnamespace('saju_bridge_private') is null)::int,
  (select count(*) from pg_catalog.pg_roles
    where rolname in ('myeongha_saju_bridge_permit_owner',
                      'myeongha_saju_bridge_permit_executor')),
  (select count(*) from supabase_migrations.schema_migrations);
")"
[[ "$catalog_state" == '1|0|173' ]] || {
  echo 'HOLD_S3A_CI_NON_SUPER_MUST_ROLLBACK_WITHOUT_DDL' >&2
  exit 1
}
echo 'PASS_S3A_PG17_NON_SUPER_AUTO_ADMIN_AND_PRE_DDL_HOLD'
