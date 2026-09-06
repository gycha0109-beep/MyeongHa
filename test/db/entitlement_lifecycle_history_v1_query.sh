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
  ('c6100000-0000-4000-8000-000000000001'),
  ('c6100000-0000-4000-8000-000000000002'),
  ('c6100000-0000-4000-8000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('c6200000-0000-4000-8000-000000000001','guest',null,'active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('c6200000-0000-4000-8000-000000000002','guest',null,'active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('c6200000-0000-4000-8000-000000000003','guest',null,'active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('c6200000-0000-4000-8000-000000000010','member','c6100000-0000-4000-8000-000000000001','active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('c6200000-0000-4000-8000-000000000020','member','c6100000-0000-4000-8000-000000000002','active',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z'),
  ('c6200000-0000-4000-8000-000000000030','member','c6100000-0000-4000-8000-000000000003','deletion_pending',null,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');

insert into public.entitlement_grants(
  id,subject_id,entitlement_key,scope_key,grant_key,grant_source_type,status,
  valid_from,valid_until,revision,last_effective_at,last_provider_ordering_key,created_at,updated_at
) values
  ('c6300000-0000-4000-8000-000000000001','c6200000-0000-4000-8000-000000000001','guest.global',null,'grant:guest-global','promo','revoked','2026-09-01T00:00:00Z',null,2,'2026-09-02T01:00:00Z',null,'2026-09-01T00:00:00Z','2026-09-02T01:00:00Z'),
  ('c6300000-0000-4000-8000-000000000010','c6200000-0000-4000-8000-000000000010','member.reading','report:2026','grant:member-reading','system','active','2026-09-01T00:00:00Z','2099-01-01T00:00:00Z',2,'2026-09-04T01:00:00Z',null,'2026-09-01T00:00:00Z','2026-09-04T01:00:00Z'),
  ('c6300000-0000-4000-8000-000000000020','c6200000-0000-4000-8000-000000000002','merged.episode','episode:one','grant:merged-episode','purchase','expired','2026-09-01T00:00:00Z','2026-09-03T00:00:00Z',2,'2026-09-03T01:00:00Z',null,'2026-09-01T00:00:00Z','2026-09-03T01:00:00Z'),
  ('c6300000-0000-4000-8000-000000000030','c6200000-0000-4000-8000-000000000003','foreign.bundle','bundle:other','grant:foreign-bundle','system','revoked','2026-09-01T00:00:00Z',null,1,'2026-09-05T01:00:00Z',null,'2026-09-01T00:00:00Z','2026-09-05T01:00:00Z');

insert into public.entitlement_events(
  id,grant_id,subject_id,entitlement_key,scope_key_norm,product_id,source_type,
  source_receipt_id,source_provider_event_id,source_actor_ref,event_type,event_schema_version,
  event_dedupe_key,effective_at,provider_ordering_key,payload_jsonb,created_at,
  target_status,target_valid_from,target_valid_until,reason_code
) values
  ('c6400000-0000-4000-8000-000000000001','c6300000-0000-4000-8000-000000000001','c6200000-0000-4000-8000-000000000001','guest.global','__GLOBAL__',null,'system',null,null,'test:lifecycle','granted','ent-event-v1','guest-granted','2026-09-01T01:00:00Z',null,'{"private":"LEGACY_PAYLOAD_SENTINEL"}'::jsonb,'2026-09-01T01:00:00Z',null,null,null,null),
  ('c6400000-0000-4000-8000-000000000002','c6300000-0000-4000-8000-000000000001','c6200000-0000-4000-8000-000000000001','guest.global','__GLOBAL__',null,'system',null,null,'test:lifecycle','revoked','ent-event-v2','guest-revoked','2026-09-02T01:00:00Z',null,'{"private":"REVOKE_PAYLOAD_SENTINEL"}'::jsonb,'2026-09-02T01:00:00Z','revoked','2026-09-01T00:00:00Z',null,'test-only-revoke'),
  ('c6400000-0000-4000-8000-000000000010','c6300000-0000-4000-8000-000000000010','c6200000-0000-4000-8000-000000000010','member.reading','report:2026',null,'system',null,null,'test:lifecycle','granted','ent-event-v2','member-granted','2026-09-02T02:00:00Z',null,'{"private":"MEMBER_PAYLOAD_SENTINEL"}'::jsonb,'2026-09-02T02:00:00Z','active','2026-09-01T00:00:00Z','2099-01-01T00:00:00Z',null),
  ('c6400000-0000-4000-8000-000000000011','c6300000-0000-4000-8000-000000000010','c6200000-0000-4000-8000-000000000010','member.reading','report:2026',null,'system',null,null,'test:lifecycle','restored','ent-event-v2','member-restored','2026-09-04T01:00:00Z',null,'{"private":"RESTORE_PAYLOAD_SENTINEL"}'::jsonb,'2026-09-04T01:00:00Z','active','2026-09-01T00:00:00Z','2099-01-01T00:00:00Z','restore-test'),
  ('c6400000-0000-4000-8000-000000000020','c6300000-0000-4000-8000-000000000020','c6200000-0000-4000-8000-000000000002','merged.episode','episode:one',null,'system',null,null,'test:lifecycle','expired','ent-event-v2','merged-expired','2026-09-03T01:00:00Z',null,'{"private":"MERGED_PAYLOAD_SENTINEL"}'::jsonb,'2026-09-03T01:00:00Z','expired','2026-09-01T00:00:00Z','2026-09-03T00:00:00Z','time-expired'),
  ('c6400000-0000-4000-8000-000000000030','c6300000-0000-4000-8000-000000000030','c6200000-0000-4000-8000-000000000003','foreign.bundle','bundle:other',null,'system',null,null,'test:lifecycle','revoked','ent-event-v2','foreign-revoked','2026-09-05T01:00:00Z',null,'{"private":"FOREIGN_PAYLOAD_SENTINEL"}'::jsonb,'2026-09-05T01:00:00Z','revoked','2026-09-01T00:00:00Z',null,'foreign-revoke');

update public.subjects
set status='merged', merged_into_subject_id='c6200000-0000-4000-8000-000000000010', updated_at='2026-09-06T00:00:00Z'
where id='c6200000-0000-4000-8000-000000000002';

update public.subjects
set status='merged', merged_into_subject_id='c6200000-0000-4000-8000-000000000020', updated_at='2026-09-06T00:00:00Z'
where id='c6200000-0000-4000-8000-000000000003';
SQL

guest_rows=$("${psql_base[@]}" -At -F '|' -c "select entitlement_key,coalesce(scope_key,'NULL'),event_type,to_char(effective_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),coalesce(target_status,'NULL') from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000001');")
expected_guest=$'guest.global|NULL|revoked|2026-09-02 01:00:00|revoked\nguest.global|NULL|granted|2026-09-01 01:00:00|NULL'
[[ "$guest_rows" == "$expected_guest" ]] || { printf '%s\n' "$guest_rows" >&2; fail "active Guest lifecycle history mismatch"; }
pass "active canonical Guest reads only its own lifecycle ledger"

member_rows=$("${psql_base[@]}" -At -F '|' -c "select entitlement_key,scope_key,event_type,to_char(effective_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),target_status from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000010');")
expected_member=$'member.reading|report:2026|restored|2026-09-04 01:00:00|active\nmerged.episode|episode:one|expired|2026-09-03 01:00:00|expired\nmember.reading|report:2026|granted|2026-09-02 02:00:00|active'
[[ "$member_rows" == "$expected_member" ]] || { printf '%s\n' "$member_rows" >&2; fail "active Member lifecycle union mismatch"; }
pass "active canonical Member reads self plus direct merged Guest lifecycle history"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000010') where entitlement_key='foreign.bundle';")" == '0' ]] || fail "foreign merged Guest lifecycle leaked across Member lineage"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000001') where entitlement_key in ('member.reading','merged.episode','foreign.bundle');")" == '0' ]] || fail "Guest lifecycle leaked foreign rows"
pass "lifecycle history is owner-isolated and direct-lineage only"

