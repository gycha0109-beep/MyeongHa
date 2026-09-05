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
  ('c6200000-0000-0000-0000-000000000001','relation-query-v1','sha256:v1:relation-query-v1','artifact://relation-query-v1','v1','client-v1','sha256:v1:assets-relation-query-v1','cue-v1','{}'::jsonb,'2026-03-01T00:00:00Z',null),
  ('c6200000-0000-0000-0000-000000000002','relation-query-retired-v1','sha256:v1:relation-query-retired-v1','artifact://relation-query-retired-v1','v1','client-v1','sha256:v1:assets-relation-query-retired-v1','cue-v1','{}'::jsonb,'2025-03-01T00:00:00Z','2025-12-31T00:00:00Z'),
  ('c6200000-0000-0000-0000-000000000003','relation-query-empty-v1','sha256:v1:relation-query-empty-v1','artifact://relation-query-empty-v1','v1','client-v1','sha256:v1:assets-relation-query-empty-v1','cue-v1','{}'::jsonb,'2026-03-01T00:00:00Z',null);

insert into public.characters(character_id,created_at,retired_at) values
  ('relation-query-alpha','2025-01-01T00:00:00Z',null),
  ('relation-query-beta','2025-01-01T00:00:00Z',null),
  ('relation-query-gamma','2025-01-01T00:00:00Z',null);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values
  ('relation-query-alpha','c6200000-0000-0000-0000-000000000001','available',true,'2026-03-02T00:00:00Z',null,'2026-03-01T00:00:00Z'),
  ('relation-query-beta','c6200000-0000-0000-0000-000000000001','available',true,'2026-03-02T00:00:00Z',null,'2026-03-01T00:00:00Z'),
  ('relation-query-gamma','c6200000-0000-0000-0000-000000000001','locked',false,null,null,'2026-03-01T00:00:00Z'),
  ('relation-query-alpha','c6200000-0000-0000-0000-000000000002','available',true,'2025-03-02T00:00:00Z','2025-12-31T00:00:00Z','2025-03-01T00:00:00Z'),
  ('relation-query-beta','c6200000-0000-0000-0000-000000000002','available',true,'2025-03-02T00:00:00Z','2025-12-31T00:00:00Z','2025-03-01T00:00:00Z'),
  ('relation-query-alpha','c6200000-0000-0000-0000-000000000003','available',true,'2026-03-02T00:00:00Z',null,'2026-03-01T00:00:00Z');

insert into public.character_relations(
  id,content_bundle_id,from_character_id,to_character_id,relation_key,relation_payload_jsonb
) values
  ('c6201000-0000-0000-0000-000000000003','c6200000-0000-0000-0000-000000000001','relation-query-beta','relation-query-alpha','distrust','{"history_event":"broken_promise","intensity":3}'::jsonb),
  ('c6201000-0000-0000-0000-000000000002','c6200000-0000-0000-0000-000000000001','relation-query-alpha','relation-query-gamma','tension','{"history_event":"failed_trial","intensity":2}'::jsonb),
  ('c6201000-0000-0000-0000-000000000001','c6200000-0000-0000-0000-000000000001','relation-query-alpha','relation-query-beta','respect','{"history_event":"shared_oath","intensity":4}'::jsonb),
  ('c6201000-0000-0000-0000-000000000004','c6200000-0000-0000-0000-000000000002','relation-query-alpha','relation-query-beta','old_alliance','{"history_event":"first_pact","intensity":1}'::jsonb);
SQL

relations=$("${psql_base[@]}" -At -F '|' -c "select from_character_id,to_character_id,relation_key,relation_payload_jsonb->>'history_event',relation_payload_jsonb->>'intensity' from public.qry_character_bundle_relations_v1('c6200000-0000-0000-0000-000000000001');")
expected_relations=$'relation-query-alpha|relation-query-beta|respect|shared_oath|4\nrelation-query-alpha|relation-query-gamma|tension|failed_trial|2\nrelation-query-beta|relation-query-alpha|distrust|broken_promise|3'
[[ "$relations" == "$expected_relations" ]] || { echo "$relations" >&2; fail "character bundle relation projection mismatch"; }
pass "character relations return exact bundle canon in deterministic directed order"

