#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
: "${POOL_HOST:?POOL_HOST is required}"
: "${POOL_PORT:?POOL_PORT is required}"
: "${POOL_DB:?POOL_DB is required}"
: "${ADMIN_POOL_USER:?ADMIN_POOL_USER is required}"

[[ "$SUPABASE_PROJECT_ID" == 'cnsfpcdiyofqvhpcegfc' ]]
[[ "$ADMIN_POOL_USER" == "postgres.$SUPABASE_PROJECT_ID" ]]
[[ "$POOL_HOST" == *.pooler.supabase.com ]]
[[ "$POOL_PORT" == '5432' || "$POOL_PORT" == '6543' ]]
[[ "$POOL_DB" == 'postgres' ]]

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

summary="$(${psql_base[@]} <<'SQL'
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local application_name = 'myeongha_character_roster_read_audit';
with active_default as (
  select r.content_bundle_id
  from public.qry_active_default_content_release_v1() r
), active_runtime as (
  select c.*
  from active_default r
  join public.character_runtime_catalog c
    on c.content_bundle_id = r.content_bundle_id
)
select concat_ws('|',
  (select count(*) from active_default),
  (select count(*) from public.content_bundles b join active_default r on r.content_bundle_id = b.id),
  (select count(*) from public.characters),
  (select count(*) from active_runtime),
  (select count(*) from active_runtime c where c.enabled = true),
  (select count(*) from active_runtime c where c.availability in ('available', 'unlockable')),
  (select count(*) from active_runtime c where c.release_at is null or c.release_at <= statement_timestamp()),
  (select count(*) from active_runtime c where c.retire_at is null or c.retire_at > statement_timestamp()),
  (select count(*) from active_runtime c
    where c.enabled = true
      and c.availability in ('available', 'unlockable')
      and (c.release_at is null or c.release_at <= statement_timestamp())
      and (c.retire_at is null or c.retire_at > statement_timestamp()))
);
rollback;
SQL
)"

IFS='|' read -r \
  active_default_release_count \
  active_bundle_count \
  character_total_count \
  active_runtime_count \
  enabled_runtime_count \
  candidate_availability_count \
  release_window_started_count \
  not_retired_count \
  eligible_character_count <<< "$summary"

for count_value in \
  "$active_default_release_count" \
  "$active_bundle_count" \
  "$character_total_count" \
  "$active_runtime_count" \
  "$enabled_runtime_count" \
  "$candidate_availability_count" \
  "$release_window_started_count" \
  "$not_retired_count" \
  "$eligible_character_count"; do
  [[ "$count_value" =~ ^[0-9]+$ ]]
done

printf 'Production character roster read diagnostic: activeDefaultReleaseCount=%s, activeBundleCount=%s, characterTotalCount=%s, activeRuntimeCount=%s, enabledRuntimeCount=%s, candidateAvailabilityCount=%s, releaseWindowStartedCount=%s, notRetiredCount=%s, eligibleCharacterCount=%s, auditMode=explicit_read_only.\n' \
  "$active_default_release_count" \
  "$active_bundle_count" \
  "$character_total_count" \
  "$active_runtime_count" \
  "$enabled_runtime_count" \
  "$candidate_availability_count" \
  "$release_window_started_count" \
  "$not_retired_count" \
  "$eligible_character_count"

[[ "$active_default_release_count" -gt 0 ]] || {
  echo 'Production character roster read failed: no active default content release.' >&2
  exit 1
}
[[ "$active_bundle_count" -gt 0 ]] || {
  echo 'Production character roster read failed: active default release has no backing content bundle.' >&2
  exit 1
}
[[ "$active_runtime_count" -gt 0 ]] || {
  echo 'Production character roster read failed: active default content bundle has no runtime catalog rows.' >&2
  exit 1
}
[[ "$eligible_character_count" -gt 0 ]] || {
  echo 'Production character roster read failed: active default runtime catalog has rows but none are currently eligible.' >&2
  exit 1
}

mapfile -t character_ids < <("${psql_base[@]}" <<'SQL'
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local application_name = 'myeongha_character_roster_read_audit';
select c.character_id
from public.qry_active_default_content_release_v1() r
join public.character_runtime_catalog c
  on c.content_bundle_id = r.content_bundle_id
where c.enabled = true
  and c.availability in ('available', 'unlockable')
  and (c.release_at is null or c.release_at <= statement_timestamp())
  and (c.retire_at is null or c.retire_at > statement_timestamp())
order by c.character_id;
rollback;
SQL
)

[[ "${#character_ids[@]}" -eq "$eligible_character_count" ]]
for character_id in "${character_ids[@]}"; do
  [[ -n "$character_id" ]]
  [[ "$character_id" != *$'\n'* ]]
  [[ "$character_id" != *$'\r'* ]]
done

printf 'Production character roster read passed: characterCount=%s, activeDefaultRelease=true, auditMode=explicit_read_only.\n' "${#character_ids[@]}"
for character_id in "${character_ids[@]}"; do
  printf 'productionCharacterId=%s\n' "$character_id"
done
