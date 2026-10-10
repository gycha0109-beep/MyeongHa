#!/usr/bin/env bash
set -euo pipefail

# Reuse the real isolated Member Chat create/reuse fixture, including its
# concurrency, default-Release rollover and duplicate-corruption cases.
# The calling DB-authority runner gives this script a disposable database.
source test/db/member_character_thread_open_concurrency.sh >/dev/null

locator='public.qry_member_single_character_thread_locator_v1'
one='b2000000-0000-0000-0000-000000000001'
two='b2000000-0000-0000-0000-000000000002'
three='b2000000-0000-0000-0000-000000000003'
four='b2000000-0000-0000-0000-000000000004'
five='b2000000-0000-0000-0000-000000000005'
six='b2000000-0000-0000-0000-000000000006'
guest='b2000000-0000-0000-0000-000000000007'

first=$(runtime_query "$one" "select thread_id::text from $locator('$one','char-alpha');")
[[ "$first" == 'b5000000-0000-0000-0000-000000000001' ]] || fail "existing pinned Member thread locator mismatch: $first"
pass "D-05 existing Member Reader Thread located without mutation"

second=$(runtime_query "$two" "select thread_id::text from $locator('$two','char-alpha');")
[[ "$second" == 'b5000000-0000-0000-0000-000000000002' ]] || fail "new default bundle Member thread mismatch: $second"
pass "D-05 existing release-pinned Thread survives default release switch"

missing=$(runtime_query "$three" "select thread_id::text from $locator('$three','char-alpha');")
[[ -z "$missing" ]] || fail "D-05 fabricated a Thread where none exists: $missing"
pass "D-05 zero-result lookup does not create a Thread"

other_reader=$(runtime_query "$one" "select thread_id::text from $locator('$one','char-locked');")
[[ -z "$other_reader" ]] || fail "D-05 returned an unrelated Character Thread"
pass "D-05 Reader identity is scoped"

cross_owner=$(runtime_query "$one" "select thread_id::text from $locator('$one','char-alpha');")
[[ "$cross_owner" != *'b5000000-0000-0000-0000-000000000002'* ]] || fail "D-05 leaked another Member's thread"
pass "D-05 cross-Member Thread is excluded"

duplicate=$(runtime_query "$six" "select thread_id::text from $locator('$six','char-alpha');")
expected_duplicate=$(printf '%s\n' \
  'b5000000-0000-0000-0000-000000000061' \
  'b5000000-0000-0000-0000-000000000062')
[[ "$duplicate" == "$expected_duplicate" ]] || fail "D-05 failed to surface bounded duplicate ambiguity: $duplicate"
pass "D-05 duplicate Thread evidence remains 2 rows, never silently selected"

# No data mutation after reading: repeated locator invocations are identical.
repeated=$(runtime_query "$one" "select thread_id::text from $locator('$one','char-alpha');")
[[ "$repeated" == "$first" ]] || fail "D-05 reader locator is not idempotent"
pass "D-05 repeated lookup reuses existing identity"

expect_runtime_fail "D-05 forged cross-Subject request" "$one" \
  'subject execution context mismatch' "select * from $locator('$two','char-alpha');"
expect_runtime_fail "D-05 missing input" "$one" \
  'Member Reader thread locator requires a canonical subject and Reader' "select * from $locator('$one','');"
expect_runtime_fail "D-05 Guest cannot discover Member Chat" "$guest" \
  'Member Reader thread locator requires an active canonical Member' "select * from $locator('$guest','char-alpha');"
expect_runtime_fail "D-05 deletion-pending Member denied" "$five" \
  'Member Reader thread locator requires an active canonical Member' "select * from $locator('$five','char-alpha');"

# No direct API execution from public / Supabase roles; only the Subject-scoped
# API executor may run the SECURITY INVOKER read function.
for role in public anon authenticated service_role; do
  if [[ "$role" != "public" ]] && ! "${psql_base[@]}" -c "select 1 from pg_roles where rolname='$role';" | grep -qx 1; then
    continue
  fi
  allowed=$("${psql_base[@]}" -c "select pg_catalog.has_function_privilege('$role', '$locator(uuid,text)', 'EXECUTE')::int;")
  [[ "$allowed" == '0' ]] || fail "D-05 unauthorized $role EXECUTE"
done
allowed=$("${psql_base[@]}" -c "select pg_catalog.has_function_privilege('myeongha_api_executor', '$locator(uuid,text)', 'EXECUTE')::int;")
[[ "$allowed" == '1' ]] || fail "D-05 executor missing EXECUTE"
definer=$("${psql_base[@]}" -c "select prosecdef::int from pg_proc where oid='$locator(uuid,text)'::regprocedure;")
[[ "$definer" == '0' ]] || fail "D-05 function unexpectedly SECURITY DEFINER"
pass "D-05 function is API-executor-only SECURITY INVOKER"

# Existing Member table privileges remain unchanged; this migration adds only
# a function EXECUTE grant, not direct Thread INSERT/UPDATE.
insert_access=$("${psql_base[@]}" -c "select pg_catalog.has_table_privilege('myeongha_api_executor','public.conversation_threads','INSERT')::int;")
[[ "$insert_access" == '0' ]] || fail "D-05 granted direct Chat Thread write privilege"
pass "D-05 no new Thread write privilege"

echo "PASS D-05 existing Member Reader Thread discovery PostgreSQL integration"
