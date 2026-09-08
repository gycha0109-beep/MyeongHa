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
character_re='^[a-z0-9][a-z0-9_-]*$'

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

character_id="$(${psql_base[@]} <<'SQL'
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local application_name = 'myeongha_member_chat_open_reuse_character_discovery';
with active_default as (
  select r.content_bundle_id
  from public.qry_active_default_content_release_v1() r
), eligible as (
  select c.character_id
  from active_default r
  join public.character_runtime_catalog c
    on c.content_bundle_id = r.content_bundle_id
  where c.enabled = true
    and c.availability in ('available', 'unlockable')
    and (c.release_at is null or c.release_at <= statement_timestamp())
    and (c.retire_at is null or c.retire_at > statement_timestamp())
)
select character_id
from eligible
order by character_id
limit 1;
rollback;
SQL
)"

[[ -n "$character_id" ]] || {
  echo 'Production Member Chat open/reuse smoke blocked: no eligible Character exists in the active default Production content release.' >&2
  exit 1
}
[[ "$character_id" =~ $character_re ]]
[[ "$character_id" != *$'\n'* ]]
[[ "$character_id" != *$'\r'* ]]

export MYEONGHA_PRODUCTION_CHAT_OPEN_CHARACTER_ID="$character_id"
node scripts/verify-production-member-chat-open-reuse.mjs

binding="$(${psql_base[@]} \
  -v expected_subject_id="$MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID" \
  -v expected_character_id="$MYEONGHA_PRODUCTION_CHAT_OPEN_CHARACTER_ID" <<'SQL'
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local application_name = 'myeongha_member_chat_open_reuse_binding_readback';
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
  and p.character_id = :'expected_character_id'
order by t.created_at, t.id
limit 1;
rollback;
SQL
)"

IFS='|' read -r chat_thread_id chat_character_id chat_release_id chat_bundle_id <<< "$binding"
[[ "$chat_thread_id" =~ $uuid_re ]]
[[ "$chat_character_id" == "$MYEONGHA_PRODUCTION_CHAT_OPEN_CHARACTER_ID" ]]
[[ "$chat_release_id" =~ $uuid_re ]]
[[ "$chat_bundle_id" =~ $uuid_re ]]

export MYEONGHA_PRODUCTION_CHAT_THREAD_ID="$chat_thread_id"
export MYEONGHA_PRODUCTION_CHAT_EXPECTED_CHARACTER_ID="$chat_character_id"
export MYEONGHA_PRODUCTION_CHAT_EXPECTED_RELEASE_ID="$chat_release_id"
export MYEONGHA_PRODUCTION_CHAT_EXPECTED_BUNDLE_ID="$chat_bundle_id"

node scripts/verify-production-chat-current-subject.mjs

printf 'Production Member Chat open/reuse + readback smoke passed: authoritativeCharacterDiscovery=true, governedPostOpen=true, sameCharacterReuse=true, reauthContinuity=true, ownedPinnedReadback=true, auditMode=database-read-only-plus-governed-api-post.\n'
