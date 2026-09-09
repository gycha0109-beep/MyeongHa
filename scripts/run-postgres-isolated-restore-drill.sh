#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_ARTIFACT_DIR:?BACKUP_ARTIFACT_DIR is required}"
: "${MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE:?MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${EXPECTED_PROJECT_REF:?EXPECTED_PROJECT_REF is required}"
: "${EXPECTED_SOURCE_SHA:?EXPECTED_SOURCE_SHA is required}"
: "${RESTORE_EVIDENCE_PATH:?RESTORE_EVIDENCE_PATH is required}"

if [[ "${#MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE}" -lt 32 ]]; then
  echo 'Backup passphrase must be at least 32 characters.' >&2
  exit 1
fi
if [[ ! "$EXPECTED_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'EXPECTED_SOURCE_SHA must be a 40-character Git SHA.' >&2
  exit 1
fi

# Safety invariant: this harness has no remote restore target input.
# It can only connect to the ephemeral PostgreSQL service exposed on loopback.
readonly RESTORE_DATABASE_URL='postgresql://postgres:restore-drill@127.0.0.1:5432/postgres'

shopt -s nullglob
archives=("$BACKUP_ARTIFACT_DIR"/*.tar.gz.enc)
checksums=("$BACKUP_ARTIFACT_DIR"/*.tar.gz.enc.sha256)
manifests=("$BACKUP_ARTIFACT_DIR"/*.manifest.json)
shopt -u nullglob

if [[ ${#archives[@]} -ne 1 || ${#checksums[@]} -ne 1 || ${#manifests[@]} -ne 1 ]]; then
  echo 'Expected exactly one encrypted archive, checksum, and public manifest.' >&2
  exit 1
fi

archive="${archives[0]}"
checksum="${checksums[0]}"
manifest="${manifests[0]}"

[[ "$(jq -er '.schema_version' "$manifest")" == 'myeongha-postgres-backup-artifact-v1' ]]
[[ "$(jq -er '.project_ref' "$manifest")" == "$EXPECTED_PROJECT_REF" ]]
[[ "$(jq -er '.source_sha' "$manifest")" == "$EXPECTED_SOURCE_SHA" ]]
[[ "$(jq -er '.archive_name' "$manifest")" == "$(basename "$archive")" ]]
expected_cipher_sha="$(jq -er '.encrypted_sha256' "$manifest")"
[[ "$expected_cipher_sha" =~ ^[0-9a-f]{64}$ ]]
[[ "$(sha256sum "$archive" | awk '{print $1}')" == "$expected_cipher_sha" ]]

(
  cd "$BACKUP_ARTIFACT_DIR"
  sha256sum -c "$(basename "$checksum")"
)

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$archive" \
  -out "$work_dir/restore.tar.gz" \
  -pass env:MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE

tar -tzf "$work_dir/restore.tar.gz" | sed 's#^\./##' | sort > "$work_dir/listing.txt"
printf '%s\n' data.sql manifest.json plaintext-sha256.txt roles.sql schema.sql | sort > "$work_dir/expected.txt"
cmp -s "$work_dir/listing.txt" "$work_dir/expected.txt"
! grep -Eq '(^/|(^|/)\.\.(/|$))' "$work_dir/listing.txt"

tar -xzf "$work_dir/restore.tar.gz" -C "$work_dir"
rm -f "$work_dir/restore.tar.gz"
(
  cd "$work_dir"
  sha256sum -c plaintext-sha256.txt
)

[[ "$(jq -er '.schema_version' "$work_dir/manifest.json")" == 'myeongha-postgres-logical-backup-v1' ]]
[[ "$(jq -er '.project_ref' "$work_dir/manifest.json")" == "$EXPECTED_PROJECT_REF" ]]
[[ "$(jq -er '.source_sha' "$work_dir/manifest.json")" == "$EXPECTED_SOURCE_SHA" ]]

restore_started_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
restore_started_epoch="$(date -u +%s)"

psql "$RESTORE_DATABASE_URL" --set ON_ERROR_STOP=1 --file "$work_dir/roles.sql"
psql "$RESTORE_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 --file "$work_dir/schema.sql"
psql "$RESTORE_DATABASE_URL" --single-transaction --set ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' --file "$work_dir/data.sql"

# Baseline structural and authorization checks. No user-owned row contents are emitted.
for table_name in subjects birth_profiles products product_offers data_deletion_jobs; do
  [[ "$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c "select to_regclass('public.${table_name}') is not null;")" == 't' ]]
done
[[ "$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c "select count(*) from pg_roles where rolname='myeongha_api_executor' and not rolsuper and not rolbypassrls;")" == '1' ]]

restore_completed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
restore_completed_epoch="$(date -u +%s)"
duration_seconds=$((restore_completed_epoch - restore_started_epoch))
server_version="$(psql "$RESTORE_DATABASE_URL" -At --set ON_ERROR_STOP=1 -c 'show server_version;')"

mkdir -p "$(dirname "$RESTORE_EVIDENCE_PATH")"
jq -n \
  --arg schema_version 'myeongha-postgres-isolated-restore-drill-v1' \
  --arg source_sha "$EXPECTED_SOURCE_SHA" \
  --arg project_ref "$EXPECTED_PROJECT_REF" \
  --arg restore_server_version "$server_version" \
  --arg restore_started_at_utc "$restore_started_at" \
  --arg restore_completed_at_utc "$restore_completed_at" \
  --argjson isolated_restore_validation_duration_seconds "$duration_seconds" \
  '{
    schema_version: $schema_version,
    source_sha: $source_sha,
    project_ref: $project_ref,
    restore_target: "github-actions-loopback-postgres",
    restore_server_version: $restore_server_version,
    restore_started_at_utc: $restore_started_at_utc,
    restore_completed_at_utc: $restore_completed_at_utc,
    isolated_restore_validation_duration_seconds: $isolated_restore_validation_duration_seconds,
    archive_integrity: "pass",
    required_tables: "pass",
    authorization_baseline: "pass",
    privacy_reconciliation: "not_exercised_by_this_workflow",
    dr_ready: false
  }' > "$RESTORE_EVIDENCE_PATH"

chmod 600 "$RESTORE_EVIDENCE_PATH"
echo 'Isolated PostgreSQL restore drill harness completed.'
