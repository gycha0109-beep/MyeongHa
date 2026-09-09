#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -qAt -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

runtime_query() {
  local subject_id="$1"
  local sql="$2"
  "${psql_base[@]}" <<SQL
begin;
set local role myeongha_api_executor;
set local myeongha.subject_id = '${subject_id}';
${sql}
commit;
SQL
}

expect_runtime_fail() {
  local label="$1"
  local subject_id="$2"
  local needle="$3"
  local sql="$4"
  local out rc
  set +e
  out=$(runtime_query "$subject_id" "$sql" 2>&1)
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

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('b1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000003'),
  ('b1000000-0000-0000-0000-000000000004'),
  ('b1000000-0000-0000-0000-000000000005'),
  ('b1000000-0000-0000-0000-000000000006')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('b2000000-0000-0000-0000-000000000001','member','b1000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000002','member','b1000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000003','member','b1000000-0000-0000-0000-000000000003','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000004','member','b1000000-0000-0000-0000-000000000004','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000005','member','b1000000-0000-0000-0000-000000000005','deletion_pending',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000006','member','b1000000-0000-0000-0000-000000000006','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000007','guest',null,'active',null,clock_timestamp(),clock_timestamp());

insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,
  min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,
  published_at,retired_at
) values
  ('b3000000-0000-0000-0000-000000000001','thread-open-a','sha256:thread-open-a','artifact://thread-open-a','v1','web-v1','asset-a','cue-v1','{}'::jsonb,clock_timestamp(),null),
  ('b3000000-0000-0000-0000-000000000002','thread-open-b','sha256:thread-open-b','artifact://thread-open-b','v1','web-v1','asset-b','cue-v1','{}'::jsonb,clock_timestamp(),null);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,
  rollout_policy_version,rollout_seed,activated_at,retired_at,created_at
) values
  ('b4000000-0000-0000-0000-000000000001','thread-open-release-a','b3000000-0000-0000-0000-000000000001','active',true,null,'uniform-default-v1','uniform',clock_timestamp(),null,clock_timestamp()),
  ('b4000000-0000-0000-0000-000000000002','thread-open-release-b','b3000000-0000-0000-0000-000000000002','active',false,null,'uniform-default-v1','uniform',clock_timestamp(),null,clock_timestamp());

insert into public.characters(character_id,created_at,retired_at) values
  ('char-alpha',clock_timestamp(),null),
  ('char-locked',clock_timestamp(),null),
  ('char-retired',clock_timestamp(),clock_timestamp());

