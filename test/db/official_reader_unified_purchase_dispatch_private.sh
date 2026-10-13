#!/usr/bin/env bash
set -euo pipefail
# D2 synthetic PostgreSQL: preserve the original official Reader fixture.
# First initial receipt/bind and positive additional bind route through the
# common Product-first dispatcher. Additional Receipt is tested by a safe
# replay after an official Reading exists (not first historical issuance).
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

awk '
/select \* from public.internal_apply_verified_receipt_capability_effects_v1\(/ && !initial_receipt {
  sub("internal_apply_verified_receipt_capability_effects_v1",
      "internal_apply_official_reader_verified_receipt_unified_v1")
  initial_receipt=1
}
/first Reader purchase creates exactly one Reader-independent official Reading/ {
  initial_positive=1
}
initial_positive && /from public.cmd_bind_standard_reading_access_v2\(/ {
  sub("cmd_bind_standard_reading_access_v2",
      "internal_cmd_bind_official_reader_unified_v1")
  initial_positive=0
  initial_bind=1
}
/create temp table _v2_additional_result as/ {
  print "-- D2 replay: verified additional Receipt AFTER Official Reading exists"
  print "select * from public.internal_apply_official_reader_verified_receipt_unified_v1("
  print "  '\''12102000-0000-0000-0000-000000000002'\''::uuid,"
  print "  array['\''test-reader-unit'\''],"
  print "  array[(select e.effective_at from public.entitlement_events e"
  print "    where e.source_receipt_id='\''12102000-0000-0000-0000-000000000002'\''::uuid"
  print "      and e.source_type='\''receipt'\'' and e.event_type='\''granted'\'')],"
  print "  array[(select e.target_valid_from from public.entitlement_events e"
  print "    where e.source_receipt_id='\''12102000-0000-0000-0000-000000000002'\''::uuid"
  print "      and e.source_type='\''receipt'\'' and e.event_type='\''granted'\'')],"
  print "  array[null]::timestamptz[],"
  print "  array[null]::text[]"
  print ");"
  additional_positive=1
  additional_receipt=1
}
additional_positive && /from public.cmd_bind_standard_reading_access_v2\(/ {
  sub("cmd_bind_standard_reading_access_v2",
      "internal_cmd_bind_official_reader_unified_v1")
  additional_positive=0
  additional_bind=1
}
{print}
END {
  if (initial_receipt!=1 || initial_bind!=1 ||
      additional_receipt!=1 || additional_bind!=1) exit 71
}
' test/db/official_standard_reading_reader_interpretation.sql >"$tmp/fixture.sql" ||
  fail "could not instrument original initial/additional purchase scenario"

[[ "$(grep -c 'from public.internal_cmd_bind_official_reader_unified_v1(' "$tmp/fixture.sql")" == 2 ]] ||
 fail "fixture did not route both initial and additional positive bind"
[[ "$(grep -c 'select \* from public.internal_apply_official_reader_verified_receipt_unified_v1(' "$tmp/fixture.sql")" == 2 ]] ||
 fail "fixture did not route initial issuance plus later additional Receipt replay"

p -f "$tmp/fixture.sql" >"$tmp/fixture.out" 2>"$tmp/fixture.err" || {
  tail -90 "$tmp/fixture.err" >&2
  fail "unified initial/additional purchase delegation broke original authority fixture"
}
pass "full source fixture: initial issuance/bind and additional receipt replay/bind under L0→L1"

subject="11390000-0000-0000-0000-000000000001"
initial="11392300-0000-0000-0000-000000000001"
additional="12102300-0000-0000-0000-000000000001"
# Existing purchase role with invalid Subject must DENY, not silently bind.
if p >"$tmp/wrong-subject.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','ffffffff-ffff-ffff-ffff-ffffffffffff',true);
select * from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$additional'::uuid,
 '12103000-0000-0000-0000-000000000099'::uuid,
 '12103100-0000-0000-0000-000000000099'::uuid,
 'sha256:v1:2222222222222222222222222222222222222222222222222222222222222222',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"12102300-0000-0000-0000-000000000001"}'::jsonb
);
commit;
SQL
then
 fail "wrong Subject was accepted by unified bind"
fi

for role in \
 'public.internal_apply_official_reader_verified_receipt_unified_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])' \
 'public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb)'; do
  acl="$(p -c "select count(*) from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role',
      'myeongha_api_executor','myeongha_commerce_internal_executor',
      'myeongha_seyeon_chat_runtime_owner')
      and pg_catalog.has_function_privilege(r.rolname,'$role','EXECUTE');")"
  [[ "$acl" == 0 ]] || fail "unexpected runtime/Commerce EXECUTE on unified dispatch: $role"
done

for level in "repeatable read" "serializable"; do
 if p >"$tmp/stale.out" 2>&1 <<SQL
begin isolation level $level;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_official_reader_unified_v1(
 '$subject'::uuid,'$initial'::uuid,
 '12103000-0000-0000-0000-000000000001'::uuid,
 '12103100-0000-0000-0000-000000000001'::uuid,
 'sha256:v1:1111111111111111111111111111111111111111111111111111111111111111',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"11392300-0000-0000-0000-000000000001"}'::jsonb
);
commit;
SQL
 then
  fail "stale MVCC was accepted by unified dispatch: $level"
 fi
 grep -q 'Official Reader unified scope requires READ COMMITTED' "$tmp/stale.out" ||
  fail "unified dispatch stale isolation denied for unexpected reason"
done
pass "wrong Subject, stale snapshot and unauthorized runtime roles denied"

echo "PASS: D2 private purchase dispatcher preserves original first/additional authority; no production writer switch"
