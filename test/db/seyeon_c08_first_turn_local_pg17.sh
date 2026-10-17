#!/usr/bin/env bash
set -euo pipefail

# This fixture is allowed ONLY in a disposable local Docker scratch DB or
# the isolated GitHub Actions PG17 case DB created and destroyed by the suite.
if [[ "${PGDATABASE:-}" != myeongha_c08_local_case_1 ]]; then
  [[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true &&
     "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
     "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
    echo HOLD_C08_LOCAL_DISPOSABLE_DB_ONLY >&2; exit 1;
  }
fi
version="$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')"
[[ "$version" =~ ^17[0-9]{4}$ ]] || {
  echo HOLD_C08_LOCAL_REQUIRES_POSTGRES_17 >&2; exit 1;
}
run=(psql -X -qAt -v ON_ERROR_STOP=1)
subject='68100000-0000-0000-0000-000000000001'
thread='68400000-0000-0000-0000-000000000001'
message='68800000-0000-0000-0000-000000000001'
member_auth='68000000-0000-0000-0000-000000000001'
other_subject='68100000-0000-0000-0000-000000000002'
other_auth='68000000-0000-0000-0000-000000000002'
other_thread='68400000-0000-0000-0000-000000000002'

# 0950 grants a deliberately restricted COLUMN-level SELECT, not the full
# relation SELECT privilege. A table-level has_table_privilege(...,'SELECT')
# is therefore false for a healthy runtime and must not be used as admission.
# Every probe below is metadata-only, run as disposable PostgreSQL admin.
role_acl="$("${run[@]}" -F '|' -c "
select
 coalesce((
   select c.relrowsecurity
   from pg_catalog.pg_class c
   where c.oid='public.conversation_messages'::regclass
 ),false),
 exists (
   select 1 from pg_catalog.pg_policies p
   where p.schemaname='public'
     and p.tablename='conversation_messages'
     and p.policyname='conversation_messages_api_current_select_v1'
     and p.cmd='SELECT'
     and 'myeongha_api_executor'=any(p.roles)
     and p.qual like '%current_myeongha_subject_id%'
 ),
 coalesce((
   select not r.rolsuper and not r.rolbypassrls
   from pg_catalog.pg_roles r
   where r.rolname='myeongha_api_executor'
 ),false),
 coalesce((
   select bool_and(pg_catalog.has_column_privilege(
     'myeongha_api_executor','public.conversation_messages',
     required_column, 'SELECT'))
   from unnest(array[
     'id', 'thread_id', 'subject_id', 'sequence_no',
     'sender_type', 'redacted_at'
   ]) required_column
 ),false),
 pg_catalog.has_function_privilege(
   'myeongha_api_executor',
   'public.qry_chat_thread_runtime_binding_v1(uuid,uuid)',
   'EXECUTE'
 ),
 not pg_catalog.has_function_privilege(
   'anon','public.qry_chat_thread_runtime_binding_v1(uuid,uuid)','EXECUTE'
 ),
 not pg_catalog.has_table_privilege(
   'anon','public.conversation_messages','SELECT'
 );
")"
if [[ "$role_acl" != 't|t|t|t|t|t|t' ]]; then
  IFS='|' read -r rls policy non_bypass column_select executor_function     browser_no_execute browser_no_select <<< "$role_acl"
  echo "HOLD_C08_PG17_ROLE_RLS_PRIVILEGE_CONTRACT" >&2
  printf 'C08_ACL_DIAGNOSTIC rls=%s owner_policy=%s non_bypass=%s required_column_select=%s executor_function=%s browser_function_denied=%s browser_table_denied=%s\n'     "$rls" "$policy" "$non_bypass" "$column_select" "$executor_function"     "$browser_no_execute" "$browser_no_select" >&2
  exit 1
fi
echo PASS_C08_PG17_OWNER_RLS_COLUMN_ACL_FUNCTION_AND_BROWSER_DENIAL

"${run[@]}" > /dev/null <<'SQL'
insert into auth.users(id) values
 ('68000000-0000-0000-0000-000000000001'),
 ('68000000-0000-0000-0000-000000000002')
on conflict do nothing;
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
 ('68100000-0000-0000-0000-000000000001','member','68000000-0000-0000-0000-000000000001','active',null,now(),now()),
 ('68100000-0000-0000-0000-000000000002','member','68000000-0000-0000-0000-000000000002','active',null,now(),now());
insert into public.content_bundles(
 id,content_version,content_hash,artifact_ref,artifact_schema_version,min_client_capability,
 asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at,retired_at
) values(
 '68200000-0000-0000-0000-000000000001','c08-fixture-v1',
 'sha256:v1:'||repeat('1',64),
 'artifact:c08-local-fixture','v1','web-v1',
 'sha256:v1:'||repeat('2',64),'v1','{}'::jsonb,now(),null
);
insert into public.content_releases(
 id,release_key,content_bundle_id,status,is_default,rollout_jsonb,
 rollout_policy_version,rollout_seed,activated_at,retired_at,created_at
) values(
 '68300000-0000-0000-0000-000000000001','c08-local-pg17-v1',
 '68200000-0000-0000-0000-000000000001','active',false,null,
 'v1','c08-local',now(),null,now()
);
insert into public.characters(character_id,created_at,retired_at)
values ('seyeon',now(),null) on conflict do nothing;
insert into public.character_runtime_catalog(
 character_id,content_bundle_id,availability,enabled,release_at,retire_at,published_at
) values(
 'seyeon','68200000-0000-0000-0000-000000000001',
 'available',true,null,null,now()
);
insert into public.conversation_threads(
 id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,
 content_revision,next_sequence_no,created_at,updated_at,deleted_at
) values
 ('68400000-0000-0000-0000-000000000001','68100000-0000-0000-0000-000000000001',
 'single_character','active','C08 local first thread',
 '68300000-0000-0000-0000-000000000001','68200000-0000-0000-0000-000000000001',
 0,1,now(),now(),null),
 ('68400000-0000-0000-0000-000000000002','68100000-0000-0000-0000-000000000002',
 'single_character','active','C08 local another subject',
 '68300000-0000-0000-0000-000000000001','68200000-0000-0000-0000-000000000001',
 0,1,now(),now(),null);
insert into public.conversation_thread_characters(
 id,thread_id,character_id,content_bundle_id,role,joined_at,left_at
) values
 ('68500000-0000-0000-0000-000000000001','68400000-0000-0000-0000-000000000001',
 'seyeon','68200000-0000-0000-0000-000000000001','primary',now(),null),
 ('68500000-0000-0000-0000-000000000002','68400000-0000-0000-0000-000000000002',
 'seyeon','68200000-0000-0000-0000-000000000001','primary',now(),null);
select * from public.cmd_receive_chat_turn_v1(
 '68100000-0000-0000-0000-000000000001',
 '68400000-0000-0000-0000-000000000001',
 'c08-local-first-turn',
 'sha256:v1:'||repeat('b',64),'v1','{"text":"C08 synthetic"}'::jsonb,
 '68300000-0000-0000-0000-000000000001',
 '68200000-0000-0000-0000-000000000001',
 '68600000-0000-0000-0000-000000000001',
 '68800000-0000-0000-0000-000000000001',
 'C08 synthetic user message',null,'sha256:v1:'||repeat('a',64)
);
SQL

# SQL shape follows apps/api/src/postgres-seyeon-first-turn-census-shadow-v1.ts
# and is always executed with the verified subject-scoped executor role.
census_sql() {
  local requested_subject="$1" requested_thread="$2" requested_message="$3"
  "${run[@]}" <<SQL | tail -n 1
BEGIN;
SET LOCAL ROLE myeongha_api_executor;
select subject_id from public.begin_member_subject_context_v1('$member_auth');
with authorized_thread as materialized (
  select thread_id, status, participant_character_ids
  from public.qry_chat_thread_runtime_binding_v1('$requested_subject'::uuid, '$requested_thread'::uuid)
),
first_two_messages as materialized (
  select m.id, m.sequence_no, m.sender_type, m.redacted_at
  from public.conversation_messages m
  join authorized_thread t on t.thread_id = m.thread_id
  where m.subject_id = '$requested_subject'::uuid
    and m.thread_id = '$requested_thread'::uuid
  order by m.sequence_no asc
  limit 2
)
select t.status, array_to_string(t.participant_character_ids, ','),
  (select count(*)::text from first_two_messages),
  coalesce((
    select (m.id = '$requested_message'::uuid and
            m.sender_type = 'user' and m.redacted_at is null)
    from first_two_messages m order by m.sequence_no desc limit 1
  ),false)
from authorized_thread t;
ROLLBACK;
SQL
}

initial="$(census_sql "$subject" "$thread" "$message")"
[[ "$initial" == 'active|seyeon|1|t' ]] || {
  echo "HOLD_C08_PG17_INITIAL_CENSUS: $initial" >&2; exit 1;
}
echo PASS_C08_PG17_ONE_REAL_MESSAGE_CURRENT_USER

# Other Subject's thread must not be promoted into a valid census.
set +e
cross="$(census_sql "$subject" "$other_thread" "$message" 2>&1)"
cross_rc=$?
set -e
[[ "$cross_rc" -ne 0 || "$cross" != *'active|seyeon|1|t'* ]] || {
  echo HOLD_C08_PG17_CROSS_SUBJECT_LEAK >&2; exit 1;
}
echo PASS_C08_PG17_CROSS_SUBJECT_DENIED

# Two real PG17 sessions now produce the second (redacted) message:
# A reads the first-turn census twice in a single READ COMMITTED transaction,
# B commits the tombstone between them. A must observe 1 -> 2. Reuses the
# same synthetic message fixture; no extra message count is introduced.
bash test/db/seyeon_c08_two_session_census_race_pg17.sh

second="$(census_sql "$subject" "$thread" "$message")"
[[ "$second" == 'active|seyeon|2|f' ]] || {
  echo "HOLD_C08_PG17_REDACTED_HISTORY: $second" >&2; exit 1;
}
echo PASS_C08_PG17_REDACTED_HISTORY_COUNTS_AS_SECOND_MESSAGE

count="$("${run[@]}" -c "
select count(*) from public.conversation_messages
where thread_id='$thread' and subject_id='$subject';")"
[[ "$count" == 2 ]] || {
 echo HOLD_C08_PG17_READ_MUTATED_MESSAGE_COUNT >&2; exit 1;
}
echo PASS_C08_PG17_READ_ONLY_CENSUS