[[ "$relations" == *'relation-query-alpha|relation-query-beta|respect|shared_oath|4'* ]] || fail "alpha to beta relation missing"
[[ "$relations" == *'relation-query-beta|relation-query-alpha|distrust|broken_promise|3'* ]] || fail "beta to alpha relation missing"
pass "asymmetric character relations remain distinct directed canon rows"

payload=$("${psql_base[@]}" -Atc "select relation_payload_jsonb = '{\"history_event\":\"shared_oath\",\"intensity\":4}'::jsonb from public.qry_character_bundle_relations_v1('c6200000-0000-0000-0000-000000000001') where from_character_id='relation-query-alpha' and to_character_id='relation-query-beta' and relation_key='respect';")
[[ "$payload" == 't' ]] || fail "relation canon payload was transformed"
pass "validated relation payload is passed through without synthesis or reinterpretation"

retired=$("${psql_base[@]}" -At -F '|' -c "select from_character_id,to_character_id,relation_key,relation_payload_jsonb->>'history_event' from public.qry_character_bundle_relations_v1('c6200000-0000-0000-0000-000000000002');")
[[ "$retired" == 'relation-query-alpha|relation-query-beta|old_alliance|first_pact' ]] || fail "retired bundle relation projection mismatch: $retired"
pass "retired immutable bundle relation canon remains readable for historical reproduction"

empty_count=$("${psql_base[@]}" -Atc "select count(*) from public.qry_character_bundle_relations_v1('c6200000-0000-0000-0000-000000000003');")
[[ "$empty_count" == '0' ]] || fail "empty bundle synthesized relation rows"
pass "valid bundle with no character relations remains an empty projection"

shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_character_bundle_relations_v1('c6200000-0000-0000-0000-000000000001') q where from_character_id='relation-query-alpha' and to_character_id='relation-query-beta';")
for required in from_character_id to_character_id relation_key relation_payload_jsonb; do
  [[ "$shape" == *"\"$required\""* ]] || fail "character relation projection omitted $required: $shape"
done
for forbidden in id content_bundle_id subject_id relationship_stage closeness trust unlock_state availability enabled revision; do
  [[ "$shape" != *"\"$forbidden\""* ]] || fail "character relation projection leaked unrelated authority field $forbidden: $shape"
done
pass "character relation projection is bounded to immutable character-to-character canon fields"

before=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(from_character_id||'|'||to_character_id||'|'||relation_key||'|'||relation_payload_jsonb::text, E'\n' order by content_bundle_id,from_character_id,to_character_id,relation_key),'')) from public.character_relations;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_character_bundle_relations_v1('c6200000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(from_character_id||'|'||to_character_id||'|'||relation_key||'|'||relation_payload_jsonb::text, E'\n' order by content_bundle_id,from_character_id,to_character_id,relation_key),'')) from public.character_relations;")
[[ "$before" == "$after" ]] || fail "character relation read mutated canon state"
pass "character relation projection is read-only"

expect_fail "null character relation bundle is denied" "content bundle is required" "select * from public.qry_character_bundle_relations_v1(null);"
expect_fail "unknown character relation bundle is denied" "content bundle was not found" "select * from public.qry_character_bundle_relations_v1('c6200000-0000-0000-0000-000000000099');"

stable=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_character_bundle_relations_v1(uuid)'::regprocedure;")
[[ "$stable" == 's' ]] || fail "character relation projection function is not STABLE: $stable"
pass "character relation projection function is declared STABLE"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_character_bundle_relations_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "character relation projection unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "character relation projection remains API-mediated and public table catalog remains 60"

echo "Character bundle relation projection tests passed"