insert into public.character_runtime_catalog(
  character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values
  ('char-alpha','b3000000-0000-0000-0000-000000000001','available',true,null,null,clock_timestamp()),
  ('char-alpha','b3000000-0000-0000-0000-000000000002','available',true,null,null,clock_timestamp()),
  ('char-locked','b3000000-0000-0000-0000-000000000002','locked',true,null,null,clock_timestamp()),
  ('char-retired','b3000000-0000-0000-0000-000000000002','available',true,null,null,clock_timestamp());
SQL

created=$(runtime_query 'b2000000-0000-0000-0000-000000000001' "
  select thread_id::text,thread_character_id::text,created,
         active_content_release_id::text,active_content_bundle_id::text,character_id
  from public.cmd_open_member_single_character_thread_v1(
    'b2000000-0000-0000-0000-000000000001','char-alpha',
    'b5000000-0000-0000-0000-000000000001',
    'b6000000-0000-0000-0000-000000000001'
  );")
[[ "$created" == 'b5000000-0000-0000-0000-000000000001|b6000000-0000-0000-0000-000000000001|t|b4000000-0000-0000-0000-000000000001|b3000000-0000-0000-0000-000000000001|char-alpha' ]] || fail "first Member thread create mismatch: $created"
pass "first open creates one active single-Character thread pinned to active default"

reused=$(runtime_query 'b2000000-0000-0000-0000-000000000001' "
  select thread_id::text,thread_character_id::text,created,
         active_content_release_id::text,active_content_bundle_id::text,character_id
  from public.cmd_open_member_single_character_thread_v1(
    'b2000000-0000-0000-0000-000000000001','char-alpha',
    'b5000000-0000-0000-0000-000000000011',
    'b6000000-0000-0000-0000-000000000011'
  );")
[[ "$reused" == 'b5000000-0000-0000-0000-000000000001|b6000000-0000-0000-0000-000000000001|f|b4000000-0000-0000-0000-000000000001|b3000000-0000-0000-0000-000000000001|char-alpha' ]] || fail "existing thread reuse mismatch: $reused"
[[ "$("${psql_base[@]}" -c "select count(*) from public.conversation_threads where subject_id='b2000000-0000-0000-0000-000000000001' and status='active';")" == '1' ]] || fail "retry created duplicate active thread"
pass "repeat open reuses the same logical active thread"

# Promote release B as the new default while keeping A active non-default. Existing
# thread must retain A; a different Member must pin B on first creation.
"${psql_base[@]}" <<'SQL'
update public.content_releases
set is_default = false
where id='b4000000-0000-0000-0000-000000000001';
update public.content_releases
set is_default = true
where id='b4000000-0000-0000-0000-000000000002';
SQL

reused_after_switch=$(runtime_query 'b2000000-0000-0000-0000-000000000001' "
  select thread_id::text,created,active_content_release_id::text,active_content_bundle_id::text
  from public.cmd_open_member_single_character_thread_v1(
    'b2000000-0000-0000-0000-000000000001','char-alpha',
    'b5000000-0000-0000-0000-000000000012',
    'b6000000-0000-0000-0000-000000000012'
  );")
[[ "$reused_after_switch" == 'b5000000-0000-0000-0000-000000000001|f|b4000000-0000-0000-0000-000000000001|b3000000-0000-0000-0000-000000000001' ]] || fail "existing thread was rebound after default switch: $reused_after_switch"
pass "default switch preserves existing thread release/bundle pin"

created_after_switch=$(runtime_query 'b2000000-0000-0000-0000-000000000002' "
  select thread_id::text,created,active_content_release_id::text,active_content_bundle_id::text
  from public.cmd_open_member_single_character_thread_v1(
    'b2000000-0000-0000-0000-000000000002','char-alpha',
    'b5000000-0000-0000-0000-000000000002',
    'b6000000-0000-0000-0000-000000000002'
  );")
[[ "$created_after_switch" == 'b5000000-0000-0000-0000-000000000002|t|b4000000-0000-0000-0000-000000000002|b3000000-0000-0000-0000-000000000002' ]] || fail "new Member did not pin new active default: $created_after_switch"
pass "new thread pins the current active default after default switch"

expect_runtime_fail "locked Character is denied" \
  'b2000000-0000-0000-0000-000000000003' \
  'selected Character is not currently available for Member Chat' "
    select * from public.cmd_open_member_single_character_thread_v1(
      'b2000000-0000-0000-0000-000000000003','char-locked',
      'b5000000-0000-0000-0000-000000000003','b6000000-0000-0000-0000-000000000003'
    );"

expect_runtime_fail "retired Character is denied" \
  'b2000000-0000-0000-0000-000000000003' \
  'selected Character is not currently available for Member Chat' "
    select * from public.cmd_open_member_single_character_thread_v1(
      'b2000000-0000-0000-0000-000000000003','char-retired',
      'b5000000-0000-0000-0000-000000000013','b6000000-0000-0000-0000-000000000013'
    );"

expect_runtime_fail "unknown/unpublished Character is denied" \
  'b2000000-0000-0000-0000-000000000003' \
  'selected Character is not published in the active default content bundle' "
    select * from public.cmd_open_member_single_character_thread_v1(
      'b2000000-0000-0000-0000-000000000003','char-missing',
      'b5000000-0000-0000-0000-000000000014','b6000000-0000-0000-0000-000000000014'
    );"

expect_runtime_fail "Guest cannot use Member thread open authority" \
  'b2000000-0000-0000-0000-000000000007' \
  'Character thread open requires an active canonical Member subject' "
    select * from public.cmd_open_member_single_character_thread_v1(
      'b2000000-0000-0000-0000-000000000007','char-alpha',
      'b5000000-0000-0000-0000-000000000007','b6000000-0000-0000-0000-000000000007'
    );"

expect_runtime_fail "deletion-pending Member cannot create/reuse thread" \
  'b2000000-0000-0000-0000-000000000005' \
  'Character thread open requires an active canonical Member subject' "
    select * from public.cmd_open_member_single_character_thread_v1(
      'b2000000-0000-0000-0000-000000000005','char-alpha',
      'b5000000-0000-0000-0000-000000000005','b6000000-0000-0000-0000-000000000005'
    );"

expect_runtime_fail "forged cross-subject request is denied" \
  'b2000000-0000-0000-0000-000000000003' \
  'subject execution context mismatch' "
    select * from public.cmd_open_member_single_character_thread_v1(
      'b2000000-0000-0000-0000-000000000004','char-alpha',
      'b5000000-0000-0000-0000-000000000015','b6000000-0000-0000-0000-000000000015'
    );"

# Missing active default must fail closed rather than choosing newest/highest/non-default.
"${psql_base[@]}" -c "update public.content_releases set is_default=false where id='b4000000-0000-0000-0000-000000000002';"
expect_runtime_fail "no active default fails closed" \
  'b2000000-0000-0000-0000-000000000003' \
  'exactly one active default content release is required' "
    select * from public.cmd_open_member_single_character_thread_v1(
      'b2000000-0000-0000-0000-000000000003','char-alpha',
      'b5000000-0000-0000-0000-000000000016','b6000000-0000-0000-0000-000000000016'
    );"
"${psql_base[@]}" -c "update public.content_releases set is_default=true where id='b4000000-0000-0000-0000-000000000002';"

# Concurrent opens for the same Member + Character use distinct candidate IDs but
# must converge on exactly one thread. The first transaction intentionally holds
# the subject lock after the function returns so the second request blocks/re-reads.
rm -f /tmp/member-chat-open-1.out /tmp/member-chat-open-2.out /tmp/member-chat-open-1.rc /tmp/member-chat-open-2.rc
(
  set +e
  "${psql_base[@]}" > /tmp/member-chat-open-1.out 2>&1 <<'SQL'
begin;
set local role myeongha_api_executor;
set local myeongha.subject_id = 'b2000000-0000-0000-0000-000000000004';
select thread_id::text,created
from public.cmd_open_member_single_character_thread_v1(
  'b2000000-0000-0000-0000-000000000004','char-alpha',
  'b5000000-0000-0000-0000-000000000041','b6000000-0000-0000-0000-000000000041'
);
select pg_sleep(0.4);
commit;
SQL
  echo $? > /tmp/member-chat-open-1.rc
) & p1=$!
sleep 0.08
(
  set +e
  "${psql_base[@]}" > /tmp/member-chat-open-2.out 2>&1 <<'SQL'
begin;
set local role myeongha_api_executor;
set local myeongha.subject_id = 'b2000000-0000-0000-0000-000000000004';
select thread_id::text,created
from public.cmd_open_member_single_character_thread_v1(
  'b2000000-0000-0000-0000-000000000004','char-alpha',
  'b5000000-0000-0000-0000-000000000042','b6000000-0000-0000-0000-000000000042'
);
commit;
SQL
  echo $? > /tmp/member-chat-open-2.rc
) & p2=$!
wait $p1
wait $p2

rc1=$(cat /tmp/member-chat-open-1.rc)
rc2=$(cat /tmp/member-chat-open-2.rc)
[[ "$rc1" == '0' ]] || { cat /tmp/member-chat-open-1.out >&2; fail "first concurrent thread open failed"; }
[[ "$rc2" == '0' ]] || { cat /tmp/member-chat-open-2.out >&2; fail "second concurrent thread open failed"; }
first_line=$(grep '^b5' /tmp/member-chat-open-1.out | head -n1)
second_line=$(grep '^b5' /tmp/member-chat-open-2.out | head -n1)
[[ "$first_line" == 'b5000000-0000-0000-0000-000000000041|t' ]] || { cat /tmp/member-chat-open-1.out >&2; fail "first concurrent result mismatch"; }
[[ "$second_line" == 'b5000000-0000-0000-0000-000000000041|f' ]] || { cat /tmp/member-chat-open-2.out >&2; fail "second concurrent request did not reuse first thread"; }
[[ "$("${psql_base[@]}" -c "select count(*) from public.conversation_threads ct join public.conversation_thread_characters tc on tc.thread_id=ct.id and tc.character_id='char-alpha' and tc.left_at is null where ct.subject_id='b2000000-0000-0000-0000-000000000004' and ct.thread_type='single_character' and ct.status='active' and ct.deleted_at is null;")" == '1' ]] || fail "concurrent open produced duplicate logical active threads"
pass "concurrent Member + Character open converges on one logical active thread"

# A pre-existing corrupted duplicate state must fail closed rather than pick one.
"${psql_base[@]}" <<'SQL'
insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,
  content_revision,next_sequence_no,created_at,updated_at,deleted_at
) values
  ('b5000000-0000-0000-0000-000000000061','b2000000-0000-0000-0000-000000000006','single_character','active',null,'b4000000-0000-0000-0000-000000000002','b3000000-0000-0000-0000-000000000002',0,1,clock_timestamp(),clock_timestamp(),null),
  ('b5000000-0000-0000-0000-000000000062','b2000000-0000-0000-0000-000000000006','single_character','active',null,'b4000000-0000-0000-0000-000000000002','b3000000-0000-0000-0000-000000000002',0,1,clock_timestamp(),clock_timestamp(),null);
insert into public.conversation_thread_characters(id,thread_id,character_id,content_bundle_id,role,joined_at,left_at) values
  ('b6000000-0000-0000-0000-000000000061','b5000000-0000-0000-0000-000000000061','char-alpha','b3000000-0000-0000-0000-000000000002','primary',clock_timestamp(),null),
  ('b6000000-0000-0000-0000-000000000062','b5000000-0000-0000-0000-000000000062','char-alpha','b3000000-0000-0000-0000-000000000002','primary',clock_timestamp(),null);
SQL
expect_runtime_fail "pre-existing duplicate logical threads fail closed" \
  'b2000000-0000-0000-0000-000000000006' \
  'multiple active single-Character threads already exist for this Member and Character' "
    select * from public.cmd_open_member_single_character_thread_v1(
      'b2000000-0000-0000-0000-000000000006','char-alpha',
      'b5000000-0000-0000-0000-000000000063','b6000000-0000-0000-0000-000000000063'
    );"

# Runtime ACL: executor can call only the wrapper and cannot bypass it with DML.
expect_runtime_fail "API executor direct thread INSERT is denied" \
  'b2000000-0000-0000-0000-000000000003' \
  'permission denied for table conversation_threads' "
    insert into public.conversation_threads(
      id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,
      content_revision,next_sequence_no,created_at,updated_at,deleted_at
    ) values (
      'b5000000-0000-0000-0000-000000000099','b2000000-0000-0000-0000-000000000003',
      'single_character','active',null,'b4000000-0000-0000-0000-000000000002',
      'b3000000-0000-0000-0000-000000000002',0,1,clock_timestamp(),clock_timestamp(),null
    );"

public_exec=$("${psql_base[@]}" -c "select case when has_function_privilege('public','public.cmd_open_member_single_character_thread_v1(uuid,text,uuid,uuid)','EXECUTE') then '1' else '0' end;")
executor_exec=$("${psql_base[@]}" -c "select case when has_function_privilege('myeongha_api_executor','public.cmd_open_member_single_character_thread_v1(uuid,text,uuid,uuid)','EXECUTE') then '1' else '0' end;")
executor_insert=$("${psql_base[@]}" -c "select case when has_table_privilege('myeongha_api_executor','public.conversation_threads','INSERT') then '1' else '0' end;")
owner_flags=$("${psql_base[@]}" -c "select rolcanlogin::int||'|'||rolsuper::int||'|'||rolbypassrls::int from pg_catalog.pg_roles where rolname='myeongha_chat_thread_open_owner';")
[[ "$public_exec" == '0' ]] || fail "thread open command unexpectedly executable by PUBLIC"
[[ "$executor_exec" == '1' ]] || fail "API executor is missing thread open command EXECUTE"
[[ "$executor_insert" == '0' ]] || fail "API executor unexpectedly has direct conversation_threads INSERT"
[[ "$owner_flags" == '0|0|0' ]] || fail "thread open owner role escaped NOLOGIN/NOSUPERUSER/NOBYPASSRLS contract: $owner_flags"
[[ "$("${psql_base[@]}" -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '62' ]] || fail "public table catalog changed"
pass "thread open wrapper preserves command-only least-privilege runtime authority"

echo "Member Character thread open persistence/concurrency tests passed"
