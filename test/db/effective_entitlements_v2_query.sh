#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1" needle="$2" sql="$3" out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  [[ $rc -ne 0 ]] || { echo "$out" >&2; fail "$label unexpectedly succeeded"; }
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('e6100000-0000-4000-8000-000000000001'),
  ('e6100000-0000-4000-8000-000000000002'),
  ('e6100000-0000-4000-8000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('e6200000-0000-4000-8000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('e6200000-0000-4000-8000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('e6200000-0000-4000-8000-000000000010','member','e6100000-0000-4000-8000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('e6200000-0000-4000-8000-000000000020','member','e6100000-0000-4000-8000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('e6200000-0000-4000-8000-000000000030','member','e6100000-0000-4000-8000-000000000003','deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('e6200000-0000-4000-8000-000000000101','guest',null,'merged','e6200000-0000-4000-8000-000000000010',clock_timestamp()-interval '3 days',clock_timestamp()),
  ('e6200000-0000-4000-8000-000000000102','guest',null,'merged','e6200000-0000-4000-8000-000000000010',clock_timestamp()-interval '2 days',clock_timestamp()),
  ('e6200000-0000-4000-8000-000000000201','guest',null,'merged','e6200000-0000-4000-8000-000000000020',clock_timestamp()-interval '1 day',clock_timestamp());

insert into public.entitlements(
  id,subject_id,entitlement_key,scope_key,status,active_grant_count,effective_valid_until,revision,created_at,updated_at
) values
  ('e6300000-0000-4000-8000-000000000001','e6200000-0000-4000-8000-000000000001','guest.self',null,'active',1,null,1,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000002','e6200000-0000-4000-8000-000000000001','guest.expired',null,'active',1,timestamptz '2026-08-31 23:59:59+00',1,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000003','e6200000-0000-4000-8000-000000000001','guest.inactive',null,'inactive',0,null,1,clock_timestamp(),clock_timestamp()),

  ('e6300000-0000-4000-8000-000000000010','e6200000-0000-4000-8000-000000000010','member.self','scope-a','active',1,timestamptz '2026-11-01 00:00:00+00',2,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000011','e6200000-0000-4000-8000-000000000010','shared.bound',null,'active',1,timestamptz '2026-10-01 00:00:00+00',3,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000012','e6200000-0000-4000-8000-000000000010','shared.unbounded','scope-u','active',1,timestamptz '2026-10-15 00:00:00+00',3,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000013','e6200000-0000-4000-8000-000000000010','member.expired',null,'active',1,timestamptz '2026-09-01 00:00:00+00',3,clock_timestamp(),clock_timestamp()),

  ('e6300000-0000-4000-8000-000000000101','e6200000-0000-4000-8000-000000000101','history.only',null,'active',1,timestamptz '2027-01-01 00:00:00+00',4,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000102','e6200000-0000-4000-8000-000000000101','shared.bound',null,'active',1,timestamptz '2026-12-01 00:00:00+00',4,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000103','e6200000-0000-4000-8000-000000000102','shared.unbounded','scope-u','active',1,null,5,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000104','e6200000-0000-4000-8000-000000000102','history.inactive',null,'inactive',0,null,5,clock_timestamp(),clock_timestamp()),

  ('e6300000-0000-4000-8000-000000000201','e6200000-0000-4000-8000-000000000201','foreign.history',null,'active',1,null,6,clock_timestamp(),clock_timestamp()),
  ('e6300000-0000-4000-8000-000000000202','e6200000-0000-4000-8000-000000000020','foreign.member',null,'active',1,null,6,clock_timestamp(),clock_timestamp());
SQL

EFFECTIVE_AT="2026-09-01 00:00:00+00"

rows=$("${psql_base[@]}" -At -F '|' -c "select entitlement_key,coalesce(scope_key,'GLOBAL'),coalesce(to_char(effective_valid_until at time zone 'UTC','YYYY-MM-DD'),'NULL') from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000001',timestamptz '$EFFECTIVE_AT');")
[[ "$rows" == 'guest.self|GLOBAL|NULL' ]] || { printf '%s\n' "$rows" >&2; fail "active Guest effective entitlement mismatch"; }
pass "active canonical Guest reads only its own still-effective projection"

member_rows=$("${psql_base[@]}" -At -F '|' -c "select entitlement_key,coalesce(scope_key,'GLOBAL'),coalesce(to_char(effective_valid_until at time zone 'UTC','YYYY-MM-DD'),'NULL') from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000010',timestamptz '$EFFECTIVE_AT');")
expected=$'history.only|GLOBAL|2027-01-01\nmember.self|scope-a|2026-11-01\nshared.bound|GLOBAL|2026-12-01\nshared.unbounded|scope-u|NULL'
[[ "$member_rows" == "$expected" ]] || { printf '%s\n' "$member_rows" >&2; fail "Member effective union mismatch"; }
pass "active canonical Member reads self plus direct merged Guest effective union"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000010',timestamptz '$EFFECTIVE_AT') where entitlement_key='shared.bound';")" == '1' ]] || fail "duplicate bounded entitlement key did not collapse"
[[ "$("${psql_base[@]}" -Atc "select to_char(effective_valid_until at time zone 'UTC','YYYY-MM-DD') from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000010',timestamptz '$EFFECTIVE_AT') where entitlement_key='shared.bound';")" == '2026-12-01' ]] || fail "bounded duplicate did not preserve latest effective validity"
[[ "$("${psql_base[@]}" -Atc "select case when effective_valid_until is null then 'NULL' else 'BOUNDED' end from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000010',timestamptz '$EFFECTIVE_AT') where entitlement_key='shared.unbounded';")" == 'NULL' ]] || fail "unbounded duplicate lost effective access"
pass "duplicate logical keys collapse by union without fabricating aggregate ids or revisions"

for forbidden in foreign.history foreign.member member.expired history.inactive; do
  [[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000010',timestamptz '$EFFECTIVE_AT') where entitlement_key='$forbidden';")" == '0' ]] || fail "forbidden entitlement leaked into effective union: $forbidden"
done
pass "foreign lineage, foreign Member state, expired-at-boundary, and inactive projections are excluded"

before_count=$("${psql_base[@]}" -Atc "select count(*) from public.entitlements;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000010',timestamptz '$EFFECTIVE_AT');" >/dev/null
after_count=$("${psql_base[@]}" -Atc "select count(*) from public.entitlements;")
[[ "$before_count" == "$after_count" ]] || fail "effective entitlement read mutated stored projections"
pass "effective entitlement union is projection-only and does not rewrite historical ownership"

expect_fail "deletion-pending Member is denied" "effective entitlement read requires an active canonical Guest or Member subject" "select * from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000030',timestamptz '$EFFECTIVE_AT');"
expect_fail "merged Guest cannot query as canonical subject" "effective entitlement read requires an active canonical Guest or Member subject" "select * from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000101',timestamptz '$EFFECTIVE_AT');"
expect_fail "unknown subject is denied" "effective entitlement read requires an active canonical Guest or Member subject" "select * from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000999',timestamptz '$EFFECTIVE_AT');"
expect_fail "subject identity is required" "effective entitlement subject identity is required" "select * from public.qry_effective_entitlements_v2(null,timestamptz '$EFFECTIVE_AT');"
expect_fail "evaluation timestamp is required" "effective entitlement evaluation timestamp is required" "select * from public.qry_effective_entitlements_v2('e6200000-0000-4000-8000-000000000001',null);"

shape=$("${psql_base[@]}" -At -F '|' -c "select p.provolatile,pg_get_function_result(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.oid='public.qry_effective_entitlements_v2(uuid,timestamptz)'::regprocedure;")
[[ "$shape" == 's|TABLE(entitlement_key text, scope_key text, effective_valid_until timestamp with time zone)' ]] || fail "effective entitlement v2 function shape mismatch: $shape"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_effective_entitlements_v2(uuid,timestamptz)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "effective entitlement v2 unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "effective entitlement v2 is STABLE, PUBLIC EXECUTE revoked, and table catalog remains 60"

echo "Guest-aware effective entitlement v2 query tests passed"
