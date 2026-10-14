#!/usr/bin/env bash
set -euo pipefail
mode="${1:?BIND-21 mode required}"
case "$mode" in additional_denied|fresh_official) ;; *) exit 1;; esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_b21_$mode" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-21/$mode $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
subject=11390000-0000-0000-0000-000000000001
legacy_intent=11392300-0000-0000-0000-000000000001
# Preserve the real legacy 1170 command and the v2 fixture's independent
# verified Commerce Grant. No direct insertion into legacy binding history.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
cat >>"$tmp/setup.sql" <<'SQL'
insert into public.character_capabilities(
 id,content_bundle_id,character_id,saju_domain,role,can_initiate,capability_version
) values (
 'b2170000-0000-4000-8000-000000000001',
 '11391000-0000-0000-0000-000000000001',
 'test-standard-reader','relationship','primary',true,'relationship-test-v2'
);
select * from public.cmd_bind_standard_reading_unit_v1(
 '11390000-0000-0000-0000-000000000001'::uuid,
 '11392300-0000-0000-0000-000000000001'::uuid,
 'b2170000-0000-4000-8000-000000000002'::uuid,
 'b2170000-0000-4000-8000-000000000003'::uuid,
 'sha256:v1:1717171717171717171717171717171717171717171717171717171717171717',
 'standard-reading-unit-request-v1',
 '{"schemaVersion":"standard-reading-unit-request-v1","purchaseIntentId":"11392300-0000-0000-0000-000000000001"}'::jsonb
);
SQL
# Source fixtures define pg_temp assertions. Execute all fixture SQL within
# the SAME PostgreSQL connection, before trying any v2 bind.
case "$mode" in
 additional_denied)
  awk '/^create temp table _b2_additional_result as/{exit} {print}' \
   test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/setup.sql"
  ;;
 fresh_official)
  awk '/^create temp table _s4_initial_result as/{exit} {print}' \
   test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
  ;;
esac
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 45 "$tmp/setup.err" >&2; fail 'verified 1170 binding fixture'; }
[[ "$(p -c "select count(*) from public.standard_reading_unit_bindings
where purchase_intent_id='$legacy_intent'::uuid and reading_id='b2170000-0000-4000-8000-000000000003'::uuid")" == 1 ]] ||
 fail '1170 binding missing'
[[ "$(p -c 'select count(*) from public.standard_reading_official_bindings')" == 0 ]] ||
 fail '1170 was silently promoted to Official Reading'
[[ "$(p -c 'select count(*) from public.standard_reading_reader_access_grants')" == 0 ]] ||
 fail '1170 generated v2 Reader Access'
[[ "$(p -c "select set_config('myeongha.subject_id','$subject',false);
select count(*) from public.internal_qry_character_standard_reading_access_v2(
'$subject'::uuid,'test-standard-reader',clock_timestamp())" | tail -n 1)" == 0 ]] ||
 fail 'legacy Reader silently gained current v2 access'
case "$mode" in
 additional_denied)
  if p >"$tmp/bind.out" 2>"$tmp/bind.err" <<SQL
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '$subject'::uuid,'b2020000-0000-4000-8000-000000000001'::uuid,
 'b2040000-0000-4000-8000-000000000001'::uuid,
 'b2050000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001"}'::jsonb);
commit;
SQL
  then fail '1170-only history promoted to official source for new paid Reader'; fi
  grep -Fq 'One server-owned additional Reader and existing Official Reading scope is required' "$tmp/bind.err" ||
   { cat "$tmp/bind.err" >&2; fail 'wrong fail-closed reason'; }
  [[ "$(p -c 'select count(*) from public.standard_reading_official_bindings')" == 0 ]] ||
   fail 'additional created official Reading'
  [[ "$(p -c 'select count(*) from public.standard_reading_reader_access_grants')" == 0 ]] ||
   fail 'legacy promoted to new Reader Access'
  [[ "$(p -c "select count(*) from public.entitlement_grants
where source_receipt_id='b2030000-0000-4000-8000-000000000001'::uuid and status='active'")" == 1 ]] ||
   fail 'independent Commerce Grant was lost'
  ;;
 fresh_official)
  p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/bind.out" 2>"$tmp/bind.err" ||
   { cat "$tmp/bind.err" >&2; fail 'genuine new verified Official Reading'; }
  [[ "$(p -c 'select count(*) from public.standard_reading_official_bindings')" == 1 ]] ||
   fail 'new official Reading not created exactly once'
  [[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
where reader_character_id='seyeon' and purchase_intent_id='b4220000-0000-4000-8000-000000000001'::uuid")" == 1 ]] ||
   fail 'exact new independent Reader Access missing'
  [[ "$(p -c 'select count(*) from public.readings')" == 2 ]] ||
   fail 'legacy Reading and official Reading must remain separate'
  ;;
esac
[[ "$(p -c "select count(*) from public.standard_reading_unit_bindings
where purchase_intent_id='$legacy_intent'::uuid and reading_id='b2170000-0000-4000-8000-000000000003'::uuid")" == 1 ]] ||
 fail 'immutable 1170 record was changed'
echo "PASS R4/BIND-21/$mode real PG 1170 history isolated, no automatic current v2 authorization"
