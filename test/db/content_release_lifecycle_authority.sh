#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

query() {
  "${psql_base[@]}" -Atc "$1"
}

expect_failure_stdin() {
  local expected="$1"
  local tmp
  tmp="$(mktemp)"
  if "${psql_base[@]}" >"$tmp" 2>&1; then
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

# Publication/operator roles are capabilities, never ordinary API principals.
role_shape="$(query "select rolcanlogin::int||'|'||rolsuper::int||'|'||rolinherit::int||'|'||rolbypassrls::int from pg_roles where rolname='myeongha_content_operator';")"
[[ "$role_shape" == '0|0|0|0' ]] || fail "content operator role shape mismatch: $role_shape"

postgres_owner_membership="$(query "select pg_has_role('postgres','myeongha_content_publication_owner','MEMBER')::int;")"
[[ "$postgres_owner_membership" == '1' ]] || fail "postgres cannot assume content publication owner during migration deployment"
pass "postgres deployment principal can assume content publication owner"

owner_schema_create="$(query "select has_schema_privilege('myeongha_content_publication_owner','public','CREATE')::int;")"
[[ "$owner_schema_create" == '0' ]] || fail "content publication owner retained public schema CREATE after deployment"
pass "content publication owner does not retain public schema CREATE"

migration_file="supabase/migrations/0980_content_release_lifecycle_authority.sql"
grant_create_line="$(grep -nF 'grant create on schema public to myeongha_content_publication_owner;' "$migration_file" | cut -d: -f1)"
revoke_create_line="$(grep -nF 'revoke create on schema public from myeongha_content_publication_owner;' "$migration_file" | cut -d: -f1)"
mapfile -t owner_lines < <(grep -nF 'owner to myeongha_content_publication_owner;' "$migration_file" | cut -d: -f1)
[[ -n "$grant_create_line" && -n "$revoke_create_line" ]] || fail "deployment-scoped schema CREATE grant/revoke is missing"
[[ "${#owner_lines[@]}" == '5' ]] || fail "expected five content publication owner reassignments, got ${#owner_lines[@]}"
[[ "$grant_create_line" -lt "${owner_lines[0]}" && "${owner_lines[4]}" -lt "$revoke_create_line" ]] || fail "schema CREATE grant/revoke does not bracket all owner reassignments"
pass "schema CREATE authority is scoped strictly around owner reassignment"

for fn in \
  "public.cmd_publish_character_content_bundle_v1(uuid,text,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb)" \
  "public.cmd_create_content_release_v1(uuid,text,uuid,jsonb,text,text)" \
  "public.cmd_activate_content_release_v1(uuid,boolean)" \
  "public.cmd_retire_content_release_v1(uuid)" \
  "public.cmd_retire_content_bundle_v1(uuid)"
do
  operator_exec="$(query "select has_function_privilege('myeongha_content_operator','$fn','EXECUTE')::int;")"
  runtime_exec="$(query "select has_function_privilege('myeongha_runtime','$fn','EXECUTE')::int;")"
  service_exec="$(query "select has_function_privilege('service_role','$fn','EXECUTE')::int;")"
  public_exec="$(query "select has_function_privilege('public','$fn','EXECUTE')::int;")"
  [[ "$operator_exec" == '1' ]] || fail "operator lacks EXECUTE on $fn"
  [[ "$runtime_exec" == '0' ]] || fail "ordinary runtime inherited content publication authority on $fn"
  [[ "$service_exec" == '0' ]] || fail "service_role inherited content publication authority on $fn"
  [[ "$public_exec" == '0' ]] || fail "PUBLIC inherited content publication authority on $fn"
done

operator_table_insert="$(query "select has_table_privilege('myeongha_content_operator','public.content_bundles','INSERT')::int;")"
owner_thread_update="$(query "select has_table_privilege('myeongha_content_publication_owner','public.conversation_threads','UPDATE')::int;")"
runtime_membership="$(query "select pg_has_role('myeongha_runtime','myeongha_content_operator','MEMBER')::int;")"
[[ "$operator_table_insert" == '0' ]] || fail "operator can bypass commands with direct content_bundles INSERT"
[[ "$owner_thread_update" == '0' ]] || fail "publication owner can mutate pinned conversation threads"
[[ "$runtime_membership" == '0' ]] || fail "ordinary runtime is a member of content operator capability"
pass "publication capability is isolated from ordinary runtime and direct table writes"

"${psql_base[@]}" <<'SQL'
insert into public.saju_domains(saju_domain, created_at, retired_at)
values ('src27_core', clock_timestamp(), null)
on conflict (saju_domain) do nothing;
SQL

publish_one() {
  "${psql_base[@]}" -At <<'SQL' | tail -n1
set role myeongha_content_operator;
select public.cmd_publish_character_content_bundle_v1(
  '98000000-0000-0000-0000-000000000001'::uuid,
  'src27-character-bundle-v1',
  'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'private://src27/character-bundle-v1',
  'character-artifact-v1',
  'client-cap-v1',
  'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cue-v1',
  '{"schema":"character-bundle-v1","source":"src27-test"}'::jsonb,
  '[
    {"character_id":"src27-alpha","availability":"available","enabled":true,"release_at":null,"retire_at":null},
    {"character_id":"src27-beta","availability":"unlockable","enabled":true,"release_at":null,"retire_at":null}
  ]'::jsonb,
  '[
    {"id":"98010000-0000-0000-0000-000000000001","character_id":"src27-alpha","saju_domain":"src27_core","role":"primary","can_initiate":true,"capability_version":"cap-v1"},
    {"id":"98010000-0000-0000-0000-000000000002","character_id":"src27-beta","saju_domain":"src27_core","role":"secondary","can_initiate":false,"capability_version":"cap-v1"}
  ]'::jsonb,
  '[
    {"id":"98020000-0000-0000-0000-000000000001","from_character_id":"src27-alpha","to_character_id":"src27-beta","relation_key":"peer","relation_payload_jsonb":{"weight":1}}
  ]'::jsonb
);
reset role;
SQL
}

