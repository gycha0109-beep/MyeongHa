#!/usr/bin/env bash
set -euo pipefail
mapfile -t public_manifests < <(
  find "$BACKUP_ARTIFACT_DIR" -maxdepth 1 -type f -name '*.manifest.json' -print
)
[[ "${#public_manifests[@]}" -eq 1 ]]

node scripts/build-postgres-restore-evidence-envelope.mjs \
  --restore-evidence "$RESTORE_EVIDENCE_PATH" \
  --backup-manifest "${public_manifests[0]}" \
  --output "$RESTORE_EVIDENCE_PATH.enveloped" \
  --backup-run-id "$BACKUP_RUN_ID" \
  --incident-reference-utc "$INCIDENT_REFERENCE_UTC" \
  --source-artifact-name "$SOURCE_ARTIFACT_NAME" \
  --source-artifact-expires-at "$SOURCE_ARTIFACT_EXPIRES_AT"

mv "$RESTORE_EVIDENCE_PATH.enveloped" "$RESTORE_EVIDENCE_PATH"
chmod 600 "$RESTORE_EVIDENCE_PATH"
