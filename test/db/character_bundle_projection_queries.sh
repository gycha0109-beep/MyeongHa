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
  ('c6000000-0000-0000-0000-000000000001','character-query-v1','sha256:v1:character-query-v1','artifact://character-query-v1','v1','client-v1','sha256:v1:assets-character-query-v1','cue-v1','{}'::jsonb,'2026-01-01T00:00:00Z',null),
  ('c6000000-0000-0000-0000-000000000002','character-query-retired-v1','sha256:v1:character-query-retired-v1','artifact://character-query-retired-v1','v1','client-v1','sha256:v1:assets-character-query-retired-v1','cue-v1','{}'::jsonb,'2025-01-01T00:00:00Z','2025-12-31T00:00:00Z');

insert into public.characters(character_id,created_at,retired_at) values
  ('query-alpha','2025-01-01T00:00:00Z',null),
  ('query-beta','2025-01-01T00:00:00Z',null),
  ('query-global-only','2025-01-01T00:00:00Z',null);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values
  ('query-alpha','c6000000-0000-0000-0000-000000000001','available',true,'2026-01-02T00:00:00Z',null,'2026-01-01T00:00:00Z'),
  ('query-beta','c6000000-0000-0000-0000-000000000001','locked',false,null,'2026-12-31T00:00:00Z','2026-01-01T00:00:00Z'),
  ('query-alpha','c6000000-0000-0000-0000-000000000002','coming_soon',false,null,'2025-12-31T00:00:00Z','2025-01-01T00:00:00Z');

insert into public.character_capabilities(
  id,content_bundle_id,character_id,saju_domain,role,can_initiate,capability_version
) values
  ('c6100000-0000-0000-0000-000000000001','c6000000-0000-0000-0000-000000000001','query-alpha','relationship','secondary',false,'cap-query-rel-v1'),
  ('c6100000-0000-0000-0000-000000000002','c6000000-0000-0000-0000-000000000001','query-alpha','career','primary',true,'cap-query-career-v1');

insert into public.saju_domain_runtime(saju_domain,availability,capability_version,required_engine_version,updated_at)
values ('career','unavailable','runtime-independent-v1','engine-independent-v1',clock_timestamp())
on conflict (saju_domain) do update
set availability=excluded.availability,
    capability_version=excluded.capability_version,
    required_engine_version=excluded.required_engine_version,
    updated_at=excluded.updated_at;
SQL

catalog=$("${psql_base[@]}" -At -F '|' -c "select character_id,catalog_availability,catalog_enabled,coalesce(release_at::text,'<null>'),coalesce(retire_at::text,'<null>') from public.qry_character_bundle_catalog_v1('c6000000-0000-0000-0000-000000000001');")
expected_catalog=$'query-alpha|available|t|2026-01-02 00:00:00+00|<null>\nquery-beta|locked|f|<null>|2026-12-31 00:00:00+00'
[[ "$catalog" == "$expected_catalog" ]] || { echo "$catalog" >&2; fail "bundle catalog projection mismatch"; }
pass "bundle catalog returns exact declared rows in deterministic character order"

retired=$("${psql_base[@]}" -At -F '|' -c "select character_id,catalog_availability,catalog_enabled from public.qry_character_bundle_catalog_v1('c6000000-0000-0000-0000-000000000002');")
[[ "$retired" == 'query-alpha|coming_soon|f' ]] || fail "retired bundle projection mismatch: $retired"
pass "retired immutable bundle remains readable for pinned historical reproduction"

caps=$("${psql_base[@]}" -At -F '|' -c "select saju_domain,role,can_initiate,capability_version from public.qry_character_bundle_capabilities_v1('c6000000-0000-0000-0000-000000000001','query-alpha');")
expected_caps=$'career|primary|t|cap-query-career-v1\nrelationship|secondary|f|cap-query-rel-v1'
[[ "$caps" == "$expected_caps" ]] || { echo "$caps" >&2; fail "character capability projection mismatch"; }
pass "bundle capability rows preserve declared role/initiation/version in deterministic domain order"

runtime_state=$("${psql_base[@]}" -Atc "select availability from public.saju_domain_runtime where saju_domain='career';")
[[ "$runtime_state" == 'unavailable' ]] || fail "career runtime independence fixture mismatch"
[[ "$caps" == *'career|primary|t|cap-query-career-v1'* ]] || fail "operational runtime state incorrectly filtered bundle capability projection"
pass "bundle capability projection does not reinterpret Saju operational runtime authority"

