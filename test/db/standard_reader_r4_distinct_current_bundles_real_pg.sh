#!/usr/bin/env bash
set -euo pipefail
if [[ "${MYEONGHA_R4_PG17_CI:-}" == 1 ]]; then
  [[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
     "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || exit 1
  pg_version="$(psql -X -Atqc 'show server_version_num')"
  [[ "$pg_version" -ge 170000 && "$pg_version" -lt 180000 ]] || exit 1
else
  [[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
     "${PGDATABASE:-}" == myeongha_b2_r4_b18_distinct_bundles ]] || exit 1
fi
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-18 $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
subject=11390000-0000-0000-0000-000000000001
reading=12103100-0000-0000-0000-000000000001
old_bundle=11391000-0000-0000-0000-000000000001
new_bundle=b2180000-0000-4000-8000-000000000001
first=b2020000-0000-4000-8000-000000000001
second=b2120000-0000-4000-8000-000000000001
# First verified additional-Reader purchase and private Binder, on committed
# official Source; this is not a legacy 1220 historical replay shortcut.
awk '/^create temp table _v2_additional_result as/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/first.sql"
awk '/^select pg_temp.assert_v2_fails\(/ {exit} {print}' \
 test/db/standard_reader_additional_policy_locked_positive.sql >>"$tmp/first.sql"
p -f "$tmp/first.sql" >"$tmp/first.out" 2>"$tmp/first.err" ||
 { tail -n 55 "$tmp/first.err" >&2; fail 'old bundle verified bind'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$first'::uuid and reader_character_id='baekheon'
 and reader_content_bundle_id='$old_bundle'::uuid")" == 1 ]] ||
 fail 'original purchase-backed bundle missing'
# Test-only release rotation: only ONE active default; prior access remains
# purchase-backed under its immutable old bundle, no production content Writer.
p >"$tmp/rotate.out" 2>"$tmp/rotate.err" <<SQL ||
insert into public.content_bundles(
 id,content_version,content_hash,artifact_ref,artifact_schema_version,
 min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at
) values (
 '$new_bundle'::uuid,'test-b2-r4-second-bundle',
 'sha256:test:b2-r4-second-bundle','test://b2-r4-second-bundle','test-v1',
 'test-client-v1','sha256:test:b2-r4-second-assets','test-cue-v1',
 '{}'::jsonb,clock_timestamp()-interval '1 day'
);
insert into public.character_runtime_catalog(
 character_id,content_bundle_id,availability,enabled,
 release_at,retire_at,published_at
) values ('baekheon','$new_bundle'::uuid,'available',true,
 clock_timestamp()-interval '1 day',null,clock_timestamp()-interval '1 day');
insert into public.content_releases(
 id,release_key,content_bundle_id,status,is_default,
 rollout_jsonb,rollout_policy_version,rollout_seed,
 activated_at,retired_at,created_at
) values ('b2180000-0000-4000-8000-000000000002'::uuid,
 'r4-test-baekheon-new-bundle','$new_bundle'::uuid,'draft',false,
 null,'uniform-default-v1','b2-test-rotation',null,null,clock_timestamp());
select public.cmd_activate_content_release_v1(
 'b2180000-0000-4000-8000-000000000002'::uuid,true);
SQL
{ cat "$tmp/rotate.err" >&2; fail 'synthetic Content Release rotation'; }
[[ "$(p -c "select count(*) from public.content_releases
 where status='active' and is_default")" == 1 ]] || fail 'two simultaneous default releases'
[[ "$(p -c "select count(*) from public.qry_standard_reading_reader_catalog_v4(
 '11392000-0000-0000-0000-000000000001'::uuid,'baekheon')
 where reader_content_bundle_id='$new_bundle'::uuid")" == 1 ]] ||
 fail 'second approved Reader bundle unpublished'
# A distinct production-flag SYNTHETIC verified purchase, SAME Reader/Reading,
# new immutable selected bundle. Separate Receipt/Entitlement Grant.
awk '/^insert into public.purchase_intents\(/ {copy=1}
     /^select pg_temp.assert_v2_true\(/ {if(copy) exit}
     copy {print}' test/db/standard_reader_additional_policy_locked_positive.sql |
 sed -e 's/b2020000-0000-4000-8000-000000000001/b2120000-0000-4000-8000-000000000001/g' \
     -e 's/b2030000-0000-4000-8000-000000000001/b2130000-0000-4000-8000-000000000001/g' \
     -e 's/11391000-0000-0000-0000-000000000001/b2180000-0000-4000-8000-000000000001/g' \
     -e 's/b2-additional-baekheon/b2-distinct-bundle-baekheon/g' \
     -e 's/tx-b2-test-baekheon/tx-b2-distinct-bundle-baekheon/g' \
     -e 's/hmac-sha256:k1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/hmac-sha256:k1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc/g' \
 >"$tmp/second.sql"
grep -Fq "$second" "$tmp/second.sql" || fail 'second purchase missing'
grep -Fq "$new_bundle" "$tmp/second.sql" || fail 'second purchase selected wrong bundle'
p -f "$tmp/second.sql" >"$tmp/second.out" 2>"$tmp/second.err" ||
 { tail -n 55 "$tmp/second.err" >&2; fail 'second verified Receipt/Grant'; }
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
[[ "$(p -c "select count(distinct reader_content_bundle_id)
 from public.standard_reading_reader_access_grants
 where official_reading_id='$reading'::uuid and reader_character_id='baekheon'")" == 2 ]] ||
 fail 'two valid current bundle purchase histories missing'
[[ "$(p -c 'select count(*) from public.standard_reading_official_bindings')" == 1 ]] ||
 fail 'duplicate official Reading'
[[ "$(p -c "select count(*) from public.standard_reading_reader_interpretations
 where official_reading_id='$reading'::uuid and reader_character_id='baekheon'")" == 1 ]] ||
 fail 'duplicated logical interpretation'
[[ "$(p -c "select set_config('myeongha.subject_id','$subject',false);
 select count(distinct reader_content_bundle_id) from
 public.internal_qry_character_standard_reading_access_v2(
 '$subject'::uuid,'baekheon',clock_timestamp())
 where reading_id='$reading'::uuid" | tail -n 1)" == 2 ]] ||
 fail 'current v2 metadata hid one purchased bundle'
scope_query(){
 p -c "begin;
 select set_config('myeongha.subject_id','$subject',true);
 select scope_state||'|'||active_bundle_count::text||'|'||
 coalesce(current_bundle_id::text,'NULL') from
 public.internal_qry_official_reader_locked_bundle_scope_v1(
 '$subject'::uuid,'$reading'::uuid,'baekheon');
 commit;"
}
scope="$(scope_query)"
echo "$scope" | grep -Fxq 'ambiguous_bundles|2|NULL' ||
 { echo "$scope" >&2; fail 'ambiguous scope selected an unauthorized bundle'; }
# Fixture-only revoke of one distinct Grant proves remaining independence.
grant="$(p -c "select entitlement_grant_id from public.standard_reading_reader_access_grants
 where purchase_intent_id='$first'::uuid")"
p -c "update public.entitlement_grants set status='revoked',
 revision=revision+1,last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
 where id='$grant'::uuid" >/dev/null
scope="$(scope_query)"
echo "$scope" | grep -Fxq "one_current_bundle|1|$new_bundle" ||
 { echo "$scope" >&2; fail 'revoked old bundle incorrectly removed new entitlement'; }
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants
 where official_reading_id='$reading'::uuid and reader_character_id='baekheon'")" == 2 ]] ||
 fail 'revoke rewrote immutable purchase history'
echo 'PASS R4/BIND-18 two independent current purchased Reader bundles; scope lock ambiguity DENY; one revoke preserves other'
