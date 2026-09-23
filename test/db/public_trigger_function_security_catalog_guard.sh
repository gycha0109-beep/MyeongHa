#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

missing_search_path="$("${psql_base[@]}" -At -c "
select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
  and not exists (
    select 1
    from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) cfg
    where cfg like 'search_path=%'
  );
")"

[[ -z "$missing_search_path" ]] || fail "public trigger functions lack explicit search_path: $missing_search_path"
pass "every public trigger function carries an explicit search_path"

security_definer="$("${psql_base[@]}" -At -c "
select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
  and p.prosecdef;
")"

[[ -z "$security_definer" ]] || fail "public trigger functions unexpectedly SECURITY DEFINER: $security_definer"
pass "every public trigger function remains SECURITY INVOKER"

echo "Public trigger function security catalog guard passed"
