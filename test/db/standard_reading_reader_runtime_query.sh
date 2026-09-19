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
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('d1140000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('d1140000-0000-0000-0000-000000000002','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('d1140000-0000-0000-0000-000000000003','guest',null,'deletion_pending',null,clock_timestamp(),clock_timestamp())
on conflict (id) do nothing;

insert into public.characters(character_id,created_at,retired_at) values
  ('std-reader-available',clock_timestamp(),null),
  ('std-reader-unlockable',clock_timestamp(),null),
  ('std-reader-locked',clock_timestamp(),null),
  ('std-reader-future',clock_timestamp(),null),
  ('std-reader-retired',clock_timestamp()-interval '10 days',clock_timestamp()-interval '1 day')
on conflict (character_id) do nothing;

insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
  asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at,retired_at
) values (
  'd1141000-0000-0000-0000-000000000001','std-reader-runtime-v1',
  'sha256:v1:std-reader-runtime-v1','private://std-reader-runtime-v1','artifact-v1',
  'client-cap-v1','sha256:v1:std-reader-assets-v1','cue-v1','{}'::jsonb,
  clock_timestamp()-interval '2 days',null
);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,rollout_policy_version,
  rollout_seed,activated_at,retired_at,created_at
) values (
  'd1141100-0000-0000-0000-000000000001','std-reader-runtime-default',
  'd1141000-0000-0000-0000-000000000001','active',true,null,'rollout-v1',
  'std-reader-seed',clock_timestamp()-interval '1 day',null,clock_timestamp()-interval '2 days'
);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values
  ('std-reader-available','d1141000-0000-0000-0000-000000000001','available',true,null,null,clock_timestamp()-interval '2 days'),
  ('std-reader-unlockable','d1141000-0000-0000-0000-000000000001','unlockable',true,null,null,clock_timestamp()-interval '2 days'),
  ('std-reader-locked','d1141000-0000-0000-0000-000000000001','locked',true,null,null,clock_timestamp()-interval '2 days'),
  ('std-reader-future','d1141000-0000-0000-0000-000000000001','available',true,clock_timestamp()+interval '1 day',null,clock_timestamp()-interval '2 days'),
  ('std-reader-retired','d1141000-0000-0000-0000-000000000001','available',true,null,null,clock_timestamp()-interval '2 days');

insert into public.character_unlocks(
  id,subject_id,character_id,status,revision,source_world_event_id,unlocked_at,created_at,updated_at
) values
  ('d1142000-0000-0000-0000-000000000001','d1140000-0000-0000-0000-000000000001','std-reader-unlockable','unlocked',1,null,clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 hour'),
  ('d1142000-0000-0000-0000-000000000002','d1140000-0000-0000-0000-000000000001','std-reader-locked','locked',0,null,null,clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day'),
  ('d1142000-0000-0000-0000-000000000003','d1140000-0000-0000-0000-000000000002','std-reader-unlockable','locked',0,null,null,clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day');
SQL

catalog=$("${psql_base[@]}" -At -F '|' -c "select product_id,topic_key,spec_version,reader_selection_mode,purchase_unit_mode,reader_character_id,reader_content_bundle_id,catalog_availability,catalog_enabled from public.qry_standard_reading_reader_catalog_v4('11300000-0000-0000-0000-000000000001','std-reader-available');")
expected='11300000-0000-0000-0000-000000000001|love_relationship|v1|required|topic_reader_reading|std-reader-available|d1141000-0000-0000-0000-000000000001|available|t'
[[ "$catalog" == "$expected" ]] || fail "Standard Reader catalog projection mismatch: $catalog"
pass "Reader catalog resolves Product spec + active-default immutable bundle"

locked=$("${psql_base[@]}" -Atc "select catalog_availability from public.qry_standard_reading_reader_catalog_v4('11300000-0000-0000-0000-000000000001','std-reader-locked');")
[[ "$locked" == 'locked' ]] || fail "locked catalog authority was rewritten: $locked"
pass "catalog projection preserves locked state for application fail-closed resolver"

[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_standard_reading_reader_catalog_v4('11300000-0000-0000-0000-000000000001','std-reader-future');")" == '0' ]] || fail "future Reader became eligible before release_at"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_standard_reading_reader_catalog_v4('11300000-0000-0000-0000-000000000001','std-reader-retired');")" == '0' ]] || fail "retired Character remained Reader-eligible"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_standard_reading_reader_catalog_v4('11300000-0000-0000-0000-000000000099','std-reader-available');")" == '0' ]] || fail "unknown Product resolved a Reader"
pass "Reader catalog fails closed for future/retired/unknown authority"

"${psql_base[@]}" -Atc "select pg_catalog.set_config('myeongha.subject_id','d1140000-0000-0000-0000-000000000001',false);" >/dev/null
unlocked=$("${psql_base[@]}" -Atc "select status from public.qry_standard_reading_reader_unlock_v4('d1140000-0000-0000-0000-000000000001','std-reader-unlockable');")
[[ "$unlocked" == 'unlocked' ]] || fail "stored unlocked projection mismatch: $unlocked"
locked_projection=$("${psql_base[@]}" -Atc "select status from public.qry_standard_reading_reader_unlock_v4('d1140000-0000-0000-0000-000000000001','std-reader-locked');")
[[ "$locked_projection" == 'locked' ]] || fail "stored locked projection mismatch: $locked_projection"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_standard_reading_reader_unlock_v4('d1140000-0000-0000-0000-000000000001','std-reader-available');")" == '0' ]] || fail "missing unlock projection was fabricated"
pass "Reader unlock resolver returns only already-stored owner projection"

expect_fail "cross-subject Reader unlock lookup denied" "subject execution context mismatch" "select * from public.qry_standard_reading_reader_unlock_v4('d1140000-0000-0000-0000-000000000002','std-reader-unlockable');"
expect_fail "deletion-pending Reader unlock lookup denied" "subject execution context mismatch" "select * from public.qry_standard_reading_reader_unlock_v4('d1140000-0000-0000-0000-000000000003','std-reader-unlockable');"

for fn in 'public.qry_standard_reading_reader_catalog_v4(uuid,text)' 'public.qry_standard_reading_reader_unlock_v4(uuid,text)'; do
  [[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','$fn','EXECUTE') then '1' else '0' end;")" == '0' ]] || fail "$fn unexpectedly executable by PUBLIC"
  [[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','$fn','EXECUTE') then '1' else '0' end;")" == '1' ]] || fail "$fn not executable by myeongha_api_executor"
done
[[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('myeongha_api_executor','public.cmd_create_standard_reading_purchase_intent_v4(uuid,uuid,uuid,uuid,text,text,jsonb,text,jsonb,text,uuid,text,uuid,text,jsonb,text)','EXECUTE') then '1' else '0' end;")" == '0' ]] || fail "v4 purchase command was accidentally activated"
pass "Reader read functions are executor-only while v4 purchase execution remains revoked"

before=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(subject_id::text||'|'||character_id||'|'||status||'|'||revision::text,E'\n' order by subject_id,character_id),'')) from public.character_unlocks;")
"${psql_base[@]}" -Atc "select status from public.qry_standard_reading_reader_unlock_v4('d1140000-0000-0000-0000-000000000001','std-reader-unlockable');" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(subject_id::text||'|'||character_id||'|'||status||'|'||revision::text,E'\n' order by subject_id,character_id),'')) from public.character_unlocks;")
[[ "$before" == "$after" ]] || fail "Reader data-source lookup mutated Character Unlock authority"
pass "Reader data-source is projection-only"

echo "Standard Reading Reader runtime query tests passed"