bundle_one="$(publish_one)"
[[ "$bundle_one" == '98000000-0000-0000-0000-000000000001' ]] || fail "first bundle publication returned unexpected id: $bundle_one"
bundle_one_retry="$(publish_one)"
[[ "$bundle_one_retry" == "$bundle_one" ]] || fail "exact bundle publication retry did not converge"
[[ "$(query "select count(*) from public.character_runtime_catalog where content_bundle_id='98000000-0000-0000-0000-000000000001';")" == '2' ]] || fail "bundle publication did not atomically project Character catalog"
[[ "$(query "select count(*) from public.character_capabilities where content_bundle_id='98000000-0000-0000-0000-000000000001';")" == '2' ]] || fail "bundle publication did not atomically project Character capabilities"
[[ "$(query "select count(*) from public.character_relations where content_bundle_id='98000000-0000-0000-0000-000000000001';")" == '1' ]] || fail "bundle publication did not atomically project Character relations"
pass "bundle publication is atomic and exact retries are idempotent"

expect_failure_stdin "different Character projections" <<'SQL'
set role myeongha_content_operator;
select public.cmd_publish_character_content_bundle_v1(
  '98000000-0000-0000-0000-000000000001'::uuid,
  'src27-character-bundle-v1',
  'sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'private://src27/character-bundle-v1',
  'character-artifact-v1',
  'client-cap-v1',
  'sha256:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cue-v1',
  '{"schema":"character-bundle-v1","source":"src27-test"}'::jsonb,
  '[{"character_id":"src27-alpha","availability":"available","enabled":false,"release_at":null,"retire_at":null}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb
);
SQL
pass "changed retry payload is rejected instead of silently republishing"

expect_failure_stdin "published content bundle metadata is immutable" <<'SQL'
update public.content_bundles
set artifact_ref = 'private://src27/tampered'
where id = '98000000-0000-0000-0000-000000000001';
SQL

expect_failure_stdin "immutable after content bundle publication" <<'SQL'
update public.character_runtime_catalog
set enabled = false
where character_id = 'src27-alpha'
  and content_bundle_id = '98000000-0000-0000-0000-000000000001';
SQL

expect_failure_stdin "immutable after content bundle publication" <<'SQL'
delete from public.character_capabilities
where id = '98010000-0000-0000-0000-000000000001';
SQL
pass "published bundle metadata and Character projections are immutable"

"${psql_base[@]}" -At <<'SQL' >/tmp/src27-bundle-two.out
set role myeongha_content_operator;
select public.cmd_publish_character_content_bundle_v1(
  '98000000-0000-0000-0000-000000000002'::uuid,
  'src27-character-bundle-v2',
  'sha256:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'private://src27/character-bundle-v2',
  'character-artifact-v1',
  'client-cap-v1',
  'sha256:v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'cue-v1',
  '{"schema":"character-bundle-v1","source":"src27-test-v2"}'::jsonb,
  '[{"character_id":"src27-gamma","availability":"available","enabled":true,"release_at":null,"retire_at":null}]'::jsonb,
  '[{"id":"98010000-0000-0000-0000-000000000003","character_id":"src27-gamma","saju_domain":"src27_core","role":"primary","can_initiate":true,"capability_version":"cap-v1"}]'::jsonb,
  '[]'::jsonb
);
reset role;
SQL
[[ "$(tail -n1 /tmp/src27-bundle-two.out)" == '98000000-0000-0000-0000-000000000002' ]] || fail "second bundle publication failed"
rm -f /tmp/src27-bundle-two.out

