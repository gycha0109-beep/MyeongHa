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
insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
  asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at,retired_at
) values
  ('e6100000-0000-0000-0000-000000000001','episode-query-v1','sha256:v1:episode-query-v1','artifact://episode-query-v1','v1','client-v1','sha256:v1:assets-episode-query-v1','cue-v1','{}'::jsonb,'2026-02-01T00:00:00Z',null),
  ('e6100000-0000-0000-0000-000000000002','episode-query-retired-v1','sha256:v1:episode-query-retired-v1','artifact://episode-query-retired-v1','v1','client-v1','sha256:v1:assets-episode-query-retired-v1','cue-v1','{}'::jsonb,'2025-02-01T00:00:00Z','2025-12-31T00:00:00Z');

insert into public.characters(character_id,created_at,retired_at) values
  ('episode-query-alpha','2025-01-01T00:00:00Z',null),
  ('episode-query-beta','2025-01-01T00:00:00Z',null),
  ('episode-query-global-only','2025-01-01T00:00:00Z',null);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values
  ('episode-query-alpha','e6100000-0000-0000-0000-000000000001','available',true,'2026-02-02T00:00:00Z',null,'2026-02-01T00:00:00Z'),
  ('episode-query-beta','e6100000-0000-0000-0000-000000000001','locked',false,null,null,'2026-02-01T00:00:00Z'),
  ('episode-query-alpha','e6100000-0000-0000-0000-000000000002','available',true,'2025-02-02T00:00:00Z','2025-12-31T00:00:00Z','2025-02-01T00:00:00Z');

insert into public.episode_runtime_catalog(
  episode_id,content_bundle_id,enabled,release_at,retire_at,min_client_capability
) values
  ('episode-alpha','e6100000-0000-0000-0000-000000000001',true,'2026-02-03T00:00:00Z',null,'client-v2'),
  ('episode-beta','e6100000-0000-0000-0000-000000000001',false,null,'2026-12-31T00:00:00Z','client-v3'),
  ('episode-alpha','e6100000-0000-0000-0000-000000000002',false,null,'2025-12-31T00:00:00Z','client-v1');

insert into public.episode_participants(
  episode_id,content_bundle_id,character_id,role
) values
  ('episode-alpha','e6100000-0000-0000-0000-000000000001','episode-query-beta','support'),
  ('episode-alpha','e6100000-0000-0000-0000-000000000001','episode-query-alpha','lead'),
  ('episode-alpha','e6100000-0000-0000-0000-000000000002','episode-query-alpha','lead');
SQL

catalog=$("${psql_base[@]}" -At -F '|' -c "select episode_id,catalog_enabled,coalesce(release_at::text,'<null>'),coalesce(retire_at::text,'<null>'),min_client_capability from public.qry_episode_bundle_catalog_v1('e6100000-0000-0000-0000-000000000001');")
expected_catalog=$'episode-alpha|t|2026-02-03 00:00:00+00|<null>|client-v2\nepisode-beta|f|<null>|2026-12-31 00:00:00+00|client-v3'
[[ "$catalog" == "$expected_catalog" ]] || { echo "$catalog" >&2; fail "episode bundle catalog projection mismatch"; }
pass "episode bundle catalog returns exact declared rows in deterministic episode order"

[[ "$catalog" == *'episode-beta|f|<null>|2026-12-31 00:00:00+00|client-v3'* ]] || fail "disabled bundle episode was filtered or reinterpreted"
pass "catalog_enabled is projected as bundle-declared data, not a current kill-switch decision"

retired=$("${psql_base[@]}" -At -F '|' -c "select episode_id,catalog_enabled,min_client_capability from public.qry_episode_bundle_catalog_v1('e6100000-0000-0000-0000-000000000002');")
[[ "$retired" == 'episode-alpha|f|client-v1' ]] || fail "retired bundle episode projection mismatch: $retired"
pass "retired immutable bundle remains readable for pinned historical reproduction"

participants=$("${psql_base[@]}" -At -F '|' -c "select character_id,role from public.qry_episode_bundle_participants_v1('e6100000-0000-0000-0000-000000000001','episode-alpha');")
expected_participants=$'episode-query-alpha|lead\nepisode-query-beta|support'
[[ "$participants" == "$expected_participants" ]] || { echo "$participants" >&2; fail "episode participant projection mismatch"; }
pass "episode participant rows preserve declared role in deterministic character order"

