#!/usr/bin/env bash
set -euo pipefail

probe_schema="__myeongha_acl_probe"

cleanup() {
  psql -X -v ON_ERROR_STOP=1 -qAtc "drop schema if exists ${probe_schema} cascade" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup

psql -X -v ON_ERROR_STOP=1 <<'SQL'
create schema __myeongha_acl_probe;
revoke all on schema __myeongha_acl_probe from public;
revoke all on schema __myeongha_acl_probe from anon;
revoke all on schema __myeongha_acl_probe from authenticated;

create table __myeongha_acl_probe.future_table (
  id integer primary key,
  payload text not null
);
insert into __myeongha_acl_probe.future_table (id, payload)
values (1, 'probe');

create sequence __myeongha_acl_probe.future_sequence start 41;

create function __myeongha_acl_probe.future_function()
returns integer
language sql
as $$ select 42 $$;

revoke all on function __myeongha_acl_probe.future_function() from public;

grant select on table __myeongha_acl_probe.future_table to anon, authenticated;
grant usage, select on sequence __myeongha_acl_probe.future_sequence to anon, authenticated;
grant execute on function __myeongha_acl_probe.future_function() to anon, authenticated;

grant usage on schema __myeongha_acl_probe to myeongha_api_executor;
grant execute on function __myeongha_acl_probe.future_function() to myeongha_api_executor;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated']
  loop
    if not pg_catalog.has_table_privilege(v_role, '__myeongha_acl_probe.future_table', 'SELECT') then
      raise exception 'FAIL % is missing the simulated future table grant', v_role;
    end if;

    if not pg_catalog.has_sequence_privilege(v_role, '__myeongha_acl_probe.future_sequence', 'USAGE') then
      raise exception 'FAIL % is missing the simulated future sequence grant', v_role;
    end if;

    if not pg_catalog.has_function_privilege(
      v_role,
      '__myeongha_acl_probe.future_function()'::pg_catalog.regprocedure,
      'EXECUTE'
    ) then
      raise exception 'FAIL % is missing the simulated future function grant', v_role;
    end if;

    if pg_catalog.has_schema_privilege(v_role, '__myeongha_acl_probe', 'USAGE') then
      raise exception 'FAIL % unexpectedly has probe schema USAGE', v_role;
    end if;
  end loop;

  if not pg_catalog.has_schema_privilege('myeongha_api_executor', '__myeongha_acl_probe', 'USAGE') then
    raise exception 'FAIL myeongha_api_executor did not receive explicit probe schema USAGE';
  end if;
end
$$;
SQL

expect_schema_denied() {
  local role="$1"
  local operation="$2"
  local sql="$3"
  local output
  local status

  set +e
  output="$(psql -X -v ON_ERROR_STOP=1 -qAtc "set role ${role}; ${sql}" 2>&1)"
  status=$?
  set -e

  if [[ "${status}" -eq 0 ]]; then
    echo "FAIL ${role} ${operation} unexpectedly succeeded without schema USAGE" >&2
    exit 1
  fi

  if ! grep -Fq "permission denied for schema ${probe_schema}" <<<"${output}"; then
    echo "FAIL ${role} ${operation} failed for an unexpected reason" >&2
    echo "${output}" >&2
    exit 1
  fi
}

for role in anon authenticated; do
  expect_schema_denied "${role}" "table SELECT" \
    "select payload from ${probe_schema}.future_table where id = 1"
  expect_schema_denied "${role}" "sequence nextval" \
    "select nextval('${probe_schema}.future_sequence')"
  expect_schema_denied "${role}" "function EXECUTE" \
    "select ${probe_schema}.future_function()"
done

executor_result="$(psql -X -v ON_ERROR_STOP=1 -qAtc \
  "set role myeongha_api_executor; select ${probe_schema}.future_function()")"

if [[ "${executor_result}" != "42" ]]; then
  echo "FAIL explicit executor schema USAGE did not preserve the allowlisted function path" >&2
  exit 1
fi

echo "schema_usage_authority_model_negative: PASS"
