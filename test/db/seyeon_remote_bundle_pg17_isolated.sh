#!/usr/bin/env bash
set -euo pipefail
# Exact recovery SQL is provided by an approved temporary file, never committed.
# Runs against a disposable localhost PostgreSQL 17 database; no Production access.
# Watchtower-Track: ops
# GitHub Actions may print postgres service logs after a failed transaction.
# Ensure private historical SQL text cannot appear in local PostgreSQL logs.
# Already installed as ALTER ROLE postgres SET by isolated bootstrap
# before actor login; sending SUSET values via PGOPTIONS causes FATAL when
# that actor is NOSUPERUSER. Verify the effective values below instead.
unset PGOPTIONS
hold() { echo "HOLD_SEYEON_PG17: $1" >&2; exit 1; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGUSER:-}" == postgres && "${PGDATABASE:-}" == myeongha_test ]] ||
  hold 'Disposable CI PostgreSQL required.'
[[ -z "${SUPABASE_DB_PASSWORD:-}" && -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" ]] ||
  hold 'Production connection settings forbidden.'
[[ -n "${SEYEON_REMOTE_BUNDLE_FILE:-}" ]] || hold 'Approved offline SQL required.'
for binary in psql createdb dropdb realpath sha256sum git python3; do
  command -v "$binary" >/dev/null || hold 'Missing local dependency.'
done
bundle="$(realpath -e -- "${SEYEON_REMOTE_BUNDLE_FILE:-}")" || hold 'SQL not available.'
[[ -f "$bundle" && "$bundle" != "$root/"* ]] || hold 'Input must be outside Git tree.'
[[ "$(wc -c < "$bundle" | tr -d ' ')" == 104021 ]] || hold 'Length mismatch.'
printf '%s  %s\n' '4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894' "$bundle" |
  sha256sum --check --status || hold 'SHA-256 mismatch.'
version="$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" ||
  hold 'Local PostgreSQL unavailable.'
[[ "$version" =~ ^17[0-9]{4}$ ]] || hold 'PostgreSQL 17 required.'
logging="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select current_setting('log_min_messages') || '|' ||
current_setting('log_min_error_statement') || '|' || current_setting('log_statement')")" ||
  hold 'Unable to inspect local statement logging.'
[[ "$logging" == 'panic|panic|none' ]] ||
  hold 'Local postgres confidential SQL logging must be disabled.'


origin="${PGDATABASE:-}"
shadow=myeongha_seyeon_remote_pg17_scratch_ci
tempdir="$(mktemp -d)"
chmod 700 "$tempdir"
cleanup() {
  PGDATABASE="$origin" dropdb --if-exists "$shadow" >/dev/null 2>&1 || true
  rm -rf -- "$tempdir"
}
trap cleanup EXIT
PGDATABASE="$origin" dropdb --if-exists "$shadow" >/dev/null 2>&1 ||
  hold 'Local shadow cleanup failure.'
PGDATABASE="$origin" createdb "$shadow" || hold 'Local shadow creation failure.'
export PGDATABASE="$shadow"
cd "$root"
apply() {
  local filename
  filename="$(basename "$1")"
  # These are repository-owned fixtures, not the private incident SQL.
  # Log the exact filename only; preserve the SQL error in deleted private tmp.
  echo "PG17_BASELINE_APPLY: $filename"
  psql -X -q -v ON_ERROR_STOP=1 -f "$1" >/dev/null 2>"$tempdir/apply.err" ||
    hold "Predecessor migration $filename failed; SQL error output hidden."
}
apply test/db/bootstrap_supabase_auth_stub.sql
installed=0
for file in supabase/migrations/*.sql; do
  n="$(basename "$file" | cut -d_ -f1)"
  if (( 10#$n < 1400 )); then
    # Repository PG17 test/db/run_ci_case.sh already skips migration 0860
    # unless its special managed-owner/principal fixture is prepared.
    # Preserve the established PG17 compatibility contract; this means
    # the isolated baseline is NOT a byte-exact Supabase Production clone.
    if [[ "$file" == 'supabase/migrations/0860_birth_profile_create_runtime_authority.sql' ]]; then
      echo 'PG17_FIXTURE_SKIP_0860: dedicated managed-principal authority case owns this migration'
      continue
    fi
    apply "$file"
    installed=$((installed+1))
  fi
done
[[ "$installed" -ge 150 ]] || hold 'Baseline incomplete.'
psql -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key, name text, statements text[]
);
SQL
early_count() {
  psql -X -qAt -v ON_ERROR_STOP=1 -c "
    select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'relationship_event_json_v1','cmd_lock_relationship_apply_context_v1',
      'cmd_apply_relationship_event_runtime_v1','cmd_lock_relationship_history_context_v1',
      'relationship_assert_adjustment_slot_v1',
      'cmd_append_relationship_retraction_runtime_v1',
      'cmd_append_relationship_correction_runtime_v1',
      'cmd_commit_relationship_replay_projection_v1',
      'cmd_rebuild_relationship_projection_runtime_v1',
      'cmd_write_relationship_snapshot_runtime_v1',
      'qry_latest_valid_relationship_snapshot_v1');"
}
[[ "$(early_count)" == 0 ]] || hold 'Missing expected six-migration gap.'

# This is the exact 104KB statement, not concatenated repository migrations.
# Suppress psql errors: failures can otherwise print private SQL fragments.
psql -X -q -1 -v ON_ERROR_STOP=1 -f "$bundle" \
  >/dev/null 2>"$tempdir/recover.err" ||
  hold 'Historical SQL failed in isolated PostgreSQL 17.'
history="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from supabase_migrations.schema_migrations
  where version in ('1460','1470','1480','1490','1500','1510')
    and coalesce(cardinality(statements),0)=0")"
[[ "$history" == 6 ]] || hold 'Recovery failed to install its six marker rows.'

# Recreate the exact remote-only history row IN DISPOSABLE TEST DB, not in
# Production. Pipe hex to local psql without ever logging confidential SQL.
python3 -c 'import sys
from pathlib import Path
raw=Path(sys.argv[1]).read_bytes()
v=raw.hex()
sys.stdout.write("insert into supabase_migrations.schema_migrations(version,name,statements) values ("+
 "\x2720261008090417\x27,\x27seyeon_runtime_1460_1510_acl_before_owner_recovery\x27,"+
 "array[convert_from(decode(\x27"+v+"\x27,\x27hex\x27),\x27UTF8\x27)]);")
' "$bundle" |
  psql -X -q -v ON_ERROR_STOP=1 >/dev/null 2>"$tempdir/marker.err" ||
  hold 'Local-only exact incident ledger fixture failed.'

acl() {
  psql -X -qAt -v ON_ERROR_STOP=1 \
    -f scripts/operations/seyeon-production-acl-recovery-readonly.sql | tail -n1
}
[[ "$(acl)" == *'ACL_PARITY_PASS_RECONCILIATION_STILL_HOLD' ]] ||
  hold 'Recovered runtime ACL mismatch.'
fingerprint() {
  psql -X -qAt -v ON_ERROR_STOP=1 -c "
    select encode(sha256(convert_to(string_agg(
      p.oid::regprocedure::text || ':' || pg_get_functiondef(p.oid) || ':' ||
      pg_get_userbyid(p.proowner) || ':' || coalesce(p.proacl::text,'') || ':' ||
      p.prosecdef::text, E'\n' order by p.oid::regprocedure::text
    ),'UTF8')),'hex')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'qry_production_relationship_runtime_v1','cmd_enqueue_seyeon_relationship_sync_v1',
      'cmd_claim_seyeon_relationship_sync_v1','cmd_complete_seyeon_relationship_sync_v1',
      'qry_production_relationship_history_runtime_v1',
      'cmd_receive_seyeon_chat_turn_runtime_v1',
      'cmd_allocate_seyeon_chat_attempt_runtime_v1',
      'cmd_mark_seyeon_chat_context_ready_runtime_v1',
      'cmd_fail_seyeon_chat_attempt_runtime_v1',
      'cmd_persist_seyeon_chat_generated_runtime_v1',
      'cmd_persist_seyeon_chat_validated_runtime_v1',
      'cmd_commit_seyeon_chat_turn_runtime_v1',
      'cmd_commit_seyeon_chat_turn_runtime_v2',
      'qry_seyeon_post_turn_analysis_job_v1',
      'cmd_claim_seyeon_post_turn_analysis_v1',
      'cmd_checkpoint_seyeon_post_turn_analysis_v1',
      'cmd_complete_seyeon_post_turn_analysis_v1',
      'qry_content_bundle_manifest_v1');"
}
before="$(fingerprint)"
[[ -n "$before" ]] || hold 'Missing later runtime function fingerprint.'
# Same runtime SQL plan as Production: immutable source blobs -> private approved
# COMMENT-before-REVOKE staging. No SQL body escapes runner tmp storage.
mkdir -m 700 "$tempdir/managed-owner-migrations"
python3 scripts/operations/stage-seyeon-managed-owner-comment-order.py \
  --source-dir "$root/supabase/migrations" \
  --output-dir "$tempdir/managed-owner-migrations" >/dev/null ||
  hold 'Managed-owner SQL staging failed against exact approved source.'
# A stock postgres:17.6 role is the bootstrap superuser (OID 10).
# PostgreSQL 17 expressly forbids changing the bootstrap role's SUPERUSER
# property, even through SET ROLE to a second superuser. Never claim that a
# successful stock-postgres CI replay proves Production non-superuser behavior.
# Match the Production managed-owner membership *options* (admin true,
# INHERIT false, SET false) before dropping the disposable service superuser.
# The fixture's grantor may differ from Supabase's "supabase_admin"; both the
# pre/post Production and isolated tests still require exact membership
# fingerprint preservation across the six scoped migrations.
psql -X -q -v ON_ERROR_STOP=1 \
  -c 'grant myeongha_relationship_apply_owner to postgres with admin true, inherit false, set false;' \
  >/dev/null 2>"$tempdir/membership-fixture.err" ||
  hold 'Unable to install restricted managed-owner membership fixture.'
membership="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from pg_auth_members m
    join pg_roles owner on owner.oid=m.roleid
    join pg_roles member on member.oid=m.member
  where owner.rolname='myeongha_relationship_apply_owner'
    and member.rolname='postgres'
    and m.admin_option=true and m.inherit_option=false and m.set_option=false")" ||
  hold 'Unable to inspect non-superuser owner membership fixture.'
[[ "$membership" == 1 ]] ||
  hold 'Expected one restricted direct managed-owner grant.'

# Supabase Production's postgres role is non-superuser. The earlier rehearsal
# was a false positive because stock postgres:17.6 ships a superuser postgres.
# Demote ONLY this disposable test service after the historical bundle is
# installed. This intentionally exposes COMMENT/OWNER membership mistakes.
# A superuser cannot safely revoke its own privilege while it is the
# active current_user. Bootstrap a disposable secondary SUPERUSER role in
# this isolated PostgreSQL service, switch only within this psql session,
# then demote postgres. No Production connection/role mutation is involved.
psql -X -q -v ON_ERROR_STOP=1 -c \
  'create role seyeon_fixture_demoter superuser noinherit nologin;' \
  >/dev/null 2>"$tempdir/demote-bootstrap.err" ||
  hold 'Unable to create disposable isolated role demotion operator.'
psql -X -q -v ON_ERROR_STOP=1 -c \
  'set role seyeon_fixture_demoter; alter role postgres nosuperuser createrole createdb;' \
  >/dev/null 2>"$tempdir/demote.err" ||
  hold 'Unable to reproduce Production non-superuser postgres role.'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select rolsuper from pg_roles where rolname='postgres'")" == f ]] ||
  hold 'Disposable PG17 executor is unexpectedly superuser.'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select rolsuper from pg_roles where rolname=current_user")" == f ]] ||
  hold 'Disposable connected PG17 executor retained superuser privileges.'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select current_user")" == postgres ]] ||
  hold 'Disposable connected PG17 actor identity differs from Production.'

set --
for n in 1400 1410 1420 1430 1440 1450; do
  count=0
  for file in "$tempdir/managed-owner-migrations/${n}_"*.sql; do
    [[ -f "$file" ]] || hold 'Missing early migration.'
    set -- "$@" -f "$file"
    count=$((count+1))
  done
  [[ "$count" == 1 ]] || hold 'Ambiguous early migration.'
done
# Exercise the exact guarded Production transaction pre/post assertions in
# the isolated PG17 test, so its SQL is never only statically checked.
set -- -f scripts/operations/seyeon-relationship-backfill-transaction-pre.sql "$@" \
  -f scripts/operations/seyeon-relationship-backfill-transaction-post.sql
psql -X -q -1 -v ON_ERROR_STOP=1 "$@" >/dev/null 2>"$tempdir/early.err" ||
  hold 'Transactional backfill failed in isolated PostgreSQL 17.'
[[ "$(early_count)" == 11 ]] || hold 'Eleven early functions not installed.'
[[ "$before" == "$(fingerprint)" ]] ||
  hold 'Later function definition, Owner or ACL changed.'
[[ "$(acl)" == *'ACL_PARITY_PASS_RECONCILIATION_STILL_HOLD' ]] ||
  hold 'Later runtime ACL changed after backfill.'
rows="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select (select count(*) from public.relationship_event_records) +
         (select count(*) from public.relationship_state_snapshots)")"
[[ "$rows" == 0 ]] || hold 'Relationship records unexpectedly created.'
echo 'PASS_PG17_EXACT_BUNDLE: remote incident SQL + managed non-superuser retroactive 1400..1450; 11 functions, preserved ACL/fingerprint, zero records'
echo 'HOLD_PRODUCTION: actual data, restore, 1520..1640, attack coverage and owner approval outstanding'
