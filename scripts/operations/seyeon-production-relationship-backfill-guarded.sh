#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
# Manually governed, scoped Production 1400..1450 repair only.
# Not connected to ordinary supabase db push / migration repair.
# Watchtower-Track: ops
hold() { echo "HOLD_SEYEON_PRODUCTION_BACKFILL: $1" >&2; exit 1; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true &&
   "${GITHUB_REPOSITORY:-}" == 'gycha0109-beep/MyeongHa' &&
   "${GITHUB_REF:-}" == 'refs/heads/main' ]] ||
  hold 'Protected main GitHub Actions runner required.'
[[ "${SEYEON_SCOPE_CONFIRMATION:-}" == 'APPLY_RELATIONSHIP_1400_1450_ONLY' ]] ||
  hold 'Explicit scoped confirmation required.'
[[ -n "${GH_TOKEN:-}" && -n "${SUPABASE_DB_PASSWORD:-}" &&
   -n "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" &&
   -n "${SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM:-}" ]] ||
  hold 'Protected production credentials and verified TLS root required.'
[[ "${SUPABASE_PROJECT_ID:-}" == cnsfpcdiyofqvhpcegfc ]] ||
  hold 'Unexpected Supabase project.'
[[ "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]] ||
  hold 'Unexpected Production pooler endpoint.'
[[ "${SEYEON_BACKUP_RUN_ID:-}" =~ ^[1-9][0-9]+$ &&
   "${SEYEON_RESTORE_RUN_ID:-}" =~ ^[1-9][0-9]+$ ]] ||
  hold 'Paired governed backup and isolated restore run IDs required.'
for binary in gh git jq psql date mktemp; do
  command -v "$binary" >/dev/null || hold "Missing execution dependency: $binary"
done
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ &&
   "$(git rev-parse HEAD)" == "$GITHUB_SHA" &&
   -z "$(git status --porcelain)" ]] ||
  hold 'Runner checkout is not the immutable clean main SHA.'
latest="$(gh api 'repos/gycha0109-beep/MyeongHa/branches/main' --jq '.commit.sha')" ||
  hold 'Cannot establish current protected main HEAD.'
[[ "$latest" == "$GITHUB_SHA" ]] ||
  hold 'Main changed since this run; new review required.'

backup="$(gh api "repos/gycha0109-beep/MyeongHa/actions/runs/$SEYEON_BACKUP_RUN_ID")" ||
  hold 'Cannot inspect backup-run authority.'
restore="$(gh api "repos/gycha0109-beep/MyeongHa/actions/runs/$SEYEON_RESTORE_RUN_ID")" ||
  hold 'Cannot inspect restore-run authority.'
jq -e '.status == "completed" and .conclusion == "success"
  and (.path | startswith(".github/workflows/production-postgres-backup.yml"))' \
  <<<"$backup" >/dev/null || hold 'Governed backup run not successful.'
jq -e '.status == "completed" and .conclusion == "success"
  and (.path | startswith(".github/workflows/postgres-isolated-restore-drill.yml"))' \
  <<<"$restore" >/dev/null || hold 'Matching isolated restore run not successful.'
backup_completed="$(jq -er '.updated_at' <<<"$backup")" ||
  hold 'Backup completion time unavailable.'
restore_completed="$(jq -er '.updated_at' <<<"$restore")" ||
  hold 'Restore completion time unavailable.'
backup_epoch="$(date -u -d "$backup_completed" +%s)" ||
  hold 'Invalid backup completion timestamp.'
restore_epoch="$(date -u -d "$restore_completed" +%s)" ||
  hold 'Invalid restore completion timestamp.'
now_epoch="$(date -u +%s)"
(( backup_epoch <= restore_epoch && restore_epoch <= now_epoch &&
   backup_epoch >= now_epoch - 14400 )) ||
  hold 'Fresh <= 4-hour governed backup and newer restore required.'
artifact_name="postgres-isolated-restore-drill-$SEYEON_RESTORE_RUN_ID"
artifacts="$(gh api "repos/gycha0109-beep/MyeongHa/actions/runs/$SEYEON_RESTORE_RUN_ID/artifacts")" ||
  hold 'Cannot inspect restore evidence artifact.'
jq -e --arg n "$artifact_name" '[.artifacts[]
  | select(.name==$n and .expired==false)] | length == 1' <<<"$artifacts" >/dev/null ||
  hold 'Governed restore evidence artifact unavailable.'
temp="$(mktemp -d)"
cleanup() { rm -rf -- "$temp"; }
trap cleanup EXIT
chmod 700 "$temp"
gh run download "$SEYEON_RESTORE_RUN_ID" -R gycha0109-beep/MyeongHa \
  --name "$artifact_name" --dir "$temp" >/dev/null ||
  hold 'Failed to retrieve restore evidence.'
