#!/usr/bin/env bash
set -euo pipefail
mapfile -t public_manifests < <(
  find "$BACKUP_ARTIFACT_DIR" -maxdepth 1 -type f -name '*.manifest.json' -print
)
[[ "${#public_manifests[@]}" -eq 1 ]]
export PRIVACY_RECONCILIATION_BACKUP_COMPLETED_AT_UTC
PRIVACY_RECONCILIATION_BACKUP_COMPLETED_AT_UTC="$(
  jq -er '.created_at_utc' "${public_manifests[0]}"
)"

bash scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh
