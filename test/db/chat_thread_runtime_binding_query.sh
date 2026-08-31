#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "$out" >&2
    fail "$label unexpectedly succeeded"
  fi
  if [[ "$out" != *"$needle"* ]]; then
    echo "$out" >&2
    fail "$label failed for unexpected reason"
  fi
  pass "$label -> $needle"
}

"${psql_base[@]}" >/dev/null <<'SQL'
insert into auth.users(id) values
  ('77000000-0000-0000-0000-000000000001'),
  ('77000000-0000-0000-0000-000000000002'),
  ('77000000-0000-0000-0000-000000000003')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('77100000-0000-0000-0000-000000000001','member','77000000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-31 20:00:00+00',timestamptz '2026-08-31 20:00:00+00'),
  ('77100000-0000-0000-0000-000000000002','member','77000000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-31 20:01:00+00',timestamptz '2026-08-31 20:01:00+00'),
  ('77100000-0000-0000-0000-000000000003','guest',null,'merged','77100000-0000-0000-0000-000000000001',timestamptz '2026-08-31 20:02:00+00',timestamptz '2026-08-31 20:02:00+00'),
  ('77100000-0000-0000-0000-000000000004','member','77000000-0000-0000-0000-000000000003','deletion_pending',null,timestamptz '2026-08-31 20:03:00+00',timestamptz '2026-08-31 20:03:00+00');

insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
  asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at,retired_at
) values
  (
    '77200000-0000-0000-0000-000000000001','thread-runtime-current-v77',
    'sha256:v1:7700000000000000000000000000000000000000000000000000000000000001',
    'artifact:thread-runtime-current-v77','v1','web-v1',
    'sha256:v1:7700000000000000000000000000000000000000000000000000000000000002',
    'v1','{}'::jsonb,timestamptz '2026-08-31 20:10:00+00',null
  ),
  (
    '77200000-0000-0000-0000-000000000002','thread-runtime-old-v77',
    'sha256:v1:7700000000000000000000000000000000000000000000000000000000000003',
    'artifact:thread-runtime-old-v77','v1','web-v1',
    'sha256:v1:7700000000000000000000000000000000000000000000000000000000000004',
    'v1','{}'::jsonb,timestamptz '2026-08-31 20:09:00+00',null
  );

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,rollout_policy_version,
  rollout_seed,activated_at,retired_at,created_at
) values
  (
    '77300000-0000-0000-0000-000000000001','thread-runtime-current-release-v77',
    '77200000-0000-0000-0000-000000000001','active',false,null,'v1','fixture-current-v77',
    timestamptz '2026-08-31 20:11:00+00',null,timestamptz '2026-08-31 20:10:00+00'
  ),
  (
    '77300000-0000-0000-0000-000000000002','thread-runtime-old-release-v77',
    '77200000-0000-0000-0000-000000000002','retired',false,null,'v1','fixture-old-v77',
    timestamptz '2026-08-31 20:09:30+00',timestamptz '2026-08-31 20:10:30+00',timestamptz '2026-08-31 20:09:00+00'
  );

insert into public.characters(character_id,created_at,retired_at) values
  ('char-z-primary-77',timestamptz '2026-08-31 20:00:00+00',null),
  ('char-a-participant-77',timestamptz '2026-08-31 20:00:00+00',null),
  ('char-left-77',timestamptz '2026-08-31 20:00:00+00',null),
  ('char-old-bundle-77',timestamptz '2026-08-31 20:00:00+00',null);

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values
  ('char-z-primary-77','77200000-0000-0000-0000-000000000001','available',true,null,null,timestamptz '2026-08-31 20:10:00+00'),
  ('char-a-participant-77','77200000-0000-0000-0000-000000000001','available',true,null,null,timestamptz '2026-08-31 20:10:00+00'),
  ('char-left-77','77200000-0000-0000-0000-000000000001','available',true,null,null,timestamptz '2026-08-31 20:10:00+00'),
  ('char-old-bundle-77','77200000-0000-0000-0000-000000000002','available',true,null,null,timestamptz '2026-08-31 20:09:00+00');

insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,
  content_revision,next_sequence_no,created_at,updated_at,deleted_at
) values
  ('77400000-0000-0000-0000-000000000001','77100000-0000-0000-0000-000000000001','multi_character','active','valid runtime thread','77300000-0000-0000-0000-000000000001','77200000-0000-0000-0000-000000000001',7,1,timestamptz '2026-08-31 20:20:00+00',timestamptz '2026-08-31 20:20:00+00',null),
  ('77400000-0000-0000-0000-000000000002','77100000-0000-0000-0000-000000000001','single_character','archived','archived runtime thread','77300000-0000-0000-0000-000000000001','77200000-0000-0000-0000-000000000001',0,1,timestamptz '2026-08-31 20:21:00+00',timestamptz '2026-08-31 20:21:00+00',null),
  ('77400000-0000-0000-0000-000000000003','77100000-0000-0000-0000-000000000001','single_character','deleted','deleted runtime thread','77300000-0000-0000-0000-000000000001','77200000-0000-0000-0000-000000000001',0,1,timestamptz '2026-08-31 20:22:00+00',timestamptz '2026-08-31 20:22:00+00',timestamptz '2026-08-31 20:22:00+00'),
  ('77400000-0000-0000-0000-000000000004','77100000-0000-0000-0000-000000000002','single_character','active','other owner runtime thread','77300000-0000-0000-0000-000000000001','77200000-0000-0000-0000-000000000001',0,1,timestamptz '2026-08-31 20:23:00+00',timestamptz '2026-08-31 20:23:00+00',null),
  ('77400000-0000-0000-0000-000000000005','77100000-0000-0000-0000-000000000001','single_character','active','unbound runtime thread',null,null,0,1,timestamptz '2026-08-31 20:24:00+00',timestamptz '2026-08-31 20:24:00+00',null),
  ('77400000-0000-0000-0000-000000000006','77100000-0000-0000-0000-000000000001','system','active','system runtime thread','77300000-0000-0000-0000-000000000001','77200000-0000-0000-0000-000000000001',0,1,timestamptz '2026-08-31 20:25:00+00',timestamptz '2026-08-31 20:25:00+00',null),
  ('77400000-0000-0000-0000-000000000007','77100000-0000-0000-0000-000000000001','single_character','active','no participant runtime thread','77300000-0000-0000-0000-000000000001','77200000-0000-0000-0000-000000000001',0,1,timestamptz '2026-08-31 20:26:00+00',timestamptz '2026-08-31 20:26:00+00',null),
  ('77400000-0000-0000-0000-000000000008','77100000-0000-0000-0000-000000000003','single_character','active','merged subject runtime thread','77300000-0000-0000-0000-000000000001','77200000-0000-0000-0000-000000000001',0,1,timestamptz '2026-08-31 20:27:00+00',timestamptz '2026-08-31 20:27:00+00',null),
  ('77400000-0000-0000-0000-000000000009','77100000-0000-0000-0000-000000000004','single_character','active','deletion pending runtime thread','77300000-0000-0000-0000-000000000001','77200000-0000-0000-0000-000000000001',0,1,timestamptz '2026-08-31 20:28:00+00',timestamptz '2026-08-31 20:28:00+00',null);

insert into public.conversation_thread_characters(
  id,thread_id,character_id,content_bundle_id,role,joined_at,left_at
) values
  ('77500000-0000-0000-0000-000000000001','77400000-0000-0000-0000-000000000001','char-z-primary-77','77200000-0000-0000-0000-000000000001','primary',timestamptz '2026-08-31 20:20:00+00',null),
  ('77500000-0000-0000-0000-000000000002','77400000-0000-0000-0000-000000000001','char-a-participant-77','77200000-0000-0000-0000-000000000001','participant',timestamptz '2026-08-31 20:20:00+00',null),
  ('77500000-0000-0000-0000-000000000003','77400000-0000-0000-0000-000000000001','char-left-77','77200000-0000-0000-0000-000000000001','participant',timestamptz '2026-08-31 20:20:00+00',timestamptz '2026-08-31 20:21:00+00'),
  ('77500000-0000-0000-0000-000000000004','77400000-0000-0000-0000-000000000001','char-old-bundle-77','77200000-0000-0000-0000-000000000002','participant',timestamptz '2026-08-31 20:19:00+00',null),
  ('77500000-0000-0000-0000-000000000005','77400000-0000-0000-0000-000000000004','char-z-primary-77','77200000-0000-0000-0000-000000000001','primary',timestamptz '2026-08-31 20:23:00+00',null);
SQL

binding=$("${psql_base[@]}" -At -F '|' -c "
  select thread_id,status,active_content_release_id,active_content_bundle_id,content_revision,participant_character_ids
  from public.qry_chat_thread_runtime_binding_v1(
    '77100000-0000-0000-0000-000000000001',
    '77400000-0000-0000-0000-000000000001'
  );
")
expected='77400000-0000-0000-0000-000000000001|active|77300000-0000-0000-0000-000000000001|77200000-0000-0000-0000-000000000001|7|{char-z-primary-77,char-a-participant-77}'
[[ "$binding" == "$expected" ]] || { echo "$binding" >&2; fail "runtime binding projection mismatch"; }
pass "runtime binding returns exact thread-pinned release/bundle/revision and deterministic current participants"

[[ "$binding" != *'char-left-77'* ]] || fail "left participant leaked into runtime binding"
[[ "$binding" != *'char-old-bundle-77'* ]] || fail "old-bundle participant leaked into runtime binding"
pass "left and old-bundle participants are excluded"

expect_fail "null subject" "chat thread runtime binding requires subject and thread identities" \
  "select * from public.qry_chat_thread_runtime_binding_v1(null,'77400000-0000-0000-0000-000000000001');"
expect_fail "null thread" "chat thread runtime binding requires subject and thread identities" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000001',null);"
expect_fail "other owner" "active chat thread runtime binding is unavailable for this subject" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000001','77400000-0000-0000-0000-000000000004');"
expect_fail "archived thread" "active chat thread runtime binding is unavailable for this subject" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000001','77400000-0000-0000-0000-000000000002');"
expect_fail "deleted thread" "active chat thread runtime binding is unavailable for this subject" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000001','77400000-0000-0000-0000-000000000003');"
expect_fail "unbound thread" "active chat thread runtime binding is unavailable for this subject" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000001','77400000-0000-0000-0000-000000000005');"
expect_fail "system thread" "active chat thread runtime binding is unavailable for this subject" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000001','77400000-0000-0000-0000-000000000006');"
expect_fail "no current participants" "active chat thread has no participants in its active content bundle" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000001','77400000-0000-0000-0000-000000000007');"
expect_fail "merged subject" "subject is not eligible for chat thread runtime binding" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000003','77400000-0000-0000-0000-000000000008');"
expect_fail "deletion pending subject" "subject is not eligible for chat thread runtime binding" \
  "select * from public.qry_chat_thread_runtime_binding_v1('77100000-0000-0000-0000-000000000004','77400000-0000-0000-0000-000000000009');"

security_definer=$("${psql_base[@]}" -At -c "
  select prosecdef
  from pg_proc
  where oid = 'public.qry_chat_thread_runtime_binding_v1(uuid,uuid)'::regprocedure;
")
[[ "$security_definer" == "f" ]] || fail "runtime binding query must remain SECURITY INVOKER"
pass "runtime binding query remains SECURITY INVOKER"

public_execute=$("${psql_base[@]}" -At -c "
  select has_function_privilege(
    'public',
    'public.qry_chat_thread_runtime_binding_v1(uuid,uuid)',
    'EXECUTE'
  );
")
[[ "$public_execute" == "f" ]] || fail "PUBLIC must not have EXECUTE on runtime binding query"
pass "PUBLIC EXECUTE remains revoked"

echo "PASS chat thread runtime binding query"
