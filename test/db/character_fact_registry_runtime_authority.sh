#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

query() { "\${psql_base[@]}" -Atc "$1"; }

expect_failure_stdin() {
  local expected="$1"
  local tmp
  tmp="$(mktemp)"
  if "\${psql_base[@]}" >"$tmp" 2>&1; then
    cat "$tmp" >&2
    rm -f "$tmp"
    fail "expected SQL failure containing: $expected"
  fi
  if ! grep -Fq "$expected" "$tmp"; then
    cat "$tmp" >&2
    rm -f "$tmp"
    fail "SQL failed for an unexpected reason; wanted: $expected"
  fi
  rm -f "$tmp"
}

[[ "$(query "select has_function_privilege('myeongha_content_operator','public.cmd_publish_character_fact_registry_v1(uuid,jsonb)','EXECUTE')::int;")" == '1' ]] || fail "operator lacks publication command"
[[ "$(query "select has_function_privilege('myeongha_api_executor','public.qry_character_fact_registry_v1(uuid,text,text)','EXECUTE')::int;")" == '1' ]] || fail "API executor lacks read function"
[[ "$(query "select has_table_privilege('myeongha_api_executor','public.character_fact_registry','SELECT')::int;")" == '0' ]] || fail "API executor can bypass read function"
[[ "$(query "select has_table_privilege('myeongha_content_operator','public.character_fact_registry','INSERT')::int;")" == '0' ]] || fail "operator can bypass publication command"
pass "registry authority is function-bounded"

"\${psql_base[@]}" -At <<'SQL' >/tmp/character-fact-bundle.out
set role myeongha_content_operator;
select public.cmd_publish_character_content_bundle_v1(
  '13060000-0000-0000-0000-000000000001'::uuid,
  'character-fact-registry-test-v1',
  'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'private://character-fact-registry/test-v1',
  'character-artifact-v1',
  'client-cap-v1',
  'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cue-v1',
  '{"schema":"character-bundle-v1","source":"character-fact-registry-test"}'::jsonb,
  '[{"character_id":"fact-seyeon","availability":"available","enabled":true,"release_at":null,"retire_at":null}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb
);
reset role;
SQL

bundle_id="$(tail -n1 /tmp/character-fact-bundle.out)"
rm -f /tmp/character-fact-bundle.out
[[ "$bundle_id" == '13060000-0000-0000-0000-000000000001' ]] || fail "bundle publication failed"

publish_registry() {
  "\${psql_base[@]}" -At <<'SQL' | tail -n1
set role myeongha_content_operator;
select public.cmd_publish_character_fact_registry_v1(
  '13060000-0000-0000-0000-000000000001'::uuid,
  '[
    {"characterId":"fact-seyeon","factKey":"identity.name","sourceAuthority":"CANON","characterKnowledge":"KNOWN","disclosureDefault":"PUBLIC","sourceSection":"B1","sourceBibleDocument":"SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md","sourceBibleRevision":"test-revision","value":"세연","closureNote":"채택"},
    {"characterId":"fact-seyeon","factKey":"principle_calling.binding","sourceAuthority":"WORLD_DEPENDENT","characterKnowledge":"NOT_APPLICABLE","disclosureDefault":"NOT_APPLICABLE","sourceSection":"World/Principle-Calling","sourceBibleDocument":"SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md","sourceBibleRevision":"test-revision","closureNote":"미정 유지"}
  ]'::jsonb
);
reset role;
SQL
}

first="$(publish_registry)"
retry="$(publish_registry)"
[[ "$first" == "$bundle_id" && "$retry" == "$bundle_id" ]] || fail "registry publication is not idempotent"
[[ "$(query "select count(*) from public.character_fact_registry where content_bundle_id='$bundle_id';")" == '2' ]] || fail "registry rows were not persisted"
[[ "$(query "select has_value::int from public.character_fact_registry where content_bundle_id='$bundle_id' and fact_key='identity.name';")" == '1' ]] || fail "resolved fact did not preserve value"
[[ "$(query "select has_value::int||'|'||(value_jsonb is null)::int from public.character_fact_registry where content_bundle_id='$bundle_id' and fact_key='principle_calling.binding';")" == '0|1' ]] || fail "World-dependent fact gained a value"
pass "resolved and World-dependent facts preserve source authority"