legacy=$("${psql_base[@]}" -At -F '|' -c "select coalesce(target_status,'NULL'),coalesce(target_valid_from::text,'NULL'),coalesce(target_valid_until::text,'NULL') from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000001') where event_type='granted';")
[[ "$legacy" == 'NULL|NULL|NULL' ]] || fail "legacy event effect NULLs were fabricated: $legacy"
pass "legacy lifecycle effect fields remain NULL"

restored=$("${psql_base[@]}" -At -F '|' -c "select event_type,target_status,to_char(target_valid_from at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),to_char(target_valid_until at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000010') where event_type='restored';")
[[ "$restored" == 'restored|active|2026-09-01 00:00:00|2099-01-01 00:00:00' ]] || fail "v2 restored effect was not preserved: $restored"
pass "versioned target lifecycle effect is preserved without reinterpretation"

shape=$("${psql_base[@]}" -At -F '|' -c "select p.provolatile,p.prosecdef,coalesce(array_to_string(p.proconfig,','),''),pg_get_function_result(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.oid='public.qry_entitlement_lifecycle_history_v1(uuid)'::regprocedure;")
expected_shape='s|f|search_path=public, pg_temp|TABLE(entitlement_key text, scope_key text, event_type text, effective_at timestamp with time zone, target_status text, target_valid_from timestamp with time zone, target_valid_until timestamp with time zone)'
[[ "$shape" == "$expected_shape" ]] || { printf '%s\n' "$shape" >&2; fail "lifecycle history function shape/security mismatch"; }
pass "lifecycle history exposes only the explicit privacy-safe allowlist"

