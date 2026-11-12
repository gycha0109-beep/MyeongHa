#!/usr/bin/env bash
# Opt-in, read-only Production Provider ledger capture into encrypted-only artifact.
# Runs inside the existing governed backup job; no remote DDL/DML or history repair.
# Watchtower-Track: ops
set -euo pipefail
umask 077
fail(){ echo 'HOLD_PROVIDER_LEDGER_SOURCE_ESCROW' >&2; exit 1; }
[[ "${MH_OPS_CAPTURE_PROVIDER_LEDGER:-false}" == 'true' ]] || fail
[[ "${GITHUB_ACTIONS:-false}" == 'true' &&
   "${GITHUB_EVENT_NAME:-}" == 'workflow_dispatch' &&
   "${GITHUB_REF:-}" == 'refs/heads/main' ]] || fail
[[ "${SUPABASE_PROJECT_ID:-}" == 'cnsfpcdiyofqvhpcegfc' ]] || fail
[[ "${PGSSLMODE:-}" == 'verify-full' && -f "${PGSSLROOTCERT:-/dev/null}" ]] || fail
[[ -n "${PGHOST:-}" && -n "${PGPORT:-}" && -n "${PGUSER:-}" &&
   -n "${PGPASSWORD:-}" && -n "${PGDATABASE:-}" ]] || fail
[[ "${#MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE}" -ge 32 ]] || fail
[[ -n "${GITHUB_OUTPUT:-}" && -n "${RUNNER_TEMP:-}" ]] || fail
[[ "$#" -eq 4 ]] || fail
count="$1"; frontier="$2"; catalog_sha="$3"; stamp="$4"
[[ "$count" =~ ^[0-9]+$ && "$frontier" =~ ^[0-9]+$ &&
   "$catalog_sha" =~ ^[a-f0-9]{64}$ &&
   "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || fail
for cmd in psql jq node openssl tar sha256sum; do
  command -v "$cmd" >/dev/null || fail
done
private="$(mktemp -d "$RUNNER_TEMP/provider-migration-ledger-source.XXXXXX")" || fail
cleanup(){
  status=$?
  rm -rf "$private"
  exit "$status"
}
trap cleanup EXIT
source_file="$private/source-provider-migration-ledger.json"
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=90000' \
  psql -X -qAt --set ON_ERROR_STOP=1 \
    --file scripts/operations/production-provider-migration-ledger-sealed-source-readonly.sql \
    >"$source_file" 2>"$private/private-query-errors.log" || fail
[[ -s "$source_file" ]] || fail
MH_OPS_CAPTURE_PROVIDER_LEDGER=true node \
  scripts/operations/assess-production-provider-migration-ledger-source.mjs \
  --source "$source_file" --report "$private/validation.json" \
  --expected-count "$count" --expected-frontier "$frontier" \
  --expected-sha256 "$catalog_sha" || fail
jq -e --arg sha "$catalog_sha" --argjson count "$count" \
  '.schemaVersion == "ops-provider-migration-sealed-source-verification-v1"
    and .sourceLedgerHistoryCaptured == true
    and .sourceLedgerRowsRestored == false
    and .providerMigrationLedgerRestored == false
    and .hostedProviderRecoveryProven == false
    and .migrationCount == $count
    and .migrationCatalogSha256 == $sha
    and .drReady == false and .serviceResumptionAllowed == false' \
  "$private/validation.json" >/dev/null || fail
# Only the encrypted archive is moved outside the immediately deleted private dir.
tar -C "$private" -czf "$private/private-bundle.tar.gz" \
  source-provider-migration-ledger.json validation.json || fail
archive="$RUNNER_TEMP/myeongha-provider-migration-ledger-${stamp}.tar.gz.enc"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "$private/private-bundle.tar.gz" -out "$archive" \
  -pass env:MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE \
  >"$private/private-encryption.log" 2>&1 || fail
[[ -s "$archive" ]] || fail
archive_sha="$(sha256sum "$archive" | cut -d' ' -f1)"
printf '%s  %s\n' "$archive_sha" "$(basename "$archive")" > "$archive.sha256"
public="$RUNNER_TEMP/myeongha-provider-migration-ledger-${stamp}.manifest.json"
jq -n --arg ref "$SUPABASE_PROJECT_ID" --arg source "$GITHUB_SHA" \
  --arg archive_sha "$archive_sha" --arg catalog_sha "$catalog_sha" \
  --argjson count "$count" --argjson frontier "$frontier" \
  --arg source_packet_sha "$(jq -er '.sourcePacketSha256' "$private/validation.json")" \
  '{
    schemaVersion:"ops-provider-migration-sealed-source-artifact-v1",
    projectRef:$ref,sourceWorkflowCommitSha:$source,
    migrationCount:$count,migrationFrontier:$frontier,
    migrationCatalogSha256:$catalog_sha,
    sourcePacketSha256:$source_packet_sha,
    encryptedArchiveSha256:$archive_sha,
    containsPlaintextMigrationStatements:false,
    sourceStoredInEncryptedArtifactOnly:true,
    providerMigrationLedgerRestored:false,
    hostedProviderRecoveryProven:false,
    drReady:false,serviceResumptionAllowed:false,
    verdict:"SOURCE_LEDGER_SEALED__HOSTED_DR_HOLD"
  }' >"$public" || fail
{
  echo "provider_ledger_archive=$archive"
  echo "provider_ledger_checksum=$archive.sha256"
  echo "provider_ledger_public_manifest=$public"
  echo "provider_ledger_artifact_name=myeongha-provider-migration-ledger-${stamp}"
} >>"$GITHUB_OUTPUT"
echo 'PROVIDER_LEDGER_SOURCE_ENCRYPTED_ONLY DR_BLOCKED'
