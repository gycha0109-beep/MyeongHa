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
  ('c7100000-0000-0000-0000-000000000001','cap-runtime-v1','sha256:v1:cap-runtime-v1','artifact://cap-runtime-v1','v1','client-v1','sha256:v1:assets-cap-runtime-v1','cue-v1','{}'::jsonb,'2026-01-01T00:00:00Z',null),
  ('c7100000-0000-0000-0000-000000000002','cap-runtime-retired-v1','sha256:v1:cap-runtime-retired-v1','artifact://cap-runtime-retired-v1','v1','client-v1','sha256:v1:assets-cap-runtime-retired-v1','cue-v1','{}'::jsonb,'2025-01-01T00:00:00Z','2025-12-31T00:00:00Z');

insert into public.characters(character_id,created_at,retired_at) values
  ('runtime-alpha','2025-01-01T00:00:00Z',null),
  ('runtime-empty','2025-01-01T00:00:00Z',null),
  ('runtime-global-only','2025-01-01T00:00:00Z',null);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values
  ('runtime-alpha','c7100000-0000-0000-0000-000000000001','available',true,'2026-01-02T00:00:00Z',null,'2026-01-01T00:00:00Z'),
  ('runtime-empty','c7100000-0000-0000-0000-000000000001','locked',false,null,null,'2026-01-01T00:00:00Z'),
  ('runtime-alpha','c7100000-0000-0000-0000-000000000002','coming_soon',false,null,'2025-12-31T00:00:00Z','2025-01-01T00:00:00Z');

insert into public.character_capabilities(
  id,content_bundle_id,character_id,saju_domain,role,can_initiate,capability_version
) values
  ('c7110000-0000-0000-0000-000000000001','c7100000-0000-0000-0000-000000000001','runtime-alpha','career','primary',true,'char-career-v1'),
  ('c7110000-0000-0000-0000-000000000002','c7100000-0000-0000-0000-000000000001','runtime-alpha','family','commentary',false,'char-family-v1'),
  ('c7110000-0000-0000-0000-000000000003','c7100000-0000-0000-0000-000000000001','runtime-alpha','relationship','secondary',false,'char-relationship-v1'),
  ('c7110000-0000-0000-0000-000000000004','c7100000-0000-0000-0000-000000000002','runtime-alpha','career','secondary',false,'char-retired-career-v1');

insert into public.saju_domain_runtime(
  saju_domain,availability,capability_version,required_engine_version,updated_at
) values
  ('career','available','runtime-career-v1','engine-career-v1','2026-02-01T00:00:00Z'),
  ('relationship','partial','runtime-relationship-v2',null,'2026-02-02T00:00:00Z');
SQL

rows=$("${psql_base[@]}" -At -F '|' -c "select saju_domain,role,can_initiate,character_capability_version,coalesce(runtime_availability,'<null>'),coalesce(runtime_capability_version,'<null>'),coalesce(required_engine_version,'<null>'),coalesce(runtime_updated_at::text,'<null>') from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000001','runtime-alpha');")
expected=$'career|primary|t|char-career-v1|available|runtime-career-v1|engine-career-v1|2026-02-01 00:00:00+00\nfamily|commentary|f|char-family-v1|<null>|<null>|<null>|<null>\nrelationship|secondary|f|char-relationship-v1|partial|runtime-relationship-v2|<null>|2026-02-02 00:00:00+00'
[[ "$rows" == "$expected" ]] || { echo "$rows" >&2; fail "capability/runtime component projection mismatch"; }
pass "projection joins declared CharacterCapability with current Saju runtime in deterministic domain order"

[[ "$rows" == *'family|commentary|f|char-family-v1|<null>|<null>|<null>|<null>'* ]] || fail "missing runtime row was reinterpreted or dropped"
pass "missing Saju runtime stays explicit NULL rather than becoming an availability decision"

"${psql_base[@]}" -c "update public.saju_domain_runtime set availability='unavailable', capability_version='runtime-career-v2', updated_at='2026-02-03T00:00:00Z' where saju_domain='career';" >/dev/null
changed=$("${psql_base[@]}" -At -F '|' -c "select runtime_availability,runtime_capability_version,runtime_updated_at::text from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000001','runtime-alpha') where saju_domain='career';")
[[ "$changed" == 'unavailable|runtime-career-v2|2026-02-03 00:00:00+00' ]] || fail "current runtime state did not update projection: $changed"
pass "bundle-pinned CharacterCapability remains joined to current operational Saju runtime"

retired=$("${psql_base[@]}" -At -F '|' -c "select saju_domain,role,can_initiate,character_capability_version,runtime_availability from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000002','runtime-alpha');")
[[ "$retired" == 'career|secondary|f|char-retired-career-v1|unavailable' ]] || fail "retired bundle component projection mismatch: $retired"
pass "retired immutable bundle remains readable while runtime fields remain current"

zero=$("${psql_base[@]}" -Atc "select count(*) from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000001','runtime-empty');")
[[ "$zero" == '0' ]] || fail "character with no declared capabilities synthesized rows"
pass "catalog character without CharacterCapability rows stays empty"

shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000001','runtime-alpha') q where saju_domain='career';")
for required in saju_domain role can_initiate character_capability_version runtime_availability runtime_capability_version required_engine_version runtime_updated_at; do
  [[ "$shape" == *"\"$required\""* ]] || fail "projection omitted $required: $shape"
done
for forbidden in content_bundle_id character_id subject_id catalog_enabled unlock_state allowed rejected user_consent world_state product_policy; do
  [[ "$shape" != *"\"$forbidden\""* ]] || fail "projection leaked or invented $forbidden: $shape"
done
pass "projection exposes authority components without claiming final Capability Gate output"

before=$("${psql_base[@]}" -Atc "select md5((select coalesce(string_agg(id::text||'|'||capability_version, E'\n' order by id), '') from public.character_capabilities) || '//' || (select coalesce(string_agg(saju_domain||'|'||availability||'|'||capability_version||'|'||coalesce(required_engine_version,''), E'\n' order by saju_domain), '') from public.saju_domain_runtime));")
"${psql_base[@]}" -Atc "select count(*) from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000001','runtime-alpha');" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5((select coalesce(string_agg(id::text||'|'||capability_version, E'\n' order by id), '') from public.character_capabilities) || '//' || (select coalesce(string_agg(saju_domain||'|'||availability||'|'||capability_version||'|'||coalesce(required_engine_version,''), E'\n' order by saju_domain), '') from public.saju_domain_runtime));")
[[ "$before" == "$after" ]] || fail "component projection mutated source authority rows"
pass "component projection is read-only"

expect_fail "null bundle is denied" "content bundle is required" "select * from public.qry_character_bundle_saju_runtime_components_v1(null,'runtime-alpha');"
expect_fail "blank character is denied" "character id is required" "select * from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000001','   ');"
expect_fail "unknown bundle is denied" "content bundle was not found" "select * from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000099','runtime-alpha');"
expect_fail "character absent from explicit bundle is denied" "character was not found in this content bundle" "select * from public.qry_character_bundle_saju_runtime_components_v1('c7100000-0000-0000-0000-000000000001','runtime-global-only');"

stable=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_character_bundle_saju_runtime_components_v1(uuid,text)'::regprocedure;")
[[ "$stable" == 's' ]] || fail "component projection is not STABLE: $stable"
public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_character_bundle_saju_runtime_components_v1(uuid,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "component projection unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "component projection is STABLE, API-mediated, and public table catalog remains 60"

echo "Character/Saju runtime component projection tests passed"
