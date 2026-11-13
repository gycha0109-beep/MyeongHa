#!/usr/bin/env bash
# Decrypt the original source ledger only inside a protected disposable runner.
# No migration history replay, remote writes, user SQL logs, or plaintext artifacts.
# Watchtower-Track: ops
set -euo pipefail
umask 077
fail() { echo 'HOLD_PAIRED_PROVIDER_SOURCE_RECOVERY' >&2; exit 1; }
[[ "${GITHUB_ACTIONS:-false}" == 'true' &&
   "${GITHUB_EVENT_NAME:-}" == 'workflow_dispatch' &&
   "${GITHUB_REF:-}" == 'refs/heads/main' ]] || fail
[[ -n "${RUNNER_TEMP:-}" && -n "${BACKUP_ARTIFACT_DIR:-}" &&
   -n "${PROVIDER_LEDGER_ARTIFACT_DIR:-}" &&
   -n "${PAIRED_PROVIDER_SOURCE_EVIDENCE_PATH:-}" ]] || fail
[[ "$BACKUP_ARTIFACT_DIR" == "$RUNNER_TEMP/"* &&
   "$PROVIDER_LEDGER_ARTIFACT_DIR" == "$RUNNER_TEMP/"* &&
   "$PAIRED_PROVIDER_SOURCE_EVIDENCE_PATH" == "$RUNNER_TEMP/"* ]] || fail
[[ "${BACKUP_RUN_ID:-}" =~ ^[1-9][0-9]*$ &&
   "${EXPECTED_SOURCE_SHA:-}" =~ ^[a-f0-9]{40}$ ]] || fail
