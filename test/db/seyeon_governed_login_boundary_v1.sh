#!/usr/bin/env bash
set -euo pipefail

# D3B2B-3B2 offline proof with two *independent PostgreSQL backend sessions*.
# This is not a Production credential provisioning / network authentication test.
# No actual password, API request, operator budget, or external inference.
# Watchtower-Track: character-memory
governed_login="myeongha_seyeon_governed_login_ci"
ordinary_login="myeongha_seyeon_ordinary_login_ci"
error_file="$(mktemp)"
cleanup() {
  psql -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1 || true
drop role if exists myeongha_seyeon_governed_login_ci;
drop role if exists myeongha_seyeon_ordinary_login_ci;
SQL
  rm -f "$error_file"
}
trap cleanup EXIT

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $setup$
begin
  if exists (
    select 1 from pg_catalog.pg_roles
    where rolname in (
      'myeongha_seyeon_governed_login_ci',
      'myeongha_seyeon_ordinary_login_ci'
    )
  ) then
    raise exception 'D3B2B test synthetic database LOGIN roles already exist';
  end if;
end $setup$;
create role myeongha_seyeon_governed_login_ci
  login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;
create role myeongha_seyeon_ordinary_login_ci
  login noinherit nosuperuser nobypassrls nocreatedb nocreaterole;
grant myeongha_seyeon_governed_executor
  to myeongha_seyeon_governed_login_ci;
grant myeongha_api_executor
  to myeongha_seyeon_ordinary_login_ci;
SQL

# Each psql process gets a fresh connection and a different session_user.
# On older PG versions, pg_has_role supports MEMBER, not SET; the actual
# SET ROLE success/denial tests below are the authoritative privilege proof.
governed_result="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
set session authorization myeongha_seyeon_governed_login_ci;
select case when
  session_user='myeongha_seyeon_governed_login_ci'
  and current_user=session_user
  and pg_catalog.pg_has_role(session_user,
    'myeongha_seyeon_governed_executor','MEMBER')
  and not pg_catalog.pg_has_role(session_user,
    'myeongha_api_executor','MEMBER')
  and not pg_catalog.pg_has_role(session_user,
    'myeongha_api_executor','MEMBER')
  and not pg_catalog.has_function_privilege(session_user,
    'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)',
    'EXECUTE')
then 'PASS' else 'FAIL' end;
begin;
set local role myeongha_seyeon_governed_executor;
select case when
  current_user='myeongha_seyeon_governed_executor'
  and pg_catalog.has_function_privilege(current_user,
    'public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)',
    'EXECUTE')
  and not pg_catalog.has_function_privilege(current_user,
    'public.cmd_record_seyeon_ai_call_cost_v1(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE')
then 'PASS' else 'FAIL' end;
rollback;
SQL
)"
[[ "$governed_result" == $'PASS\nPASS' ]] || {
  echo "FAIL governed-only independent session: $governed_result" >&2
  exit 1
}

# This must be an actual unauthorized SET ROLE attempt, not only an ACL read.
if psql -X -qAt -v ON_ERROR_STOP=1 2>"$error_file" <<'SQL' >/dev/null
set session authorization myeongha_seyeon_governed_login_ci;
set role myeongha_api_executor;
SQL
then
  echo "FAIL governed login can enter common legacy execution role" >&2
  exit 1
fi
grep -Eiq '(permission denied|not a member)' "$error_file" || {
  echo "FAIL governed session rejection was not a role authority denial" >&2
  exit 1
}

ordinary_result="$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
set session authorization myeongha_seyeon_ordinary_login_ci;
select case when
  session_user='myeongha_seyeon_ordinary_login_ci'
  and pg_catalog.pg_has_role(session_user,'myeongha_api_executor','MEMBER')
  and not pg_catalog.pg_has_role(session_user,
    'myeongha_seyeon_governed_executor','MEMBER')
then 'PASS' else 'FAIL' end;
begin;
set local role myeongha_api_executor;
select case when
  current_user='myeongha_api_executor'
  and pg_catalog.has_function_privilege(current_user,
    'public.cmd_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text)',
    'EXECUTE')
  and not pg_catalog.has_function_privilege(current_user,
    'public.seyeon_ai_start_internal_v1(uuid,uuid,uuid,text,uuid,text,text,text)',
    'EXECUTE')
then 'PASS' else 'FAIL' end;
rollback;
SQL
)"
[[ "$ordinary_result" == $'PASS\nPASS' ]] || {
  echo "FAIL ordinary OFF separate session: $ordinary_result" >&2
  exit 1
}

if psql -X -qAt -v ON_ERROR_STOP=1 2>"$error_file" <<'SQL' >/dev/null
set session authorization myeongha_seyeon_ordinary_login_ci;
set role myeongha_seyeon_governed_executor;
SQL
then
  echo "FAIL ordinary login could become governed execution role" >&2
  exit 1
fi
grep -Eiq '(permission denied|not a member)' "$error_file" || {
  echo "FAIL ordinary session rejection was not a role authority denial" >&2
  exit 1
}

echo "D3B2B-3B2 synthetic independent-session LOGIN boundary PASS"