create_release_one() {
  "${psql_base[@]}" -At <<'SQL' | tail -n1
set role myeongha_content_operator;
select public.cmd_create_content_release_v1(
  '98100000-0000-0000-0000-000000000001'::uuid,
  'src27-release-v1',
  '98000000-0000-0000-0000-000000000001'::uuid,
  '{"cohort":"default"}'::jsonb,
  'rollout-v1',
  'seed-v1'
);
reset role;
SQL
}

release_one="$(create_release_one)"
release_one_retry="$(create_release_one)"
[[ "$release_one" == '98100000-0000-0000-0000-000000000001' ]] || fail "release create returned unexpected id"
[[ "$release_one_retry" == "$release_one" ]] || fail "exact release create retry did not converge"

expect_failure_stdin "different immutable payload" <<'SQL'
set role myeongha_content_operator;
select public.cmd_create_content_release_v1(
  '98100000-0000-0000-0000-000000000001'::uuid,
  'src27-release-v1',
  '98000000-0000-0000-0000-000000000001'::uuid,
  '{"cohort":"changed"}'::jsonb,
  'rollout-v1',
  'seed-v1'
);
SQL

expect_failure_stdin "non-default release cannot activate before an active default exists" <<'SQL'
set role myeongha_content_operator;
select public.cmd_activate_content_release_v1(
  '98100000-0000-0000-0000-000000000001'::uuid,
  false
);
SQL

"${psql_base[@]}" <<'SQL' >/dev/null
set role myeongha_content_operator;
select public.cmd_activate_content_release_v1(
  '98100000-0000-0000-0000-000000000001'::uuid,
  true
);
select public.cmd_activate_content_release_v1(
  '98100000-0000-0000-0000-000000000001'::uuid,
  true
);
reset role;
SQL

release_one_shape="$(query "select status||'|'||is_default::int||'|'||(activated_at is not null)::int from public.content_releases where id='98100000-0000-0000-0000-000000000001';")"
[[ "$release_one_shape" == 'active|1|1' ]] || fail "initial default activation shape mismatch: $release_one_shape"
pass "release create/activate commands are idempotent and enforce an initial default"

"${psql_base[@]}" <<'SQL' >/dev/null
set role myeongha_content_operator;
select public.cmd_create_content_release_v1(
  '98100000-0000-0000-0000-000000000002'::uuid,
  'src27-release-v2',
  '98000000-0000-0000-0000-000000000002'::uuid,
  '{"cohort":"default-v2"}'::jsonb,
  'rollout-v2',
  'seed-v2'
);
select public.cmd_activate_content_release_v1(
  '98100000-0000-0000-0000-000000000002'::uuid,
  true
);
reset role;
SQL

old_default_shape="$(query "select status||'|'||is_default::int from public.content_releases where id='98100000-0000-0000-0000-000000000001';")"
new_default_shape="$(query "select status||'|'||is_default::int from public.content_releases where id='98100000-0000-0000-0000-000000000002';")"
default_count="$(query "select count(*) from public.content_releases where status='active' and is_default;")"
[[ "$old_default_shape" == 'active|0' ]] || fail "default swap mutated former default beyond active/non-default: $old_default_shape"
[[ "$new_default_shape" == 'active|1' ]] || fail "replacement default was not active/default: $new_default_shape"
[[ "$default_count" == '1' ]] || fail "default swap left $default_count active defaults"
pass "default swap keeps former default active and preserves one active default"

expect_failure_stdin "activate a replacement default before retiring the current default release" <<'SQL'
set role myeongha_content_operator;
select public.cmd_retire_content_release_v1(
  '98100000-0000-0000-0000-000000000002'::uuid
);
SQL

expect_failure_stdin "retire all active releases before retiring their content bundle" <<'SQL'
set role myeongha_content_operator;
select public.cmd_retire_content_bundle_v1(
  '98000000-0000-0000-0000-000000000001'::uuid
);
SQL

