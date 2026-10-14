#!/usr/bin/env bash
set -euo pipefail
mode="${1:?BIND-16/20 mode}"
case "$mode" in birth_revision|domain_version|cross_subject) ;; *) echo 'FAIL R4 mode'; exit 1;; esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_scope_$mode" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/$mode $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
# Original committed Saju Source and independent verified additional purchase.
awk '/^create temp table _v2_additional_result as/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/fixture.sql"
awk '/^create temp table _b2_additional_result as/{exit} {print}' \
 test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/fixture.sql"
p -f "$tmp/fixture.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 45 "$tmp/setup.err" >&2; fail 'original official Source/additional Grant fixture'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] ||
 fail 'committed Official Reading fixture absent'
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='b2030000-0000-4000-8000-000000000001'::uuid and status='active'")" == 1 ]] ||
 fail 'independent verified additional Grant absent'
case "$mode" in
 birth_revision)
 p >/dev/null <<SQL
 insert into public.birth_profile_revisions(
 id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,
 birth_time,time_known,is_leap_month,sex,input_hash,created_at
 ) values (
 '12101100-0000-0000-0000-000000000002',
 '12101000-0000-0000-0000-000000000001',
 '11390000-0000-0000-0000-000000000001',
 2,'solar',date '1996-01-10',time '09:30:00',
 true,false,'male','sha256:test:r4-birth-revision2',clock_timestamp());
 update public.birth_profiles
 set current_revision_id='12101100-0000-0000-0000-000000000002',
 updated_at=clock_timestamp()
 where id='12101000-0000-0000-0000-000000000001';
SQL
 [[ "$(p -c "select count(*) from public.standard_reading_official_bindings
 where source_birth_revision_id='12101100-0000-0000-0000-000000000001'::uuid")" == 1 ]] ||
 fail 'original Official Reading provenance was rewritten'
 expected='One server-owned additional Reader and existing Official Reading scope is required'
 ;;
 domain_version)
 p -c "update public.saju_domain_runtime set capability_version='relationship-test-r4-drift',updated_at=clock_timestamp() where saju_domain='relationship'" >/dev/null
 [[ "$(p -c "select count(*) from public.standard_reading_official_bindings
 where domain_capability_version='relationship-test-v2'")" == 1 ]] ||
 fail 'original Official Reading domain version was rewritten'
 expected='One server-owned additional Reader and existing Official Reading scope is required'
 ;;
 cross_subject) expected='subject execution context mismatch' ;;
esac
subject=11390000-0000-0000-0000-000000000001
if [[ "$mode" == cross_subject ]]; then
 subject=11390000-0000-0000-0000-000000000099
fi
if p >"$tmp/bind.out" 2>"$tmp/bind.err" <<SQL
begin;
select set_config('myeongha.subject_id','11390000-0000-0000-0000-000000000001',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '$subject'::uuid,
 'b2020000-0000-4000-8000-000000000001'::uuid,
 'b2040000-0000-4000-8000-000000000001'::uuid,
 'b2050000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"b2020000-0000-4000-8000-000000000001"}'::jsonb);
commit;
SQL
then fail 'mismatched Source/Subject was accepted'; fi
grep -Fq "$expected" "$tmp/bind.err" ||
 { cat "$tmp/bind.err" >&2; fail 'unrelated Binder denial'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] || fail 'Source identity changed'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
where purchase_intent_id='b2020000-0000-4000-8000-000000000001'::uuid")" == 0 ]] || fail 'additional Access created'
[[ "$(p -c "select count(*) from public.standard_reading_reader_interpretations where reader_character_id='baekheon'")" == 0 ]] || fail 'additional Interpretation created'
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='b2030000-0000-4000-8000-000000000001'::uuid and status='active'")" == 1 ]] || fail 'original Commerce Grant changed'
echo "PASS R4/$mode actual PostgreSQL Source/Subject mismatch DENY, no new Reading/Interpretation/Access"
