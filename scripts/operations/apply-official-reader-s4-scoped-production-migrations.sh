#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
# Explicit, protected-main, forward-only Reader 1740..2300 deployment only.
# Never normal db push, remote-history repair, external provider calls or paid activation.
hold() { echo "HOLD_READER_S4_SCOPED_PRODUCTION: $1" >&2; exit 1; }
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

[[ "$(printenv CI || true)" == true &&
   "$(printenv GITHUB_ACTIONS || true)" == true &&
   "$(printenv GITHUB_REPOSITORY || true)" == gycha0109-beep/MyeongHa &&
   "$(printenv GITHUB_REF || true)" == refs/heads/main ]] ||
  hold 'Protected main GitHub Actions runner required'
[[ "$(printenv READER_S4_SCOPE_CONFIRMATION || true)" == APPLY_OFFICIAL_READER_1740_2300_ONLY ]] ||
  hold 'Exact manual Reader deployment confirmation required'
[[ "$(printenv SUPABASE_PROJECT_ID || true)" == cnsfpcdiyofqvhpcegfc ]] ||
  hold 'Unexpected project'
for name in SUPABASE_DB_PASSWORD SUPABASE_PRODUCTION_SESSION_POOLER_HOST \
  SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM GH_TOKEN; do
  [[ -n "$(printenv "$name" || true)" ]] ||
    hold "Missing protected credential: $name"
done
[[ "$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" =~ ^[a-z0-9-]+([.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$ ]] ||
  hold 'Unexpected session-pooler host'
[[ "$(printenv READER_S4_BACKUP_RUN_ID || true)" =~ ^[1-9][0-9]+$ &&
   "$(printenv READER_S4_RESTORE_RUN_ID || true)" =~ ^[1-9][0-9]+$ ]] ||
  hold 'Governed backup and paired isolated restore IDs required'
for binary in gh git jq psql date python3; do
  command -v "$binary" >/dev/null || hold "Missing dependency: $binary"
done
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ &&
   "$(git rev-parse HEAD)" == "$GITHUB_SHA" &&
   -z "$(git status --porcelain)" ]] || hold 'Immutable clean main checkout required'
[[ "$(gh api repos/gycha0109-beep/MyeongHa/branches/main --jq .commit.sha)" == "$GITHUB_SHA" ]] ||
  hold 'Protected main HEAD advanced'

backup="$(gh api "repos/gycha0109-beep/MyeongHa/actions/runs/$READER_S4_BACKUP_RUN_ID")" ||
  hold 'Cannot inspect backup'
restore="$(gh api "repos/gycha0109-beep/MyeongHa/actions/runs/$READER_S4_RESTORE_RUN_ID")" ||
  hold 'Cannot inspect restore'
jq -e --arg sha "$GITHUB_SHA" '
  .status=="completed" and .conclusion=="success" and .head_sha==$sha
  and (.path | startswith(".github/workflows/production-postgres-backup.yml"))
' <<<"$backup" >/dev/null || hold 'Wrong backup scope, SHA or completion'
jq -e --arg sha "$GITHUB_SHA" '
  .status=="completed" and .conclusion=="success" and .head_sha==$sha
  and (.path | startswith(".github/workflows/postgres-isolated-restore-drill.yml"))
' <<<"$restore" >/dev/null || hold 'Wrong isolated restore scope, SHA or completion'
backup_epoch="$(date -u -d "$(jq -er .updated_at <<<"$backup")" +%s)"
restore_epoch="$(date -u -d "$(jq -er .updated_at <<<"$restore")" +%s)"
now="$(date -u +%s)"
((backup_epoch<=restore_epoch && restore_epoch<=now &&
  backup_epoch>=now-14400)) ||
  hold 'Fresh <=4-hour paired backup + restore required'

restore_artifact="postgres-isolated-restore-drill-$READER_S4_RESTORE_RUN_ID"
artifacts="$(gh api "repos/gycha0109-beep/MyeongHa/actions/runs/$READER_S4_RESTORE_RUN_ID/artifacts")" ||
  hold 'Cannot inspect restore evidence'
jq -e --arg name "$restore_artifact" '
  [.artifacts[] | select(.name==$name and .expired==false)] | length==1
' <<<"$artifacts" >/dev/null || hold 'Restore evidence artifact unavailable'
scratch="$(mktemp -d)"
cleanup() { rm -rf -- "$scratch"; }
trap cleanup EXIT
chmod 700 "$scratch"
gh run download "$READER_S4_RESTORE_RUN_ID" \
 -R gycha0109-beep/MyeongHa --name "$restore_artifact" --dir "$scratch" >/dev/null ||
  hold 'Cannot download paired restore evidence'