[[ "${#MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE}" -ge 32 ]] || fail
for cmd in jq node openssl tar sha256sum; do command -v "$cmd" >/dev/null || fail; done
shopt -s nullglob
backups=("$BACKUP_ARTIFACT_DIR"/myeongha-postgres-*.manifest.json)
archives=("$PROVIDER_LEDGER_ARTIFACT_DIR"/*.tar.gz.enc)
checksums=("$PROVIDER_LEDGER_ARTIFACT_DIR"/*.tar.gz.enc.sha256)
manifests=("$PROVIDER_LEDGER_ARTIFACT_DIR"/*.manifest.json)
shopt -u nullglob
[[ "${#backups[@]}" -eq 1 && "${#archives[@]}" -eq 1 &&
   "${#checksums[@]}" -eq 1 && "${#manifests[@]}" -eq 1 ]] || fail
backup="${backups[0]}"
archive="${archives[0]}"
checksum="${checksums[0]}"
sealed="${manifests[0]}"
backup_name="$(basename "$backup")"
[[ "$backup_name" =~ ^myeongha-postgres-([0-9]{8}T[0-9]{6}Z)\.manifest\.json$ ]] || fail
stamp="${BASH_REMATCH[1]}"
[[ "$(basename "$sealed")" == "myeongha-provider-migration-ledger-${stamp}.manifest.json" &&
   "$(basename "$archive")" == "myeongha-provider-migration-ledger-${stamp}.tar.gz.enc" &&
   "$(basename "$checksum")" == "myeongha-provider-migration-ledger-${stamp}.tar.gz.enc.sha256" ]] || fail
[[ "$(jq -er '.source_sha' "$backup")" == "$EXPECTED_SOURCE_SHA" ]] || fail
[[ "$(jq -er '.sourceWorkflowCommitSha' "$sealed")" == "$EXPECTED_SOURCE_SHA" ]] || fail
[[ "$(sha256sum "$archive" | cut -d' ' -f1)" == \
   "$(jq -er '.encryptedArchiveSha256' "$sealed")" ]] || fail
( cd "$PROVIDER_LEDGER_ARTIFACT_DIR" &&
  sha256sum -c "$(basename "$checksum")" >/dev/null ) || fail
private="$(mktemp -d "$RUNNER_TEMP/provider-ledger-recovery.XXXXXX")" || fail
cleanup() { status=$?; rm -rf "$private"; exit "$status"; }
trap cleanup EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$archive" -out "$private/bundle.tar.gz" \
  -pass env:MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE \
  >"$private/decrypt.log" 2>&1 || fail
listing="$(tar -tzf "$private/bundle.tar.gz" 2>"$private/tar.log" \
  | sed 's#^\./##' | sort)" || fail
[[ "$listing" == $'source-provider-migration-ledger.json\nvalidation.json' ]] || fail
# Reject links/devices: these two members must be ordinary files.
[[ "$(tar -tvzf "$private/bundle.tar.gz" | awk 'substr($1,1,1) != "-" {bad++} END {print bad+0}')" == '0' ]] || fail
tar -xzf "$private/bundle.tar.gz" -C "$private" \
  >"$private/extract.log" 2>&1 || fail
[[ -f "$private/source-provider-migration-ledger.json" &&
   ! -L "$private/source-provider-migration-ledger.json" &&
   -f "$private/validation.json" && ! -L "$private/validation.json" ]] || fail
node scripts/operations/verify-paired-provider-migration-source-recovery.mjs \
  --backup-run-id "$BACKUP_RUN_ID" \
  --backup-manifest "$backup" \
  --sealed-manifest "$sealed" \
  --original-verification "$private/validation.json" \
  --source-packet "$private/source-provider-migration-ledger.json" \
  --encrypted-archive "$archive" \
  --output "$PAIRED_PROVIDER_SOURCE_EVIDENCE_PATH" || fail
jq -e '.encryptedSourceDecryptionVerified == true
  and .originalHistoryPayloadIntegrityVerified == true
  and .sourceLedgerRowsRestored == false
  and .providerMigrationLedgerRestored == false
  and .hostedProviderRecoveryProven == false
  and .drReady == false and .serviceResumptionAllowed == false' \
  "$PAIRED_PROVIDER_SOURCE_EVIDENCE_PATH" >/dev/null || fail
# Compare only version/name metadata against the exact checked-out main.
# Original statement-bearing packet stays inside private temp; public output
# contains version IDs and counts, never historical SQL or operator identities.
[[ -n "${MIGRATION_LINEAGE_EVIDENCE_PATH:-}" &&
   "$MIGRATION_LINEAGE_EVIDENCE_PATH" == "$RUNNER_TEMP/"* ]] || fail
node scripts/operations/assess-sealed-provider-migration-file-lineage.mjs \
  --source "$private/source-provider-migration-ledger.json" \
  --paired-proof "$PAIRED_PROVIDER_SOURCE_EVIDENCE_PATH" \
  --output "$MIGRATION_LINEAGE_EVIDENCE_PATH" || fail
jq -e '.schemaVersion == "ops-sealed-provider-migration-file-lineage-v1"
  and .sourceVersionCount > 0
  and .commonVersionCount + .remoteOnlyVersionCount == .sourceVersionCount
  and (.newRemoteOnlySinceBaselineIds | type) == "array"' \
  "$MIGRATION_LINEAGE_EVIDENCE_PATH" >/dev/null || fail
jq -e '.originalSqlBodiesPublished == false
  and .operatorProvenancePublished == false
  and .sourceLedgerHistoryRowsRestored == false
  and .migrationHistoryRepaired == false
  and .appliedSqlAndCurrentDdlEquivalenceProven == false
  and .hostedProviderRestoreProven == false
  and .drReady == false and .serviceResumptionAllowed == false' \
  "$MIGRATION_LINEAGE_EVIDENCE_PATH" >/dev/null || fail
echo 'EXACT_MAIN_MIGRATION_FILE_LINEAGE_OBSERVED DR_HOLD'

echo 'PAIRED_SOURCE_RECOVERABILITY_PASS TARGET_PROVIDER_LEDGER_HOLD'
