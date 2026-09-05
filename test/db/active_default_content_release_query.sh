#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

initial_count=$("${psql_base[@]}" -Atc "select count(*) from public.qry_active_default_content_release_v1();")
[[ "$initial_count" == '0' ]] || fail "clean database unexpectedly has an active default release: $initial_count"
pass "empty operational release set returns no synthetic default"

"${psql_base[@]}" <<'SQL'
insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
  asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at,retired_at
) values
  ('c6400000-0000-0000-0000-000000000001','release-query-v1','sha256:v1:release-query-v1','private://release-query-v1','artifact-v1','client-cap-v1','sha256:v1:assets-release-query-v1','cue-v1','{}'::jsonb,'2026-05-01T00:00:00Z',null),
  ('c6400000-0000-0000-0000-000000000002','release-query-v2','sha256:v1:release-query-v2','private://release-query-v2','artifact-v1','client-cap-v2','sha256:v1:assets-release-query-v2','cue-v2','{}'::jsonb,'2026-05-02T00:00:00Z',null),
  ('c6400000-0000-0000-0000-000000000003','release-query-retired-v1','sha256:v1:release-query-retired-v1','private://release-query-retired-v1','artifact-v1','client-cap-v1','sha256:v1:assets-release-query-retired-v1','cue-v1','{}'::jsonb,'2025-05-01T00:00:00Z','2026-01-01T00:00:00Z');

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,rollout_policy_version,rollout_seed,activated_at,retired_at,created_at
) values
  ('c6410000-0000-0000-0000-000000000001','release-query-active-cohort','c6400000-0000-0000-0000-000000000001','active',false,'{"cohort":"beta"}'::jsonb,'rollout-v7','private-seed-beta','2026-05-03T00:00:00Z',null,'2026-05-01T00:00:00Z'),
  ('c6410000-0000-0000-0000-000000000002','release-query-default','c6400000-0000-0000-0000-000000000002','active',true,'{"cohort":"default"}'::jsonb,'rollout-v8','private-seed-default','2026-05-04T00:00:00Z',null,'2026-05-02T00:00:00Z'),
  ('c6410000-0000-0000-0000-000000000003','release-query-retired','c6400000-0000-0000-0000-000000000003','retired',false,'{"cohort":"old"}'::jsonb,'rollout-v6','private-seed-old','2025-05-03T00:00:00Z','2026-01-01T00:00:00Z','2025-05-01T00:00:00Z'),
  ('c6410000-0000-0000-0000-000000000004','release-query-draft-default-flag','c6400000-0000-0000-0000-000000000001','draft',true,null,'rollout-v9','private-seed-draft',null,null,'2026-05-05T00:00:00Z');
SQL

row=$("${psql_base[@]}" -At -F '|' -c "select release_id,release_key,content_bundle_id,activated_at from public.qry_active_default_content_release_v1();")
expected='c6410000-0000-0000-0000-000000000002|release-query-default|c6400000-0000-0000-0000-000000000002|2026-05-04 00:00:00+00'
[[ "$row" == "$expected" ]] || { echo "$row" >&2; fail "active default content release projection mismatch"; }
pass "projection returns only the recorded active default release binding"

shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_active_default_content_release_v1() q;")
for required in release_id release_key content_bundle_id activated_at; do
  [[ "$shape" == *"\"$required\""* ]] || fail "active default release projection omitted $required: $shape"
done
for forbidden in rollout_jsonb rollout_policy_version rollout_seed subject_id status is_default min_client_capability asset_manifest_hash cue_schema_version artifact_ref manifest_jsonb; do
  [[ "$shape" != *"\"$forbidden\""* ]] || fail "active default release projection leaked unrelated authority field $forbidden: $shape"
done
pass "projection excludes rollout resolver and client compatibility authority"

before=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(id::text||'|'||release_key||'|'||status||'|'||is_default::text, E'\n' order by id),'')) from public.content_releases;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_active_default_content_release_v1();" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(id::text||'|'||release_key||'|'||status||'|'||is_default::text, E'\n' order by id),'')) from public.content_releases;")
[[ "$before" == "$after" ]] || fail "active default release read mutated operational release state"
pass "active default release projection is read-only"

stable=$("${psql_base[@]}" -Atc "select provolatile from pg_proc where oid='public.qry_active_default_content_release_v1()'::regprocedure;")
[[ "$stable" == 's' ]] || fail "active default release projection is not STABLE: $stable"
pass "active default release projection function is declared STABLE"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_active_default_content_release_v1()','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "active default release projection unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "active default release projection remains API-mediated and public table catalog remains 60"

echo "Active default content release projection tests passed"
