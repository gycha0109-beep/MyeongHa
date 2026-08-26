#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "$out" >&2
    fail "$label unexpectedly succeeded"
  fi
  if [[ "$out" != *"$needle"* ]]; then
    echo "$out" >&2
    fail "$label failed for unexpected reason"
  fi
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('3c200000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('3c200000-0000-0000-0000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('3c200000-0000-0000-0000-000000000003','guest',null,'deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('3c200000-0000-0000-0000-000000000004','guest',null,'active',null,clock_timestamp(),clock_timestamp());

insert into public.entitlement_grants(
  id,subject_id,entitlement_key,scope_key,grant_key,grant_source_type,status,valid_from,valid_until,
  revision,last_effective_at,last_provider_ordering_key,created_at,updated_at
) values
  ('3c300000-0000-0000-0000-000000000001','3c200000-0000-0000-0000-000000000001','reading.general',null,'system-seed','system','active',timestamptz '2026-01-01 00:00:00+00',null,0,timestamptz '2026-01-01 00:00:00+00',null,timestamptz '2026-01-01 00:00:00+00',timestamptz '2026-01-01 00:00:00+00');

insert into public.entitlements(
  id,subject_id,entitlement_key,scope_key,status,active_grant_count,effective_valid_until,revision,created_at,updated_at
) values
  ('3c400000-0000-0000-0000-000000000001','3c200000-0000-0000-0000-000000000001','episode.special','episode-42','inactive',0,timestamptz '2026-07-01 00:00:00+00',4,timestamptz '2026-01-01 00:00:00+00',timestamptz '2026-07-02 00:00:00+00'),
  ('3c400000-0000-0000-0000-000000000002','3c200000-0000-0000-0000-000000000001','reading.general',null,'active',2,null,7,timestamptz '2026-01-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('3c400000-0000-0000-0000-000000000003','3c200000-0000-0000-0000-000000000002','reading.general',null,'active',1,timestamptz '2027-01-01 00:00:00+00',3,timestamptz '2026-02-01 00:00:00+00',timestamptz '2026-08-02 00:00:00+00');
SQL

rows=$("${psql_base[@]}" -Atc "select entitlement_id||'|'||entitlement_key||'|'||coalesce(scope_key,'GLOBAL')||'|'||status||'|'||active_grant_count||'|'||coalesce(to_char(effective_valid_until at time zone 'UTC','YYYY-MM-DD'),'NULL')||'|'||revision from public.qry_entitlements_v1('3c200000-0000-0000-0000-000000000001');")
expected=$'3c400000-0000-0000-0000-000000000001|episode.special|episode-42|inactive|0|2026-07-01|4\n3c400000-0000-0000-0000-000000000002|reading.general|GLOBAL|active|2|NULL|7'
[[ "$rows" == "$expected" ]] || { printf '%s\n' "$rows" >&2; fail "current entitlement projection mismatch"; }
pass "entitlement read returns stored active/inactive current projections exactly"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_entitlements_v1('3c200000-0000-0000-0000-000000000001');")" == "2" ]] || fail "entitlement query exposed another owner's projection"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_entitlements_v1('3c200000-0000-0000-0000-000000000004');")" == "0" ]] || fail "entitlement query fabricated a baseline entitlement"
pass "entitlement read is owner-scoped and empty state returns zero rows without fabrication"

projection=$("${psql_base[@]}" -Atc "select active_grant_count||'|'||revision from public.qry_entitlements_v1('3c200000-0000-0000-0000-000000000001') where entitlement_key='reading.general';")
[[ "$projection" == "2|7" ]] || fail "entitlement query recalculated projection from grant rows: $projection"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_grants where subject_id='3c200000-0000-0000-0000-000000000001';")" == "1" ]] || fail "entitlement query mutated grant provenance"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_events where subject_id='3c200000-0000-0000-0000-000000000001';")" == "0" ]] || fail "entitlement query fabricated lifecycle events"
pass "entitlement read trusts current projection and does not reconstruct from grants/events"

expect_fail "deletion-pending subject entitlement read is denied" "entitlement read requires an active canonical subject" "select * from public.qry_entitlements_v1('3c200000-0000-0000-0000-000000000003');"
expect_fail "unknown subject entitlement read is denied" "entitlement read requires an active canonical subject" "select * from public.qry_entitlements_v1('3c200000-0000-0000-0000-000000000099');"
expect_fail "entitlement subject identity is required" "entitlement subject identity is required" "select * from public.qry_entitlements_v1(null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_entitlements_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "entitlement query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "entitlement query PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "current entitlement projection query tests passed"
