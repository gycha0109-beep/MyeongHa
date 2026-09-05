#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${POOL_HOST:?POOL_HOST is required}"
: "${POOL_PORT:?POOL_PORT is required}"
: "${POOL_DB:?POOL_DB is required}"
: "${ADMIN_POOL_USER:?ADMIN_POOL_USER is required}"
: "${MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID:?MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID is required}"
: "${MYEONGHA_PRODUCTION_MEMBER_EMAIL:?MYEONGHA_PRODUCTION_MEMBER_EMAIL is required}"
: "${MYEONGHA_PRODUCTION_MEMBER_PASSWORD:?MYEONGHA_PRODUCTION_MEMBER_PASSWORD is required}"

uuid_re='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]
[[ "$POOL_HOST" == *.pooler.supabase.com ]]
[[ "$POOL_PORT" == '5432' || "$POOL_PORT" == '6543' ]]
[[ "$POOL_DB" == 'postgres' ]]
[[ "$MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID" =~ $uuid_re ]]

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=require

psql_base=(
  psql -X -q -A -t -v ON_ERROR_STOP=1
  -h "$POOL_HOST"
  -p "$POOL_PORT"
  -U "$ADMIN_POOL_USER"
  -d "$POOL_DB"
)

transaction_read_only="$(${psql_base[@]} <<'SQL'
begin read only;
select current_setting('transaction_read_only');
rollback;
SQL
)"
[[ "$transaction_read_only" == *'on'* ]]

summary="$(${psql_base[@]} -v expected_subject_id="$MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID" <<'SQL'
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local application_name = 'myeongha_member_chat_read_smoke_discovery';
with owned as (
  select t.*
  from public.conversation_threads t
  where t.subject_id = :'expected_subject_id'::uuid
), active_owned as (
  select t.*
  from owned t
  where t.status = 'active'
    and t.deleted_at is null
), pinned_active as (
  select t.*
  from active_owned t
  where t.active_content_release_id is not null
    and t.active_content_bundle_id is not null
), eligible as (
  select t.id
  from pinned_active t
  join public.conversation_thread_characters p
    on p.thread_id = t.id
   and p.role = 'primary'
   and p.left_at is null
   and p.content_bundle_id = t.active_content_bundle_id
  where t.thread_type = 'single_character'
)
select concat_ws('|',
  (select count(*) from owned),
  (select count(*) from active_owned),
  (select count(*) from pinned_active),
  (select count(*) from eligible)
);
rollback;
SQL
)"

IFS='|' read -r owned_thread_count active_thread_count pinned_active_thread_count eligible_thread_count <<< "$summary"
for count_value in \
  "$owned_thread_count" \
  "$active_thread_count" \
  "$pinned_active_thread_count" \
  "$eligible_thread_count"; do
  [[ "$count_value" =~ ^[0-9]+$ ]]
done

printf 'Production Member Chat read discovery diagnostic: ownedThreadCount=%s, activeThreadCount=%s, pinnedActiveThreadCount=%s, eligibleThreadCount=%s, auditMode=explicit_read_only.\n' \
  "$owned_thread_count" \
  "$active_thread_count" \
  "$pinned_active_thread_count" \
  "$eligible_thread_count"

[[ "$eligible_thread_count" -gt 0 ]] || {
  echo 'Production Member Chat read smoke blocked: no existing owned active pinned single-character thread is available.' >&2
  exit 1
}

binding="$(${psql_base[@]} -v expected_subject_id="$MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID" <<'SQL'
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local application_name = 'myeongha_member_chat_read_smoke_discovery';
select concat_ws('|',
  t.id::text,
  p.character_id,
  t.active_content_release_id::text,
  t.active_content_bundle_id::text
)
from public.conversation_threads t
join public.conversation_thread_characters p
  on p.thread_id = t.id
 and p.role = 'primary'
 and p.left_at is null
 and p.content_bundle_id = t.active_content_bundle_id
where t.subject_id = :'expected_subject_id'::uuid
  and t.thread_type = 'single_character'
  and t.status = 'active'
  and t.deleted_at is null
  and t.active_content_release_id is not null
  and t.active_content_bundle_id is not null
order by t.created_at, t.id
limit 1;
rollback;
SQL
)"

IFS='|' read -r chat_thread_id chat_character_id chat_release_id chat_bundle_id <<< "$binding"
[[ "$chat_thread_id" =~ $uuid_re ]]
[[ -n "$chat_character_id" ]]
[[ "$chat_character_id" != *'|'* ]]
[[ "$chat_character_id" != *$'\n'* ]]
[[ "$chat_character_id" != *$'\r'* ]]
[[ "$chat_release_id" =~ $uuid_re ]]
[[ "$chat_bundle_id" =~ $uuid_re ]]

export MYEONGHA_PRODUCTION_CHAT_THREAD_ID="$chat_thread_id"
export MYEONGHA_PRODUCTION_CHAT_EXPECTED_CHARACTER_ID="$chat_character_id"
export MYEONGHA_PRODUCTION_CHAT_EXPECTED_RELEASE_ID="$chat_release_id"
export MYEONGHA_PRODUCTION_CHAT_EXPECTED_BUNDLE_ID="$chat_bundle_id"

node scripts/verify-production-chat-current-subject.mjs
