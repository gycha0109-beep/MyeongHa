#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

"${psql_base[@]}" <<'SQL'
insert into public.saju_domain_runtime(
  saju_domain,availability,capability_version,required_engine_version,updated_at
) values
  ('career','available','runtime-query-career-v1','saju-engine-career-v1',clock_timestamp()),
  ('business','partial','runtime-query-business-v1',null,clock_timestamp()),
  ('compatibility','unavailable','runtime-query-compatibility-v1','saju-engine-compatibility-v1',clock_timestamp())
on conflict (saju_domain) do update
set availability = excluded.availability,
    capability_version = excluded.capability_version,
    required_engine_version = excluded.required_engine_version,
    updated_at = excluded.updated_at;

delete from public.saju_domain_runtime where saju_domain='life_stage';
SQL

career=$("${psql_base[@]}" -At -F '|' -c "select availability,capability_version,required_engine_version from public.qry_saju_domain_runtime_v1() where saju_domain='career';")
[[ "$career" == 'available|runtime-query-career-v1|saju-engine-career-v1' ]] || fail "career runtime projection mismatch: $career"
pass "available domain projects exact operational capability state"

business=$("${psql_base[@]}" -At -F '|' -c "select availability,capability_version,coalesce(required_engine_version,'<null>') from public.qry_saju_domain_runtime_v1() where saju_domain='business';")
[[ "$business" == 'partial|runtime-query-business-v1|<null>' ]] || fail "business runtime projection mismatch: $business"
pass "partial domain preserves nullable engine-version requirement"

compatibility=$("${psql_base[@]}" -At -F '|' -c "select availability,capability_version,required_engine_version from public.qry_saju_domain_runtime_v1() where saju_domain='compatibility';")
[[ "$compatibility" == 'unavailable|runtime-query-compatibility-v1|saju-engine-compatibility-v1' ]] || fail "compatibility runtime projection mismatch: $compatibility"
pass "unavailable domain is reported as operational state without semantic fallback"

missing_runtime=$("${psql_base[@]}" -Atc "select count(*) from public.qry_saju_domain_runtime_v1() where saju_domain='life_stage';")
[[ "$missing_runtime" == '0' ]] || fail "runtime query synthesized a row for an unconfigured domain"
registry_exists=$("${psql_base[@]}" -Atc "select count(*) from public.saju_domains where saju_domain='life_stage';")
[[ "$registry_exists" == '1' ]] || fail "life_stage stable domain fixture missing"
pass "stable domain identity without runtime configuration is not silently mapped to unavailable"

shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_saju_domain_runtime_v1() q where saju_domain='career';")
for required in saju_domain availability capability_version required_engine_version updated_at; do
  [[ "$shape" == *"\"$required\""* ]] || fail "runtime projection omitted $required: $shape"
done
for forbidden in artifact_ref manifest_jsonb relation_payload_jsonb semantic_claims_jsonb; do
  [[ "$shape" != *"$forbidden"* ]] || fail "runtime projection leaked unrelated authority field $forbidden: $shape"
done
pass "runtime projection is bounded to operational Saju capability fields"

before=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(saju_domain||'|'||availability||'|'||capability_version||'|'||coalesce(required_engine_version,'')||'|'||updated_at::text, E'\n' order by saju_domain),'')) from public.saju_domain_runtime;")
"${psql_base[@]}" -Atc "select count(*) from public.qry_saju_domain_runtime_v1();" >/dev/null
after=$("${psql_base[@]}" -Atc "select md5(coalesce(string_agg(saju_domain||'|'||availability||'|'||capability_version||'|'||coalesce(required_engine_version,'')||'|'||updated_at::text, E'\n' order by saju_domain),'')) from public.saju_domain_runtime;")
[[ "$before" == "$after" ]] || fail "runtime read mutated operational state"
pass "runtime projection is read-only"

"${psql_base[@]}" -c "update public.saju_domain_runtime set availability='available',capability_version='runtime-query-business-v2',updated_at=clock_timestamp() where saju_domain='business';" >/dev/null
updated=$("${psql_base[@]}" -At -F '|' -c "select availability,capability_version from public.qry_saju_domain_runtime_v1() where saju_domain='business';")
[[ "$updated" == 'available|runtime-query-business-v2' ]] || fail "runtime projection did not reflect current authority: $updated"
pass "projection reflects current operational runtime authority without caching a parallel state"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_saju_domain_runtime_v1()','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "Saju runtime query unexpectedly executable directly by PUBLIC database role"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '59' ]] || fail "public table catalog changed"
pass "Saju runtime read remains API-mediated and public table catalog remains 59"

echo "Saju domain runtime query tests passed"
