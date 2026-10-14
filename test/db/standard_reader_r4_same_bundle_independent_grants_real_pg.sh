#!/usr/bin/env bash
set -euo pipefail
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_b19_same_bundle" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-19 $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
subject=11390000-0000-0000-0000-000000000001
first=b2020000-0000-4000-8000-000000000001
second=b2120000-0000-4000-8000-000000000001
# Immutable official Saju Source, first independent additional Receipt/Grant
# and positive Baekheon Standard Binder; NOT the legacy v2 replay shortcut.
awk '/^create temp table _v2_additional_result as/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^select pg_temp.assert_v2_fails\(/ {exit} {print}' \
 test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 45 "$tmp/setup.err" >&2; fail 'first Baekheon purchased access'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$first'::uuid and reader_character_id='baekheon'")" == 1 ]] ||
 fail 'first independent Baekheon purchase not bound'
# A SECOND verified purchase for the SAME Reader and SAME immutable bundle.
# Reuse only the seed's legal Commerce Purchase/Receipt/Grant construction.
awk '/^insert into public.purchase_intents\(/ {copy=1}
     /^select pg_temp.assert_v2_true\(/ {if(copy) exit}
     copy {print}' test/db/standard_reader_additional_policy_locked_positive.sql |
 sed -e 's/b2020000-0000-4000-8000-000000000001/b2120000-0000-4000-8000-000000000001/g' \
     -e 's/b2030000-0000-4000-8000-000000000001/b2130000-0000-4000-8000-000000000001/g' \
     -e 's/b2-additional-baekheon/b2-independent-baekheon/g' \
     -e 's/tx-b2-test-baekheon/tx-b2-independent-baekheon/g' \
     -e 's/hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc/g' \
     >"$tmp/second.sql"
grep -Fq "$second" "$tmp/second.sql" || fail 'second purchase missing'
p -f "$tmp/second.sql" >"$tmp/second.out" 2>"$tmp/second.err" ||
 { tail -n 45 "$tmp/second.err" >&2; fail 'second independent verified Grant'; }
p >"$tmp/bind.out" 2>"$tmp/bind.err" <<SQL ||
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '$subject'::uuid,'$second'::uuid,
 'b2140000-0000-4000-8000-000000000001'::uuid,
 'b2150000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$second"}'::jsonb);
commit;
SQL
{ cat "$tmp/bind.err" >&2; fail 'second legitimate private Binder'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where reader_character_id='baekheon' and reader_content_bundle_id='11391000-0000-0000-0000-000000000001'::uuid")" == 2 ]] ||
 fail 'two distinct purchase-backed Baekheon Access rows required'
[[ "$(p -c "select count(*) from public.standard_reading_reader_interpretations where reader_character_id='baekheon'")" == 1 ]] ||
 fail 'single logical Interpretation expected'
current_count(){
 p -c "select set_config('myeongha.subject_id','$subject',false);
 select count(*) from public.internal_qry_character_standard_reading_access_v2(
 '$subject'::uuid,'baekheon',clock_timestamp())" | tail -n 1
}
[[ "$(current_count)" == 1 ]] || fail 'two same-bundle Grants did not deduplicate'
first_grant="$(p -c "select entitlement_grant_id from public.standard_reading_reader_access_grants where purchase_intent_id='$first'::uuid")"
second_grant="$(p -c "select entitlement_grant_id from public.standard_reading_reader_access_grants where purchase_intent_id='$second'::uuid")"
[[ "$first_grant" != "$second_grant" ]] || fail 'not independent Commerce Grants'
# Disposable fixture-only simulated revoke, same approach as original S4 tests;
# does NOT certify real Provider event CAS/refund ingress.
p -c "update public.entitlement_grants
 set status='revoked',revision=revision+1,last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
 where id='$first_grant'::uuid" >/dev/null
[[ "$(p -c "select status from public.entitlement_grants where id='$first_grant'::uuid")" == revoked ]] ||
 fail 'first Grant did not revoke'
[[ "$(p -c "select status from public.entitlement_grants where id='$second_grant'::uuid")" == active ]] ||
 fail 'independent Grant was revoked'
[[ "$(current_count)" == 1 ]] || fail 'revoke of one Grant removed independent same-bundle entitlement'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 1 ]] ||
 fail 'independent Reading changed'
[[ "$(p -c "select count(*) from public.standard_reading_reader_interpretations where reader_character_id='baekheon'")" == 1 ]] ||
 fail 'logical Reader Interpretation changed'
# Old purchase must not become a fresh access ticket by replaying its Binder.
if p >"$tmp/replay.out" 2>"$tmp/replay.err" <<SQL
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_standard_reader_additional_policy_locked_v1(
 '$subject'::uuid,'$first'::uuid,
 'b2040000-0000-4000-8000-000000000001'::uuid,
 'b2050000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$first"}'::jsonb);
commit;
SQL
then fail 'historical first Purchase replay became fresh authority'; fi
grep -Fq 'Historical Standard Reading replay cannot authorize current access' "$tmp/replay.err" ||
 { cat "$tmp/replay.err" >&2; fail 'replay denied for unrelated reason'; }
echo 'PASS R4/BIND-19 same Reader and same bundle, two independent verified Grants; one fixture revoke leaves one current access, replay DENY'
