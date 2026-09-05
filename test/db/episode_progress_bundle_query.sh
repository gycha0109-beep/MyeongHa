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
  ('e6500000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('e6510000-0000-0000-0000-000000000001','guest',null,'active',null,'2026-06-01T00:00:00Z','2026-06-01T00:00:00Z'),
  ('e6510000-0000-0000-0000-000000000002','guest',null,'active',null,'2026-06-01T00:00:00Z','2026-06-01T00:00:00Z'),
  ('e6510000-0000-0000-0000-000000000003','guest',null,'deletion_pending',null,'2026-06-01T00:00:00Z','2026-06-01T00:00:00Z'),
  ('e6510000-0000-0000-0000-000000000004','member','e6500000-0000-0000-0000-000000000001','active',null,'2026-06-01T00:00:00Z','2026-06-01T00:00:00Z'),
  ('e6510000-0000-0000-0000-000000000005','guest',null,'merged','e6510000-0000-0000-0000-000000000004','2026-06-01T00:00:00Z','2026-06-01T00:00:00Z');

insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
  asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at,retired_at
) values
  ('e6520000-0000-0000-0000-000000000001','progress-v1','sha256:v1:progress-v1','private://progress-v1','artifact-v1','client-v1','sha256:v1:assets-progress-v1','cue-v1','{}'::jsonb,'2026-06-01T00:00:00Z',null),
  ('e6520000-0000-0000-0000-000000000002','progress-v2','sha256:v1:progress-v2','private://progress-v2','artifact-v1','client-v2','sha256:v1:assets-progress-v2','cue-v2','{}'::jsonb,'2026-07-01T00:00:00Z',null),
  ('e6520000-0000-0000-0000-000000000003','progress-retired','sha256:v1:progress-retired','private://progress-retired','artifact-v1','client-v1','sha256:v1:assets-progress-retired','cue-v1','{}'::jsonb,'2025-06-01T00:00:00Z','2026-01-01T00:00:00Z');

insert into public.episode_runtime_catalog(
  episode_id,content_bundle_id,enabled,release_at,retire_at,min_client_capability
) values
  ('episode-progress-alpha','e6520000-0000-0000-0000-000000000001',true,'2026-06-02T00:00:00Z',null,'client-v1'),
  ('episode-progress-alpha','e6520000-0000-0000-0000-000000000002',true,'2026-07-02T00:00:00Z',null,'client-v2'),
  ('episode-progress-alpha','e6520000-0000-0000-0000-000000000003',false,'2025-06-02T00:00:00Z','2026-01-01T00:00:00Z','client-v1'),
  ('episode-progress-empty','e6520000-0000-0000-0000-000000000001',true,'2026-06-02T00:00:00Z',null,'client-v1');

insert into public.user_episode_progress(
  id,subject_id,episode_id,content_bundle_id,state,current_node_key,revision,started_at,completed_at,updated_at
) values
  ('e6530000-0000-0000-0000-000000000001','e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000001','active','node-v1-2',2,'2026-06-03T00:00:00Z',null,'2026-06-04T00:00:00Z'),
  ('e6530000-0000-0000-0000-000000000002','e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000002','completed','node-v2-end',5,'2026-07-03T00:00:00Z','2026-07-05T00:00:00Z','2026-07-05T00:00:00Z'),
  ('e6530000-0000-0000-0000-000000000003','e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000003','abandoned','node-old-3',3,'2025-06-03T00:00:00Z',null,'2025-06-06T00:00:00Z'),
  ('e6530000-0000-0000-0000-000000000004','e6510000-0000-0000-0000-000000000002','episode-progress-alpha','e6520000-0000-0000-0000-000000000001','active','other-owner-node',9,'2026-06-03T00:00:00Z',null,'2026-06-09T00:00:00Z');
SQL

v1=$("${psql_base[@]}" -At -F '|' -c "select episode_id,content_bundle_id,state,current_node_key,revision,to_char(started_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),coalesce(to_char(completed_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'NULL'),to_char(updated_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS') from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000001');")
expected_v1='episode-progress-alpha|e6520000-0000-0000-0000-000000000001|active|node-v1-2|2|2026-06-03 00:00:00|NULL|2026-06-04 00:00:00'
[[ "$v1" == "$expected_v1" ]] || { echo "$v1" >&2; fail "bundle v1 progress projection mismatch"; }
pass "explicit bundle v1 selector returns only its stored progress row"

