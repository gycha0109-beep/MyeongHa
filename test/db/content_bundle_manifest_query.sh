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
  ('c6300000-0000-0000-0000-000000000001','manifest-query-v1','sha256:v1:manifest-query-v1','private://resolver/manifest-query-v1','artifact-v7','client-cap-v3','sha256:v1:assets-manifest-query-v1','cue-v4','{"privateInternal":"must-not-leak","characterIds":["wrong-json-value"]}'::jsonb,'2026-04-01T00:00:00Z',null),
  ('c6300000-0000-0000-0000-000000000002','manifest-query-retired-v1','sha256:v1:manifest-query-retired-v1','private://resolver/manifest-query-retired-v1','artifact-v6','client-cap-v2','sha256:v1:assets-manifest-query-retired-v1','cue-v3','{"privateInternal":"retired"}'::jsonb,'2025-04-01T00:00:00Z','2026-01-01T00:00:00Z'),
  ('c6300000-0000-0000-0000-000000000003','manifest-query-empty-v1','sha256:v1:manifest-query-empty-v1','private://resolver/manifest-query-empty-v1','artifact-v7','client-cap-v3','sha256:v1:assets-manifest-query-empty-v1','cue-v4','{}'::jsonb,'2026-04-01T00:00:00Z',null);

insert into public.characters(character_id,created_at,retired_at) values
  ('manifest-query-alpha','2025-01-01T00:00:00Z',null),
  ('manifest-query-beta','2025-01-01T00:00:00Z',null),
  ('manifest-query-gamma','2025-01-01T00:00:00Z',null);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values
  ('manifest-query-gamma','c6300000-0000-0000-0000-000000000001','locked',false,null,null,'2026-04-01T00:00:00Z'),
  ('manifest-query-alpha','c6300000-0000-0000-0000-000000000001','available',true,'2026-04-02T00:00:00Z',null,'2026-04-01T00:00:00Z'),
  ('manifest-query-beta','c6300000-0000-0000-0000-000000000001','unlockable',true,'2026-04-02T00:00:00Z',null,'2026-04-01T00:00:00Z'),
  ('manifest-query-alpha','c6300000-0000-0000-0000-000000000002','available',true,'2025-04-02T00:00:00Z','2026-01-01T00:00:00Z','2025-04-01T00:00:00Z');
SQL

manifest=$("${psql_base[@]}" -At -F '|' -c "select content_version,min_client_capability,array_to_string(character_ids,','),asset_manifest_hash,cue_schema_version from public.qry_content_bundle_manifest_v1('c6300000-0000-0000-0000-000000000001');")
expected='manifest-query-v1|client-cap-v3|manifest-query-alpha,manifest-query-beta,manifest-query-gamma|sha256:v1:assets-manifest-query-v1|cue-v4'
[[ "$manifest" == "$expected" ]] || { echo "$manifest" >&2; fail "content bundle manifest projection mismatch"; }
pass "content manifest returns exact bounded fields and deterministic characterIds"

[[ "$manifest" != *'wrong-json-value'* ]] || fail "raw manifest_jsonb characterIds overrode normalized bundle catalog"
pass "characterIds come from normalized immutable bundle catalog rather than opaque raw manifest JSON"

retired=$("${psql_base[@]}" -At -F '|' -c "select content_version,array_to_string(character_ids,','),asset_manifest_hash,cue_schema_version from public.qry_content_bundle_manifest_v1('c6300000-0000-0000-0000-000000000002');")
[[ "$retired" == 'manifest-query-retired-v1|manifest-query-alpha|sha256:v1:assets-manifest-query-retired-v1|cue-v3' ]] || fail "retired bundle manifest projection mismatch: $retired"
pass "retired immutable bundle manifest remains readable for historical reproduction"

empty=$("${psql_base[@]}" -At -F '|' -c "select content_version,cardinality(character_ids) from public.qry_content_bundle_manifest_v1('c6300000-0000-0000-0000-000000000003');")
[[ "$empty" == 'manifest-query-empty-v1|0' ]] || fail "empty characterIds projection mismatch: $empty"
pass "bundle without character catalog rows returns an empty characterIds array"

shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_content_bundle_manifest_v1('c6300000-0000-0000-0000-000000000001') q;")
for required in content_version min_client_capability character_ids asset_manifest_hash cue_schema_version; do
  [[ "$shape" == *"\"$required\""* ]] || fail "content manifest projection omitted $required: $shape"
done
for forbidden in id content_bundle_id content_hash artifact_ref artifact_schema_version manifest_jsonb published_at retired_at release_key rollout_jsonb rollout_seed status is_default privateInternal; do
  [[ "$shape" != *"\"$forbidden\""* ]] || fail "content manifest projection leaked internal/operational field $forbidden: $shape"
done
pass "content manifest projection excludes private resolver, raw manifest, and release authority fields"

before=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(id::text||'|'||content_version||'|'||artifact_ref||'|'||manifest_jsonb::text, E'\n' order by id),'')) from public.content_bundles;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_content_bundle_manifest_v1('c6300000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(id::text||'|'||content_version||'|'||artifact_ref||'|'||manifest_jsonb::text, E'\n' order by id),'')) from public.content_bundles;")
[[ "$before" == "$after" ]] || fail "content manifest read mutated bundle state"
pass "content manifest projection is read-only"

expect_fail "null manifest bundle is denied" "content bundle is required" "select * from public.qry_content_bundle_manifest_v1(null);"
expect_fail "unknown manifest bundle is denied" "content bundle was not found" "select * from public.qry_content_bundle_manifest_v1('c6300000-0000-0000-0000-000000000099');"

stable=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_content_bundle_manifest_v1(uuid)'::regprocedure;")
[[ "$stable" == 's' ]] || fail "content manifest projection function is not STABLE: $stable"
pass "content manifest projection function is declared STABLE"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_content_bundle_manifest_v1(uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "content manifest projection unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "content manifest projection remains API-mediated and public table catalog remains 59"

echo "Content bundle manifest projection tests passed"
