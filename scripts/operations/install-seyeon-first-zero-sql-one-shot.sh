#!/usr/bin/env bash
# Watchtower-Track: security
# Manual, exact-source Production function-only install. Never db push.
set -euo pipefail

project='cnsfpcdiyofqvhpcegfc'
version='20261018190000'
migration="supabase/migrations/${version}_seyeon_locked_first_zero_source_reveal_v1.sql"
expected_blob='3fbe7322cb3f11484a3e0a42bdc0598879b3d1d8'
: "${SUPABASE_DB_PASSWORD:?Production DB secret required}"
: "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:?Production pooler host required}"
: "${REVIEWED_MAIN_SHA:?Reviewed main SHA required}"
: "${SCOPED_CONFIRMATION:?Explicit scope confirmation required}"
: "${GITHUB_SHA:?GitHub commit required}"
: "${GITHUB_REF:?GitHub ref required}"
[[ "${SUPABASE_PROJECT_ID:-}" == "$project" ]]
[[ "$GITHUB_REF" == 'refs/heads/main' ]]
[[ "$REVIEWED_MAIN_SHA" == "$GITHUB_SHA" ]]
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]]
[[ -z "$(git status --porcelain)" ]]
[[ "$SCOPED_CONFIRMATION" == 'INSTALL_SEYEON_FIRST_ZERO_FUNCTION_ONLY' ]]
[[ -f "$migration" ]]
[[ "$(git hash-object "$migration")" == "$expected_blob" ]]
[[ "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]]

export PGHOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST"
export PGPORT=5432 PGDATABASE=postgres PGUSER="postgres.$project"
export PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE=require

# One read-only catalog row; no private content, no migrations repaired here.
admission="$(
  PGOPTIONS='-c default_transaction_read_only=on' psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
select case
  when current_user <> 'postgres' then 'HOLD_WRONG_DB_OWNER'
  when to_regprocedure('public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid)') is not null
    then 'HOLD_FUNCTION_ALREADY_INSTALLED'
  when exists (select 1 from supabase_migrations.schema_migrations where version='20261018190000')
    then 'HOLD_MIGRATION_ALREADY_RECORDED'
  when to_regprocedure('public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)') is null
    or to_regprocedure('public.assert_myeongha_subject_context_v1(uuid)') is null
    or to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)') is null
    then 'HOLD_MISSING_AUTHORITATIVE_CONTEXT'
  when not exists (select 1 from pg_roles where rolname='myeongha_api_executor')
    then 'HOLD_MISSING_EXECUTOR'
  when exists (
    select 1 from (values
      ('public.subjects'),('public.chat_turns'),
      ('public.chat_turn_attempts'),('public.conversation_messages'),
      ('public.conversation_thread_characters'),
      ('public.relationship_events'),('public.relationship_event_records'),
      ('public.relationship_history_entries')
    ) as required(rel) where to_regclass(required.rel) is null
  ) then 'HOLD_MISSING_REQUIRED_TABLE'
  else 'ALLOW_EXACT_FIRST_ZERO_FUNCTION_ONLY'
end;
SQL
)"
[[ "$admission" == 'ALLOW_EXACT_FIRST_ZERO_FUNCTION_ONLY' ]] || {
  echo "SCOPED_FIRST_ZERO_HOLD: $admission" >&2
  exit 1
}
echo 'SCOPED_FIRST_ZERO_PREFLIGHT_PASS: exact source + catalog; no old migrations replayed'

# SQL file owns its BEGIN/COMMIT and creates exactly one protected function.
# Do not pass --include-all, run a general migration repair, or mutate tables.
psql -X -q -v ON_ERROR_STOP=1 -f "$migration"

# Post-create ACL & definer check BEFORE recording this exact migration.
installed="$(
  PGOPTIONS='-c default_transaction_read_only=on' psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
select case when exists (
  select 1 from pg_proc p
  where p.oid=to_regprocedure('public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid)')
    and p.prosecdef
    and pg_get_userbyid(p.proowner)='postgres'
    and 'row_security=off'=any(p.proconfig)
    and has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
    and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not has_function_privilege('service_role',p.oid,'EXECUTE')
) then 'INSTALLED_SCOPED_LOCKED_FUNCTION_ACL_PASS' else 'HOLD_INSTALLED_FUNCTION_ACL' end;
SQL
)"
[[ "$installed" == 'INSTALLED_SCOPED_LOCKED_FUNCTION_ACL_PASS' ]] || {
  echo "SCOPED_FIRST_ZERO_HOLD: $installed (DB Owner recovery required)" >&2
  exit 1
}

# Record ONLY the exact reviewed function migration, not historical backlog.
encoded_password="$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ['SUPABASE_DB_PASSWORD'], safe=''))
PY
)"
db_url="postgresql://postgres.$project:${encoded_password}@${PGHOST}:5432/postgres?sslmode=require"
echo "::add-mask::$db_url"
supabase migration repair "$version" --status applied --db-url "$db_url"
recorded="$(
  PGOPTIONS='-c default_transaction_read_only=on' psql -X -qAt -v ON_ERROR_STOP=1 -c "select count(*) from supabase_migrations.schema_migrations where version='$version'"
)"
[[ "$recorded" == '1' ]] || {
  echo 'SCOPED_FIRST_ZERO_HOLD: function installed but migration history not recorded' >&2
  exit 1
}
echo 'SCOPED_FIRST_ZERO_SQL_INSTALLED: first zero-source only; no Vercel Fetch Reveal, paid inference, or historical Grant activation'