definition=$("${psql_base[@]}" -Atc "select pg_get_functiondef('public.qry_entitlement_lifecycle_history_v1(uuid)'::regprocedure);")
for forbidden in source_receipt_id source_provider_event_id source_actor_ref provider_ordering_key payload_jsonb reason_code commerce_receipts commerce_provider_events receipt_fingerprint external_transaction_id verified_payload_jsonb; do
  [[ "$shape" != *"$forbidden"* ]] || fail "sensitive/internal field leaked into lifecycle return contract: $forbidden"
  [[ "$definition" != *"$forbidden"* ]] || fail "lifecycle query depends on forbidden provider/evidence surface: $forbidden"
done
[[ "$shape" != *"scope_key_norm"* ]] || fail "internal __GLOBAL__ scope sentinel leaked into lifecycle return contract"
pass "provider/receipt/payload/reason/internal scope evidence is absent from lifecycle read boundary"

before_events=$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_events;")
before_grants=$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_grants;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000010');" >/dev/null
after_events=$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_events;")
after_grants=$("${psql_base[@]}" -Atc "select count(*) from public.entitlement_grants;")
[[ "$before_events" == "$after_events" && "$before_grants" == "$after_grants" ]] || fail "lifecycle history query mutated Entitlement authority"
[[ "$("${psql_base[@]}" -Atc "select subject_id from public.entitlement_events where id='c6400000-0000-4000-8000-000000000020';")" == 'c6200000-0000-4000-8000-000000000002' ]] || fail "read-time lineage rewrote historical lifecycle owner"
pass "lifecycle query is projection-only and preserves historical ownership"

expect_fail "deletion-pending Member lifecycle read is denied" "active canonical Guest or Member subject" "select * from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000030');"
expect_fail "merged Guest cannot query as canonical lifecycle subject" "active canonical Guest or Member subject" "select * from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000002');"
expect_fail "unknown lifecycle subject is denied" "active canonical Guest or Member subject" "select * from public.qry_entitlement_lifecycle_history_v1('c6200000-0000-4000-8000-000000000099');"
expect_fail "lifecycle subject identity is required" "entitlement lifecycle history subject identity is required" "select * from public.qry_entitlement_lifecycle_history_v1(null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_entitlement_lifecycle_history_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "lifecycle history unexpectedly executable by PUBLIC"
for role in anon authenticated service_role myeongha_api_executor; do
  exists=$("${psql_base[@]}" -Atc "select case when exists(select 1 from pg_roles where rolname='$role') then '1' else '0' end;")
  if [[ "$exists" == '1' ]]; then
    allowed=$("${psql_base[@]}" -Atc "select case when has_function_privilege('$role','public.qry_entitlement_lifecycle_history_v1(uuid)','EXECUTE') then '1' else '0' end;")
    [[ "$allowed" == '0' ]] || fail "lifecycle history unexpectedly executable by $role"
  fi
done
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "lifecycle history is STABLE, SECURITY INVOKER, DB-only, and table catalog remains 60"

echo "Privacy-safe Entitlement lifecycle history v1 query tests passed"