v2=$("${psql_base[@]}" -At -F '|' -c "select state,current_node_key,revision,completed_at::text from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000002');")
[[ "$v2" == 'completed|node-v2-end|5|2026-07-05 00:00:00+00' ]] || fail "bundle v2 progress projection mismatch: $v2"
pass "same stable episode can expose a different explicitly pinned bundle progress without hidden current selection"

retired=$("${psql_base[@]}" -At -F '|' -c "select state,current_node_key,revision from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000003');")
[[ "$retired" == 'abandoned|node-old-3|3' ]] || fail "retired bundle progress projection mismatch: $retired"
pass "stored retired-bundle progress remains readable without runtime enable/default reinterpretation"

absent=$("${psql_base[@]}" -Atc "select count(*) from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-empty','e6520000-0000-0000-0000-000000000001');")
[[ "$absent" == '0' ]] || fail "absent progress was synthesized: $absent"
pass "missing progress row is not fabricated as not_started"

unknown_bundle=$("${psql_base[@]}" -Atc "select count(*) from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000099');")
[[ "$unknown_bundle" == '0' ]] || fail "unknown bundle selector unexpectedly returned progress"
pass "unknown explicit bundle selector remains an empty stored-row projection"

other_owner=$("${psql_base[@]}" -Atc "select count(*) from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000001') where revision=9;")
[[ "$other_owner" == '0' ]] || fail "episode progress projection exposed another owner's row"
pass "episode progress projection is strictly owner-scoped"

shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000001') q;")
for required in episode_id content_bundle_id state current_node_key revision started_at completed_at updated_at; do
  [[ "$shape" == *"\"$required\""* ]] || fail "episode progress projection omitted $required: $shape"
done
for forbidden in '"id"' subject_id event_dedupe_key event_type from_node_key to_node_key choice_key source_turn_id payload_jsonb rollout_jsonb rollout_seed enabled release_at min_client_capability; do
  [[ "$shape" != *"$forbidden"* ]] || fail "episode progress projection leaked unrelated authority field $forbidden: $shape"
done
pass "episode progress projection is bounded to current pinned progress state"

before=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(id::text||'|'||state||'|'||revision::text||'|'||coalesce(current_node_key,''), E'\n' order by id),'')) from public.user_episode_progress;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-alpha','e6520000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(id::text||'|'||state||'|'||revision::text||'|'||coalesce(current_node_key,''), E'\n' order by id),'')) from public.user_episode_progress;")
[[ "$before" == "$after" ]] || fail "episode progress read mutated stored projection"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.episode_progress_events;")" == '0' ]] || fail "episode progress read created event ledger rows"
pass "episode progress read is projection-only and does not touch event authority"

expect_fail "null progress subject is denied" "episode progress subject is required" "select * from public.qry_episode_progress_bundle_v1(null,'episode-progress-alpha','e6520000-0000-0000-0000-000000000001');"
expect_fail "deletion-pending progress subject is denied" "episode progress read requires an active canonical subject" "select * from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000003','episode-progress-alpha','e6520000-0000-0000-0000-000000000001');"
expect_fail "merged progress subject is denied" "episode progress read requires an active canonical subject" "select * from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000005','episode-progress-alpha','e6520000-0000-0000-0000-000000000001');"
expect_fail "unknown progress subject is denied" "episode progress read requires an active canonical subject" "select * from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000099','episode-progress-alpha','e6520000-0000-0000-0000-000000000001');"
expect_fail "blank progress episode is denied" "episode id is required" "select * from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','   ','e6520000-0000-0000-0000-000000000001');"
expect_fail "null progress bundle is denied" "content bundle is required" "select * from public.qry_episode_progress_bundle_v1('e6510000-0000-0000-0000-000000000001','episode-progress-alpha',null);"

volatility=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_episode_progress_bundle_v1(uuid,text,uuid)'::regprocedure;")
[[ "$volatility" == 's' ]] || fail "episode progress bundle query is not STABLE: $volatility"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_episode_progress_bundle_v1(uuid,text,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "episode progress bundle query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "episode progress bundle query is STABLE, API-mediated, and public table catalog remains 60"

echo "Explicit bundle-pinned Episode Progress projection tests passed"