zero_caps=$("${psql_base[@]}" -Atc "select count(*) from public.qry_character_bundle_capabilities_v1('c6000000-0000-0000-0000-000000000001','query-beta');")
[[ "$zero_caps" == '0' ]] || fail "zero-capability character synthesized capability rows"
pass "catalog character with no capability rows remains an empty capability projection"

catalog_shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_character_bundle_catalog_v1('c6000000-0000-0000-0000-000000000001') q where character_id='query-alpha';")
for required in character_id catalog_availability catalog_enabled release_at retire_at catalog_published_at; do
  [[ "$catalog_shape" == *"\"$required\""* ]] || fail "catalog projection omitted $required: $catalog_shape"
done
for forbidden in content_bundle_id content_hash artifact_ref manifest_jsonb subject_id rollout_jsonb; do
  [[ "$catalog_shape" != *"$forbidden"* ]] || fail "catalog projection leaked unrelated authority field $forbidden: $catalog_shape"
done
pass "catalog projection is bounded to bundle-declared Character runtime fields"

cap_shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_character_bundle_capabilities_v1('c6000000-0000-0000-0000-000000000001','query-alpha') q where saju_domain='career';")
for required in saju_domain role can_initiate capability_version; do
  [[ "$cap_shape" == *"\"$required\""* ]] || fail "capability projection omitted $required: $cap_shape"
done
for forbidden in id content_bundle_id character_id availability required_engine_version; do
  [[ "$cap_shape" != *"$forbidden\""* ]] || fail "capability projection leaked unrelated authority field $forbidden: $cap_shape"
done
pass "capability projection excludes internal row identity and operational Saju runtime state"

before=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(character_id||'|'||content_bundle_id::text||'|'||availability||'|'||enabled::text||'|'||published_at::text, E'\n' order by content_bundle_id,character_id),'')) from public.character_runtime_catalog;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_character_bundle_catalog_v1('c6000000-0000-0000-0000-000000000001');" >/dev/null
"${psql_base[@]}" -Atc "select count(*) from public.qry_character_bundle_capabilities_v1('c6000000-0000-0000-0000-000000000001','query-alpha');" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(character_id||'|'||content_bundle_id::text||'|'||availability||'|'||enabled::text||'|'||published_at::text, E'\n' order by content_bundle_id,character_id),'')) from public.character_runtime_catalog;")
[[ "$before" == "$after" ]] || fail "bundle projection read mutated catalog state"
pass "bundle projections are read-only"

expect_fail "null bundle catalog read is denied" "content bundle is required" "select * from public.qry_character_bundle_catalog_v1(null);"
expect_fail "unknown bundle catalog read is denied" "content bundle was not found" "select * from public.qry_character_bundle_catalog_v1('c6000000-0000-0000-0000-000000000099');"
expect_fail "null capability bundle is denied" "content bundle is required" "select * from public.qry_character_bundle_capabilities_v1(null,'query-alpha');"
expect_fail "blank capability character is denied" "character id is required" "select * from public.qry_character_bundle_capabilities_v1('c6000000-0000-0000-0000-000000000001','   ');"
expect_fail "global character absent from bundle is denied" "character was not found in this content bundle" "select * from public.qry_character_bundle_capabilities_v1('c6000000-0000-0000-0000-000000000001','query-global-only');"

stable=$("${psql_base[@]}" -At -F '|' -c "select proname,provolatile from pg_proc where oid in ('public.qry_character_bundle_catalog_v1(uuid)'::regprocedure,'public.qry_character_bundle_capabilities_v1(uuid,text)'::regprocedure) order by proname;")
expected_stable=$'qry_character_bundle_capabilities_v1|s\nqry_character_bundle_catalog_v1|s'
[[ "$stable" == "$expected_stable" ]] || { echo "$stable" >&2; fail "bundle projection functions are not STABLE"; }
pass "bundle projection functions are declared STABLE"

public_catalog=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_character_bundle_catalog_v1(uuid)','EXECUTE') then '1' else '0' end;")
public_caps=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_character_bundle_capabilities_v1(uuid,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_catalog" == '0' && "$public_caps" == '0' ]] || fail "bundle projection unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "bundle projection remains API-mediated and public table catalog remains 60"

echo "Character bundle catalog/capability projection tests passed"