expect_failure_stdin "different immutable payload" <<'SQL'
set role myeongha_content_operator;
select public.cmd_publish_character_fact_registry_v1(
  '13060000-0000-0000-0000-000000000001'::uuid,
  '[{"characterId":"fact-seyeon","factKey":"identity.name","sourceAuthority":"CANON","characterKnowledge":"KNOWN","disclosureDefault":"PUBLIC","sourceSection":"B1","sourceBibleDocument":"SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md","sourceBibleRevision":"changed","value":"세연"}]'::jsonb
);
SQL

expect_failure_stdin "published Character fact registry rows are immutable" <<'SQL'
update public.character_fact_registry
set closure_note = 'tampered'
where content_bundle_id = '13060000-0000-0000-0000-000000000001'
  and fact_key = 'identity.name';
SQL
pass "published registry cannot be changed"

"\${psql_base[@]}" -At <<'SQL' >/dev/null
set role myeongha_content_operator;
select public.cmd_create_content_release_v1(
  '13061000-0000-0000-0000-000000000001'::uuid,
  'character-fact-registry-release-v1',
  '13060000-0000-0000-0000-000000000001'::uuid,
  '{"cohort":"default"}'::jsonb,
  'rollout-v1',
  'fact-registry-seed'
);
select public.cmd_activate_content_release_v1(
  '13061000-0000-0000-0000-000000000001'::uuid,
  true
);
reset role;
SQL

read_shape="$("\${psql_base[@]}" -At <<'SQL' | tail -n1
set role myeongha_api_executor;
select
  release_id::text||'|'||character_id||'|'||fact_key||'|'||
  source_authority||'|'||character_knowledge||'|'||disclosure_default||'|'||
  has_value::int||'|'||trim(both '"' from value_jsonb::text)
from public.qry_character_fact_registry_v1(
  '13061000-0000-0000-0000-000000000001'::uuid,
  'fact-seyeon',
  'identity.name'
);
reset role;
SQL
)"
[[ "$read_shape" == '13061000-0000-0000-0000-000000000001|fact-seyeon|identity.name|CANON|KNOWN|PUBLIC|1|세연' ]] || fail "release-pinned read mismatch: $read_shape"

unresolved_shape="$("\${psql_base[@]}" -At <<'SQL' | tail -n1
set role myeongha_api_executor;
select source_authority||'|'||has_value::int||'|'||(value_jsonb is null)::int
from public.qry_character_fact_registry_v1(
  '13061000-0000-0000-0000-000000000001'::uuid,
  'fact-seyeon',
  'principle_calling.binding'
);
reset role;
SQL
)"
[[ "$unresolved_shape" == 'WORLD_DEPENDENT|0|1' ]] || fail "Principle/Calling gap was not preserved: $unresolved_shape"
pass "release-pinned read preserves unresolved Principle/Calling"

expect_failure_stdin "cannot be added after bundle activation" <<'SQL'
set role myeongha_content_operator;
select public.cmd_publish_character_fact_registry_v1(
  '13060000-0000-0000-0000-000000000001'::uuid,
  '[{"characterId":"fact-seyeon","factKey":"identity.name","sourceAuthority":"CANON","characterKnowledge":"KNOWN","disclosureDefault":"PUBLIC","sourceSection":"B1","sourceBibleDocument":"SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md","sourceBibleRevision":"test-revision","value":"세연","closureNote":"채택"}]'::jsonb
);
SQL
pass "activated bundle fact authority cannot be republished"

echo "Character fact registry runtime authority tests passed"
