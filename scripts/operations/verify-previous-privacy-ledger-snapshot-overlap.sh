#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${PREVIOUS_LEDGER_ARTIFACT_DIR:?previous ledger artifact directory required}"
: "${CURRENT_PRIVACY_LEDGER_MANIFEST:?current privacy ledger manifest required}"
: "${PRIVACY_LEDGER_SNAPSHOT_OVERLAP_REPORT:?overlap report required}"
: "${MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE:?encryption root required}"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

mapfile -t encrypted < <(find "$PREVIOUS_LEDGER_ARTIFACT_DIR" -maxdepth 1 -type f -name 'myeongha-privacy-ledger-*.tar.gz.enc' -print)
mapfile -t checksums < <(find "$PREVIOUS_LEDGER_ARTIFACT_DIR" -maxdepth 1 -type f -name 'myeongha-privacy-ledger-*.tar.gz.enc.sha256' -print)
mapfile -t public < <(find "$PREVIOUS_LEDGER_ARTIFACT_DIR" -maxdepth 1 -type f -name 'myeongha-privacy-ledger-*.manifest.json' -print)
[[ "${#encrypted[@]}" -eq 1 && "${#checksums[@]}" -eq 1 && "${#public[@]}" -eq 1 ]] || {
  echo '::error title=Privacy ledger predecessor invalid::Expected exactly one encrypted archive, checksum, and public manifest.'
  exit 1
}
archive="${encrypted[0]}"
checksum="${checksums[0]}"
public_manifest="${public[0]}"
jq -e --arg archive_name "$(basename "$archive")" '
  .schema_version == "myeongha-postgres-privacy-recovery-ledger-artifact-v1"
  and .archive_name == $archive_name
  and (.encrypted_sha256 | type == "string" and test("^[a-f0-9]{64}$"))
  and .futureSafePrivacyReconciliation == false
  and .drReady == false
' "$public_manifest" >/dev/null

expected_sha="$(jq -er '.encrypted_sha256' "$public_manifest")"
[[ "$(sha256sum "$archive" | awk '{print $1}')" == "$expected_sha" ]] || {
  echo '::error title=Privacy ledger predecessor invalid::Ciphertext digest mismatch.'
  exit 1
}
(
  cd "$PREVIOUS_LEDGER_ARTIFACT_DIR"
  sha256sum -c "$(basename "$checksum")" >/dev/null
)

# Derivation matches the existing governed privacy-ledger export/replay scripts.
derived_passphrase="$(python3 - <<'PY'
import base64, hashlib, hmac, os
root = os.environ["MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE"].encode("utf-8")
print(base64.b64encode(hmac.new(
    root, b"myeongha-postgres-privacy-recovery-ledger-v1", hashlib.sha256
).digest()).decode("ascii"))
PY
)"
export MYEONGHA_PRIVACY_LEDGER_DERIVED_PASSPHRASE="$derived_passphrase"
echo "::add-mask::$MYEONGHA_PRIVACY_LEDGER_DERIVED_PASSPHRASE"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$archive" -out "$work_dir/predecessor.tar.gz" \
  -pass env:MYEONGHA_PRIVACY_LEDGER_DERIVED_PASSPHRASE
tar -tzf "$work_dir/predecessor.tar.gz" | sed 's#^./##' | sort > "$work_dir/list.txt"
printf '%s\n' plaintext-sha256.txt privacy-reconciliation-manifest.json | sort > "$work_dir/expected.txt"
cmp -s "$work_dir/list.txt" "$work_dir/expected.txt" || {
  echo '::error title=Privacy ledger predecessor invalid::Unexpected encrypted archive members.'
  exit 1
}
tar -xzf "$work_dir/predecessor.tar.gz" -C "$work_dir"
(
  cd "$work_dir"
  sha256sum -c plaintext-sha256.txt >/dev/null
)

node scripts/validate-postgres-privacy-ledger-snapshot-overlap.mjs \
  --previous "$work_dir/privacy-reconciliation-manifest.json" \
  --current "$CURRENT_PRIVACY_LEDGER_MANIFEST" \
  --report "$PRIVACY_LEDGER_SNAPSHOT_OVERLAP_REPORT"
jq -e '
  .sourceContinuityProven == false
  and .futureSafePrivacyReconciliation == false
  and .drReady == false
  and .outputContainsIdentifiers == false
  and (.snapshotOverlapStatus == "OVERLAPPING_CAPTURED_EVENTS_PRESERVED"
       or .snapshotOverlapStatus == "BACKUP_ADVANCED_WITHOUT_OVERLAP_PROOF")
' "$PRIVACY_LEDGER_SNAPSHOT_OVERLAP_REPORT" >/dev/null

echo 'Privacy ledger previous encrypted snapshot comparison completed; no future-safe source continuity claim.'