envelope="$scratch/restore-evidence.json"
[[ -f "$envelope" ]] || hold 'Restore evidence envelope missing'
jq -e --arg b "$READER_S4_BACKUP_RUN_ID" '
  .evidence_envelope_version=="myeongha-postgres-isolated-restore-evidence-envelope-v1"
  and (.backup_workflow_run_id | tostring)==$b
  and .project_ref=="cnsfpcdiyofqvhpcegfc"
  and .restore_target=="github-actions-loopback-supabase-postgres"
  and .member_auth_rate_limit_schema_restore=="pass"
  and .member_auth_rate_limit_acl_restore=="pass"
  and (.source_encrypted_sha256 | test("^[0-9a-f]{64}$"))
' "$envelope" >/dev/null || hold 'Invalid isolated restore provenance'
source_artifact="$(jq -er .source_artifact_name "$envelope")"
backups="$(gh api "repos/gycha0109-beep/MyeongHa/actions/runs/$READER_S4_BACKUP_RUN_ID/artifacts")" ||
  hold 'Cannot inspect source encrypted backup'
jq -e --arg name "$source_artifact" '
  [.artifacts[] | select(.name==$name and .expired==false)] | length==1
' <<<"$backups" >/dev/null || hold 'Original backup artifact expired/missing'

printf '%s' "$SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM" > "$scratch/ca.pem"
chmod 600 "$scratch/ca.pem"
export PGHOST="$SUPABASE_PRODUCTION_SESSION_POOLER_HOST" PGPORT=5432
export PGDATABASE=postgres PGUSER="postgres.$SUPABASE_PROJECT_ID"
export PGPASSWORD="$SUPABASE_DB_PASSWORD" PGSSLMODE=verify-full
export PGSSLROOTCERT="$scratch/ca.pem" PGCONNECT_TIMEOUT=10
current_frontier="$(PGOPTIONS='-c default_transaction_read_only=on' \
 psql -X -qAt -v ON_ERROR_STOP=1 -c \
 'select max(version) from supabase_migrations.schema_migrations')" ||
  hold 'Cannot read production migration frontier'
backup_frontier="$(jq -er '.backup_migration_frontier | tostring' "$envelope")" ||
  hold 'Backup frontier evidence missing'
[[ "$current_frontier" =~ ^[0-9]+$ &&
   "$backup_frontier" =~ ^[0-9]+$ &&
   "$current_frontier" == "$backup_frontier" ]] ||
  hold 'Production migration frontier changed since backup'

python3 scripts/operations/stage-official-reader-s4-production-migrations.py \
 --source-dir "$root/supabase/migrations" --output-dir "$scratch/stage" ||
  hold 'Exact 57-file Reader migration staging failed'
[[ "$(wc -l < "$scratch/stage/ordered-files.txt")" -eq 57 ]] ||
  hold 'Unexpected Reader migration count'
args=(-f "$root/scripts/operations/official-reader-s4-scoped-migration-pre.sql")
while IFS= read -r path; do
  [[ "$path" == "$root"/supabase/migrations/* && -f "$path" ]] ||
    hold 'Staged migration path escaped source directory'
  args+=(-f "$path")
done < "$scratch/stage/ordered-files.txt"
args+=(-f "$scratch/stage/history.sql")
args+=(-f "$root/scripts/operations/official-reader-s4-scoped-migration-post.sql")

echo 'SCOPED_READER_S4_BEGIN: only 1740..2300, paid/public OFF'
# The same backup frontier is re-checked inside the migration transaction,
# closing the gap between the read-only evidence probe and destructive DDL.
# Quoted array expansion preserves every exact, approved migration path.
psql -X -q --single-transaction -v ON_ERROR_STOP=1 \
  -v "expected_frontier=$backup_frontier" "${args[@]}" ||
  hold 'Atomic scoped migration failed; no successful transaction confirmed'
post="$(PGOPTIONS='-c default_transaction_read_only=on' \
 psql -X -qAt -v ON_ERROR_STOP=1 -c "
 select (select count(*) from supabase_migrations.schema_migrations
         where version ~ '^[0-9]{4}$'
           and version::int between 1740 and 2300)::text || ':' ||
        (pg_catalog.to_regclass('public.official_reader_paid_answer_bodies') is not null)::text || ':' ||
        (pg_catalog.to_regclass('public.official_reader_paid_answer_purge_jobs_v1') is not null)::text")" ||
  hold 'Cannot read post-commit Reader state'
[[ "$post" == '57:true:true' ]] ||
  hold 'Post-commit Reader state unexpected: investigate before activation'
echo 'PASS_READER_S4_SCOPED: 57 migrations + matching history, no paid activation'