zero_participants=$("${psql_base[@]}" -Atc "select count(*) from public.qry_episode_bundle_participants_v1('e6100000-0000-0000-0000-000000000001','episode-beta');")
[[ "$zero_participants" == '0' ]] || fail "episode with no participants synthesized rows"
pass "catalog episode with no participant rows remains an empty participant projection"

catalog_shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_episode_bundle_catalog_v1('e6100000-0000-0000-0000-000000000001') q where episode_id='episode-alpha';")
for required in episode_id catalog_enabled release_at retire_at min_client_capability; do
  [[ "$catalog_shape" == *"\"$required\""* ]] || fail "episode catalog projection omitted $required: $catalog_shape"
done
for forbidden in content_bundle_id content_hash artifact_ref manifest_jsonb subject_id rollout_jsonb current_node_key revision; do
  [[ "$catalog_shape" != *"\"$forbidden\""* ]] || fail "episode catalog projection leaked unrelated authority field $forbidden: $catalog_shape"
done
pass "episode catalog projection is bounded to bundle-declared runtime fields"

participant_shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_episode_bundle_participants_v1('e6100000-0000-0000-0000-000000000001','episode-alpha') q where character_id='episode-query-alpha';")
for required in character_id role; do
  [[ "$participant_shape" == *"\"$required\""* ]] || fail "participant projection omitted $required: $participant_shape"
done
for forbidden in content_bundle_id episode_id availability enabled subject_id closeness trust revision; do
  [[ "$participant_shape" != *"\"$forbidden\""* ]] || fail "participant projection leaked unrelated authority field $forbidden: $participant_shape"
done
pass "participant projection excludes bundle identity and subject/runtime state"

before=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(episode_id||'|'||content_bundle_id::text||'|'||enabled::text||'|'||coalesce(release_at::text,'')||'|'||coalesce(retire_at::text,'')||'|'||min_client_capability, E'\n' order by content_bundle_id,episode_id),'')) from public.episode_runtime_catalog;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_episode_bundle_catalog_v1('e6100000-0000-0000-0000-000000000001');" >/dev/null
"${psql_base[@]}" -Atc "select count(*) from public.qry_episode_bundle_participants_v1('e6100000-0000-0000-0000-000000000001','episode-alpha');" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(episode_id||'|'||content_bundle_id::text||'|'||enabled::text||'|'||coalesce(release_at::text,'')||'|'||coalesce(retire_at::text,'')||'|'||min_client_capability, E'\n' order by content_bundle_id,episode_id),'')) from public.episode_runtime_catalog;")
[[ "$before" == "$after" ]] || fail "episode bundle projection read mutated catalog state"
pass "episode bundle projections are read-only"

expect_fail "null episode catalog bundle is denied" "content bundle is required" "select * from public.qry_episode_bundle_catalog_v1(null);"
expect_fail "unknown episode catalog bundle is denied" "content bundle was not found" "select * from public.qry_episode_bundle_catalog_v1('e6100000-0000-0000-0000-000000000099');"
expect_fail "null participant bundle is denied" "content bundle is required" "select * from public.qry_episode_bundle_participants_v1(null,'episode-alpha');"
expect_fail "blank participant episode is denied" "episode id is required" "select * from public.qry_episode_bundle_participants_v1('e6100000-0000-0000-0000-000000000001','   ');"
expect_fail "episode absent from bundle is denied" "episode was not found in this content bundle" "select * from public.qry_episode_bundle_participants_v1('e6100000-0000-0000-0000-000000000001','episode-global-only');"

stable=$("${psql_base[@]}" -At -F '|' -c "select proname,provolatile from pg_proc where oid in ('public.qry_episode_bundle_catalog_v1(uuid)'::regprocedure,'public.qry_episode_bundle_participants_v1(uuid,text)'::regprocedure) order by proname;")
expected_stable=$'qry_episode_bundle_catalog_v1|s\nqry_episode_bundle_participants_v1|s'
[[ "$stable" == "$expected_stable" ]] || { echo "$stable" >&2; fail "episode bundle projection functions are not STABLE"; }
pass "episode bundle projection functions are declared STABLE"

public_catalog=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_episode_bundle_catalog_v1(uuid)','EXECUTE') then '1' else '0' end;")
public_participants=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_episode_bundle_participants_v1(uuid,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_catalog" == '0' && "$public_participants" == '0' ]] || fail "episode bundle projection unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "episode bundle projection remains API-mediated and public table catalog remains 59"

echo "Episode bundle catalog/participant projection tests passed"
