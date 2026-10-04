#!/usr/bin/env bash
set -euo pipefail

table='public.member_auth_rate_limit_buckets'
command='public.cmd_admit_member_auth_request_v1(text,bytea)'
fingerprint="decode(repeat('ab', 32), 'hex')"

psql -v ON_ERROR_STOP=1 -c "truncate table ${table}" >/dev/null

persistence="$(psql -Atqc "
  select c.relpersistence
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'member_auth_rate_limit_buckets'
")"
test "$persistence" = "u"

test "$(psql -Atqc "select pg_catalog.has_function_privilege('myeongha_api_executor', '${command}'::pg_catalog.regprocedure, 'EXECUTE')")" = "t"
for privilege in SELECT INSERT UPDATE DELETE; do
  test "$(psql -Atqc "select pg_catalog.has_table_privilege('myeongha_api_executor', '${table}', '${privilege}')")" = "f"
done

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

for i in $(seq 1 40); do
  (
    psql -Atq -v ON_ERROR_STOP=1 -c "
      set role myeongha_api_executor;
      select allowed::text
      from public.cmd_admit_member_auth_request_v1('sign-in', ${fingerprint});
    " > "$tmpdir/$i.out"
  ) &
done
wait

cat "$tmpdir"/*.out > "$tmpdir/results"
allowed_count="$(grep -c '^true$' "$tmpdir/results" || true)"
denied_count="$(grep -c '^false$' "$tmpdir/results" || true)"
test "$allowed_count" -eq 30
test "$denied_count" -eq 10

saturated_count="$(psql -Atq -v ON_ERROR_STOP=1 -c "
  set role myeongha_api_executor;
  select request_count
  from public.cmd_admit_member_auth_request_v1('sign-in', ${fingerprint});
")"
test "$saturated_count" -eq 31

for action in sign-up refresh; do
  result="$(psql -Atq -v ON_ERROR_STOP=1 -c "
    set role myeongha_api_executor;
    select allowed::text || ':' || request_count::text
    from public.cmd_admit_member_auth_request_v1('${action}', ${fingerprint});
  ")"
  test "$result" = "true:1"
done

psql -v ON_ERROR_STOP=1 -c "
  update ${table}
  set
    window_started_at = pg_catalog.clock_timestamp() - interval '61 seconds',
    reset_at = pg_catalog.clock_timestamp() - interval '1 second'
  where action = 'sign-in'
    and client_fingerprint = ${fingerprint};
" >/dev/null

reset_result="$(psql -Atq -v ON_ERROR_STOP=1 -c "
  set role myeongha_api_executor;
  select allowed::text || ':' || request_count::text
  from public.cmd_admit_member_auth_request_v1('sign-in', ${fingerprint});
")"
test "$reset_result" = "true:1"

if psql -q -v ON_ERROR_STOP=1 -c "
  set role myeongha_api_executor;
  select * from public.cmd_admit_member_auth_request_v1('sign-out', ${fingerprint});
" >/dev/null 2>&1; then
  echo "invalid sign-out action unexpectedly admitted" >&2
  exit 1
fi

if psql -q -v ON_ERROR_STOP=1 -c "
  set role myeongha_api_executor;
  select * from public.cmd_admit_member_auth_request_v1('sign-in', decode('aa', 'hex'));
" >/dev/null 2>&1; then
  echo "invalid short fingerprint unexpectedly admitted" >&2
  exit 1
fi

echo "member_auth_rate_limit_authority=pass"
echo "concurrent_allowed=30"
echo "concurrent_denied=10"
echo "endpoint_bucket_independence=pass"
echo "window_reset=pass"
echo "api_executor_direct_table_authority=false"