evidence="$temp/restore-evidence.json"
[[ -f "$evidence" ]] || hold 'Restore envelope missing.'
jq -e --arg b "$SEYEON_BACKUP_RUN_ID" '
  (.backup_workflow_run_id | tostring) == $b and
  .project_ref == "cnsfpcdiyofqvhpcegfc" and
  .restore_target == "github-actions-loopback-supabase-postgres" and
  .evidence_envelope_version == "myeongha-postgres-isolated-restore-evidence-envelope-v1" and
  (.backup_migration_frontier | tostring) == "20261008090417" and
  .dr_ready == false and
  .member_auth_rate_limit_schema_restore == "pass" and
  .member_auth_rate_limit_acl_restore == "pass" and
  (.source_encrypted_sha256 | test("^[0-9a-f]{64}$"))
' "$evidence" >/dev/null ||
  hold 'Restore envelope does not prove the Production incident frontier.'
# Verify the backup artifact still exists independently of the restore claim.
backup_artifacts="$(gh api "repos/gycha0109-beep/MyeongHa/actions/runs/$SEYEON_BACKUP_RUN_ID/artifacts")" ||
  hold 'Cannot inspect backup artifact.'
source_artifact="$(jq -er '.source_artifact_name' "$evidence")"
jq -e --arg n "$source_artifact" '[.artifacts[]
  | select(.name==$n and .expired==false)] | length == 1' <<<"$backup_artifacts" >/dev/null ||
  hold 'Source backup artifact expired or missing.'

printf '%s' "$SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM" >"$temp/server-root.pem"
chmod 600 "$temp/server-root.pem"
export PGHOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" PGPORT=5432 PGDATABASE=postgres
export PGUSER="postgres.$SUPABASE_PROJECT_ID" PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=verify-full PGSSLROOTCERT="$temp/server-root.pem"
export PGCONNECT_TIMEOUT=10

# Separate readonly admission: expected HOLD is evidence of an *unchanged* gap.
verdict="$(PGOPTIONS='-c default_transaction_read_only=on' \
  psql -X -qAt -v ON_ERROR_STOP=1 \
  -f scripts/operations/seyeon-production-history-admission-readonly.sql)" ||
  hold 'Production read-only admission failed.'
[[ "$verdict" == 'HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY' ]] ||
  hold "Unexpected Production gap admission verdict: $verdict"
for n in 1400 1410 1420 1430 1440 1450; do
  files=(supabase/migrations/"$n"_*.sql)
  [[ "${#files[@]}" -eq 1 && -f "${files[0]}" ]] ||
    hold "Missing/ambiguous approved migration $n."
done

# No historical remote-only 104KB SQL is ever re-executed.
# psql -1 wraps preflight + exactly six files + history + verification in
# ONE transaction. Any SQL/ACL/schema failure rolls back even history rows.
echo 'SCOPED_BACKFILL_START: Production 1400..1450, verified backup+restore'
psql -X -q --single-transaction -v ON_ERROR_STOP=1 \
  -f scripts/operations/seyeon-relationship-backfill-transaction-pre.sql \
  -f supabase/migrations/1400_relationship_apply_context_v1.sql \
  -f supabase/migrations/1410_relationship_event_apply_command_v1.sql \
  -f supabase/migrations/1420_relationship_reliability_context_v1.sql \
  -f supabase/migrations/1430_relationship_adjustment_commands_v1.sql \
  -f supabase/migrations/1440_relationship_projection_rebuild_v1.sql \
  -f supabase/migrations/1450_relationship_snapshot_runtime_v1.sql \
  -f scripts/operations/seyeon-relationship-backfill-transaction-post.sql ||
  hold 'Atomic scoped Production SQL failed; transaction rolled back.'

after="$(PGOPTIONS='-c default_transaction_read_only=on' \
 psql -X -qAt -v ON_ERROR_STOP=1 -c "
 select (select count(*) from supabase_migrations.schema_migrations
   where version in ('1400','1410','1420','1430','1440','1450'))::text || ':' ||
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'relationship_event_json_v1','cmd_lock_relationship_apply_context_v1',
    'cmd_apply_relationship_event_runtime_v1','cmd_lock_relationship_history_context_v1',
    'relationship_assert_adjustment_slot_v1',
    'cmd_append_relationship_retraction_runtime_v1',
    'cmd_append_relationship_correction_runtime_v1',
    'cmd_commit_relationship_replay_projection_v1',
    'cmd_rebuild_relationship_projection_runtime_v1',
    'cmd_write_relationship_snapshot_runtime_v1',
    'qry_latest_valid_relationship_snapshot_v1'))::text")" ||
  hold 'Read-only post-commit catalog verification unavailable.'
[[ "$after" == '6:11' ]] ||
  hold "Unexpected post-commit catalog result; investigation required."
echo 'PASS_SCOPED_PRODUCTION_1400_1450: exact six history rows and 11 functions'
echo 'HOLD_OTHER_SCOPES: remote-only 20261008090417 history, 1520..1640 and G0..G6 remain restricted'