"${psql_base[@]}" <<'SQL' >/dev/null
set role myeongha_content_operator;
select public.cmd_retire_content_release_v1(
  '98100000-0000-0000-0000-000000000001'::uuid
);
select public.cmd_retire_content_release_v1(
  '98100000-0000-0000-0000-000000000001'::uuid
);
select public.cmd_retire_content_bundle_v1(
  '98000000-0000-0000-0000-000000000001'::uuid
);
select public.cmd_retire_content_bundle_v1(
  '98000000-0000-0000-0000-000000000001'::uuid
);
reset role;
SQL

[[ "$(query "select status||'|'||is_default::int||'|'||(retired_at is not null)::int from public.content_releases where id='98100000-0000-0000-0000-000000000001';")" == 'retired|0|1' ]] || fail "release retirement shape mismatch"
[[ "$(query "select (retired_at is not null)::int from public.content_bundles where id='98000000-0000-0000-0000-000000000001';")" == '1' ]] || fail "bundle retirement did not persist"
pass "release and bundle retirement are idempotent and cannot bypass active references"

expect_failure_stdin "missing or retired" <<'SQL'
set role myeongha_content_operator;
select public.cmd_create_content_release_v1(
  '98100000-0000-0000-0000-000000000099'::uuid,
  'src27-retired-bundle-release',
  '98000000-0000-0000-0000-000000000001'::uuid,
  null,
  'rollout-v1',
  'seed-retired'
);
SQL

expect_failure_stdin "activated release binding and rollout identity are immutable" <<'SQL'
update public.content_releases
set rollout_seed = 'tampered'
where id = '98100000-0000-0000-0000-000000000002';
SQL
pass "retired bundles cannot re-enter release lifecycle and activated rollout identity is immutable"

"${psql_base[@]}" <<'SQL' >/dev/null
set role myeongha_content_operator;
select public.cmd_create_content_release_v1(
  '98100000-0000-0000-0000-000000000003'::uuid,
  'src27-release-v3',
  '98000000-0000-0000-0000-000000000002'::uuid,
  '{"cohort":"candidate-3"}'::jsonb,
  'rollout-v3',
  'seed-v3'
);
select public.cmd_create_content_release_v1(
  '98100000-0000-0000-0000-000000000004'::uuid,
  'src27-release-v4',
  '98000000-0000-0000-0000-000000000002'::uuid,
  '{"cohort":"candidate-4"}'::jsonb,
  'rollout-v4',
  'seed-v4'
);
reset role;
SQL

set +e
"${psql_base[@]}" -c "set role myeongha_content_operator; select public.cmd_activate_content_release_v1('98100000-0000-0000-0000-000000000003'::uuid,true);" >/tmp/src27-concurrent-3.log 2>&1 &
pid3=$!
"${psql_base[@]}" -c "set role myeongha_content_operator; select public.cmd_activate_content_release_v1('98100000-0000-0000-0000-000000000004'::uuid,true);" >/tmp/src27-concurrent-4.log 2>&1 &
pid4=$!
wait "$pid3"; rc3=$?
wait "$pid4"; rc4=$?
set -e

if [[ "$rc3" -ne 0 || "$rc4" -ne 0 ]]; then
  cat /tmp/src27-concurrent-3.log >&2
  cat /tmp/src27-concurrent-4.log >&2
  rm -f /tmp/src27-concurrent-3.log /tmp/src27-concurrent-4.log
  fail "concurrent default activations did not serialize successfully: rc3=$rc3 rc4=$rc4"
fi
rm -f /tmp/src27-concurrent-3.log /tmp/src27-concurrent-4.log

[[ "$(query "select count(*) from public.content_releases where status='active' and is_default;")" == '1' ]] || fail "concurrent activation violated one-active-default invariant"
[[ "$(query "select count(*) from public.content_releases where id in ('98100000-0000-0000-0000-000000000003','98100000-0000-0000-0000-000000000004') and status='active';")" == '2' ]] || fail "concurrent candidates did not both reach active state"
pass "concurrent default transitions serialize and preserve exactly one active default"

active_default="$(query "select release_id::text||'|'||content_bundle_id::text from public.qry_active_default_content_release_v1();")"
case "$active_default" in
  "98100000-0000-0000-0000-000000000003|98000000-0000-0000-0000-000000000002"|"98100000-0000-0000-0000-000000000004|98000000-0000-0000-0000-000000000002")
    ;;
  *)
    fail "active-default read authority disagrees with lifecycle authority: $active_default"
    ;;
esac
pass "existing active-default read authority observes the command-managed release state"

echo "Content release lifecycle authority tests passed"
