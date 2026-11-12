#!/usr/bin/env bash
# Exact encrypted Production backup COPY metadata vs disposable local Provider schema.
# Does not insert user rows, export secrets, or contact Production DB.
# Watchtower-Track: ops
set -euo pipefail
umask 077
fail(){ echo "HOLD_PROVIDER_SEALED_COPY_PREFLIGHT: $1" >&2; exit 1; }
[[ "$GITHUB_ACTIONS" == true &&
   "$GITHUB_REPOSITORY" == gycha0109-beep/MyeongHa &&
   "$GITHUB_REF" == refs/heads/main ]] || fail 'Not protected main CI'
[[ "$MH_DR_CI_REPO_ROOT" == "$GITHUB_WORKSPACE" &&
   -d "$MH_DR_CI_REPO_ROOT" && -n "$RUNNER_TEMP" &&
   -n "$GITHUB_RUN_ID" && -n "$GITHUB_RUN_ATTEMPT" ]] || fail 'Missing CI identity'
[[ -z "$SUPABASE_ACCESS_TOKEN" &&
   -z "$SUPABASE_DB_PASSWORD" && -z "$SUPABASE_PROJECT_ID" &&
   -z "$DATABASE_URL" ]] || fail 'Hosted connection forbidden'
[[ "$(printf '%s' "$MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE" | wc -c)" -ge 32 ]] ||
  fail 'Gov backup secret absent'
[[ "$EXPECTED_PROJECT_REF" == 'cnsfpcdiyofqvhpcegfc' ]] || fail 'Wrong ref'
[[ "$EXPECTED_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'Invalid backup source SHA'
[[ "$BACKUP_ARTIFACT_DIR" == "$RUNNER_TEMP/backup-artifact" ]] || fail 'Unexpected backup directory'
for binary in docker node jq openssl sha256sum tar psql; do
  command -v "$binary" >/dev/null || fail 'Missing dependency'
done
docker info >/dev/null 2>&1 || fail 'Disposable Docker unavailable'
private="$(mktemp -d "$RUNNER_TEMP/myeongha-provider-sealed-preflight.XXXXXX")"
network="myeongha-provider-preflight-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
report="$RUNNER_TEMP/myeongha-provider-sealed-copy-preflight.json"
network_created=false
cleanup(){
  status=$?
  if [[ -f "$private/supabase/config.toml" ]]; then
    (cd "$private" && npx --yes supabase@3.1.0 stop --no-backup >/dev/null 2>&1) || true
  fi
  if [[ "$network_created" == true ]]; then
    docker network rm "$network" >/dev/null 2>&1 || true
  fi
  rm -rf "$private"
  exit "$status"
}
trap cleanup EXIT
archive="$(find "$BACKUP_ARTIFACT_DIR" -maxdepth 1 -type f -name '*.tar.gz.enc')"
manifest="$(find "$BACKUP_ARTIFACT_DIR" -maxdepth 1 -type f -name '*.manifest.json')"
[[ -f "$archive" && -f "$manifest" ]] || fail 'Artifact set malformed'
jq -e --arg ref "$EXPECTED_PROJECT_REF" --arg sha "$EXPECTED_SOURCE_SHA" \
  '.schema_version == "myeongha-postgres-backup-artifact-v1"
   and .project_ref == $ref and .source_sha == $sha
   and .encrypted_sha256 == "5396ceec4eca37f23c519c7e006fe0d8af27ad7f53ae7f54938fd9fc14f3a2d1"' \
  "$manifest" >/dev/null || fail 'Manifest/source mismatch'
[[ "$(sha256sum "$archive" | cut -d' ' -f1)" == \
   "5396ceec4eca37f23c519c7e006fe0d8af27ad7f53ae7f54938fd9fc14f3a2d1" ]] ||
  fail 'Encrypted digest mismatch'
docker network create \
  -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 \
  "$network" >"$private/network.private.log" 2>&1 ||
  fail 'Private loopback network unavailable'
network_created=true
(
  cd "$private"
  npx --yes supabase@3.1.0 init >"$private/init.private.log" 2>&1 ||
    fail 'Local Supabase init failed'
  timeout 1200 npx --yes supabase@3.1.0 start --network-id "$network" \
    -x imgproxy,realtime,edge-runtime,vector,studio,postgres-meta,mailpit,logflare \
    >"$private/start.private.log" 2>&1 ||
    fail 'Local Supabase stack start failed'
  npx --yes supabase@3.1.0 status -o env \
    >"$private/status.private.env" 2>"$private/status.private.log" ||
    fail 'Local status unavailable'
  set -a
  source "$private/status.private.env"
  set +a
  [[ "$DB_URL" == postgresql://postgres:*@127.0.0.1:54322/postgres ]] ||
    fail 'DB is not local loopback'
  psql "$DB_URL" -X -qAt --set ON_ERROR_STOP=1 \
    --file "$MH_DR_CI_REPO_ROOT/scripts/operations/local-provider-copy-target-columns-readonly.sql" \
    >"$private/target-catalog.private.json" 2>"$private/catalog.private.log" ||
    fail 'Read-only local Provider catalog failed'
)
[[ -s "$private/target-catalog.private.json" ]] || fail 'Target catalog absent'
# Decrypt only after local baseline succeeded. Contents stay in private temp.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$archive" -out "$private/sealed-private.tar.gz" \
  -pass env:MYEONGHA_BACKUP_ENCRYPTION_PASSPHRASE \
  >"$private/openssl.private.log" 2>&1 || fail 'Backup decryption failed'
tar -tzf "$private/sealed-private.tar.gz" | sed 's#^\./##' | sort \
  >"$private/archive-list.private.txt" || fail 'Archive listing failed'
printf '%s\n' data.sql manifest.json plaintext-sha256.txt roles.sql schema.sql source-app-catalog.json | sort \
  >"$private/archive-expected.private.txt"
cmp -s "$private/archive-list.private.txt" "$private/archive-expected.private.txt" ||
  fail 'Unexpected archive member'
tar -xzf "$private/sealed-private.tar.gz" -C "$private" --no-same-owner --no-same-permissions \
  >"$private/extract.private.log" 2>&1 || fail 'Private source extraction failed'
rm -f "$private/sealed-private.tar.gz"
[[ -s "$private/data.sql" ]] || fail 'Source data missing'
MH_OPS_PROTECTED_SOURCE_COPY_PREFLIGHT=true \
  node "$MH_DR_CI_REPO_ROOT/scripts/operations/inspect-sealed-provider-copy-headers.mjs" \
  --input "$private/data.sql" \
  --target "$private/target-catalog.private.json" \
  --evidence "$MH_DR_CI_REPO_ROOT/docs/operations/POSTGRES_PROVIDER_COPY_SOURCE_GAP_20261111.json" \
  --output "$report"
jq -e '
  .sourceBackupRunId == 42752268638
  and .historicalSkippedRelationCount == 29
  and .historicalProjectedRelationCount == 3
  and .sourceRowPayloadsEmitted == false
  and .actualProviderRowsInserted == 0
  and .providerManagedDataFullRestore == false
  and .authSessionRecoveryProven == false
  and .storageObjectBytesRecovered == false
  and .drReady == false and .serviceResumptionAllowed == false and .gate == "BLOCKED"
' "$report" >/dev/null || fail 'Non-acceptance evidence invalid'
if [[ "$MH_OPS_PROVIDER_DATA_REPLAY" == 'true' ]]; then
  jq -e '
    .allProviderCopyBlocksExact == true
    and .actualSourceCopyBlocks == 33
    and .actualSourceCopyRows == 93
    and .historicalSkippedRelationsNowExact == 29
    and .historicalProjectedRelationsNowExact == 3
    and .drReady == false
    and .serviceResumptionAllowed == false
  ' "$report" >/dev/null || fail 'Exact COPY-source admission failed'
  MH_OPS_PROVIDER_DATA_REPLAY=true \
    node "$MH_DR_CI_REPO_ROOT/scripts/operations/replay-sealed-provider-data-isolated.mjs" \
    --mode prepare \
    --source "$private/data.sql" \
    --catalog "$private/target-catalog.private.json" \
    --preflight "$report" \
    --gaps "$MH_DR_CI_REPO_ROOT/docs/operations/POSTGRES_PROVIDER_COPY_SOURCE_GAP_20261111.json" \
    --sql "$private/provider-only.private.sql" \
    --counts "$private/source-provider-counts.private.json" \
    --count-sql "$private/target-counts.private.sql" ||
    fail 'Exact Provider replay preparation failed'
  # Stop local API/Auth/Storage containers before injecting real backup rows.
  mapfile -t db_names < <(docker ps --filter "network=$network" \
    --format '{{.Names}}' | grep -E '^supabase_db_' || true)
  [[ "${#db_names[@]}" -eq 1 ]] || fail 'Exactly one isolated Postgres container required'
  mapfile -t services < <(docker ps --filter "network=$network" \
    --format '{{.Names}}' | grep -v -F -x "${db_names[0]}" || true)
  for service in "${services[@]}"; do
    [[ "$service" == supabase_* ]] || fail 'Unexpected container in isolation network'
    docker stop "$service" >"$private/stop-services.private.log" 2>&1 ||
      fail 'Could not stop private Supabase service'
  done
  set -a
  source "$private/status.private.env"
  set +a
  [[ "$DB_URL" == postgresql://postgres:*@127.0.0.1:54322/postgres ]] ||
    fail 'Local PostgreSQL connection boundary changed'
  psql "$DB_URL" -X -qAt --set ON_ERROR_STOP=1 \
    --file "$private/target-counts.private.sql" \
    >"$private/before-counts.private.json" 2>"$private/before-errors.private.log" ||
    fail 'Before-replay Provider counters unavailable'
  # PostgreSQL enforces constraints; transaction is all or nothing.
  # All SQL, COPY data and error output are private and deleted on exit.
  psql "$DB_URL" -X -q --single-transaction --set ON_ERROR_STOP=1 \
    --file "$private/provider-only.private.sql" \
    >"$private/replay-output.private.log" 2>"$private/replay-errors.private.log" ||
    fail 'Isolated PostgreSQL rejected Provider COPY or constraints'
  psql "$DB_URL" -X -qAt --set ON_ERROR_STOP=1 \
    --file "$private/target-counts.private.sql" \
    >"$private/after-counts.private.json" 2>"$private/after-errors.private.log" ||
    fail 'After-replay Provider counters unavailable'
  MH_OPS_PROVIDER_DATA_REPLAY=true \
    node "$MH_DR_CI_REPO_ROOT/scripts/operations/replay-sealed-provider-data-isolated.mjs" \
    --mode verify \
    --counts "$private/source-provider-counts.private.json" \
    --before "$private/before-counts.private.json" \
    --after "$private/after-counts.private.json" \
    --output "$RUNNER_TEMP/myeongha-provider-isolated-row-replay.json" ||
    fail 'Isolated target row counts differ from source'
  jq -e '
    .copiedSourceRows == 93
    and .isolatedTargetRowDelta == 93
    and .rowsCountVerified == true
    and .constraintsEnforcedOnCopy == true
    and .providerManagedFullRestoreProven == false
    and .drReady == false and .serviceResumptionAllowed == false
  ' "$RUNNER_TEMP/myeongha-provider-isolated-row-replay.json" >/dev/null ||
    fail 'Non-acceptance evidence violated'
  # Inspect only aggregate relational integrity after the 93-row transaction.
  # Auth services remain stopped; no source subject/token or table payload is emitted.
  psql "$DB_URL" -X -qAt --set ON_ERROR_STOP=1 \
    --file "$MH_DR_CI_REPO_ROOT/scripts/operations/local-provider-auth-reference-integrity-readonly.sql" \
    >"$private/auth-reference-snapshot.private.json" \
    2>"$private/auth-reference-errors.private.log" ||
    fail 'Isolated Auth relationship snapshot unavailable'
  MH_OPS_PROVIDER_DATA_REPLAY=true \
    node "$MH_DR_CI_REPO_ROOT/scripts/operations/assess-provider-auth-reference-integrity.mjs" \
    --snapshot "$private/auth-reference-snapshot.private.json" \
    --replay "$RUNNER_TEMP/myeongha-provider-isolated-row-replay.json" \
    --output "$RUNNER_TEMP/myeongha-provider-auth-reference-integrity.json" ||
    fail 'Auth references or local constraint validity failed'
  jq -e '
    .sourceBackupRunId == 42752268638
    and .rowCountsMatchSealedBackup == true
    and .orphanCount == 0
    and .allProviderForeignKeysValidated == true
    and .localAuthReferenceIntegrityObserved == true
    and .actualProductionAccountLoginVerified == false
    and .authRefreshRevocationSemanticsVerified == false
    and .hostedProviderRecoveryEquivalent == false
    and .providerMigrationLedgerEquivalent == false
    and .drReady == false and .serviceResumptionAllowed == false
    and .gate == "BLOCKED"
  ' "$RUNNER_TEMP/myeongha-provider-auth-reference-integrity.json" >/dev/null ||
    fail 'Auth reference report attempted authority escalation'
  # Read-only Provider migration ledger fingerprint. Source manifest was already
  # bound to the governed ciphertext; never alter migration history to match it.
  psql "$DB_URL" -X -qAt --set ON_ERROR_STOP=1 \
    --file "$MH_DR_CI_REPO_ROOT/scripts/operations/local-provider-migration-catalog-fingerprint-readonly.sql" \
    >"$private/migration-ledger-snapshot.private.json" \
    2>"$private/migration-ledger-errors.private.log" ||
    fail 'Disposable Provider migration ledger read-only query unavailable'
  MH_OPS_PROVIDER_DATA_REPLAY=true \
    node "$MH_DR_CI_REPO_ROOT/scripts/operations/assess-disposable-provider-migration-ledger.mjs" \
    --manifest "$manifest" \
    --target "$private/migration-ledger-snapshot.private.json" \
    --replay "$RUNNER_TEMP/myeongha-provider-isolated-row-replay.json" \
    --auth "$RUNNER_TEMP/myeongha-provider-auth-reference-integrity.json" \
    --output "$RUNNER_TEMP/myeongha-provider-migration-ledger-parity.json" ||
    fail 'Provider ledger metadata malformed'
  jq -e '
    .sourceBackupRunId == 42752268638
    and .sourceBackupMigrationCount == 242
    and .recoveredProviderCopyRows == 93
    and .localAuthReferenceIntegrityObserved == true
    and .migrationStatementPayloadPublished == false
    and .productionMigrationRepairPerformed == false
    and .providerMigrationLedgerRestored == false
    and .hostedProviderRecoveryProven == false
    and .drReady == false and .serviceResumptionAllowed == false
    and .gate == "BLOCKED"
  ' "$RUNNER_TEMP/myeongha-provider-migration-ledger-parity.json" >/dev/null ||
    fail 'Provider migration ledger report violated protected admission'
  {
    echo '### Ops: Provider migration catalog divergence (metadata only)'
    echo "- Source migration count: $(jq -r '.sourceBackupMigrationCount' "$RUNNER_TEMP/myeongha-provider-migration-ledger-parity.json")"
    echo "- Disposable local migration count: $(jq -r '.localMigrationNumericCount' "$RUNNER_TEMP/myeongha-provider-migration-ledger-parity.json")"
    echo "- Exact version/frontier/statement fingerprint match: $(jq -r '.allMetadataFingerprintsMatch' "$RUNNER_TEMP/myeongha-provider-migration-ledger-parity.json")"
    echo '- Local ledger is never rewritten; Provider/Hosted recovery remains BLOCKED'
  } >>"$GITHUB_STEP_SUMMARY"
  {
    echo '### Ops: isolated Auth relationship checks (no Hosted admission)'
    echo '- Source-exact recovered Auth tables: users, identities, sessions, refresh tokens, MFA claims'
    echo '- Parent-reference orphan counts and Provider FK validity: $(jq -r ".verdict" "$RUNNER_TEMP/myeongha-provider-auth-reference-integrity.json")'
    echo '- Auth login, token rotation and Hosted recovery: NOT PROVEN'
  } >>"$GITHUB_STEP_SUMMARY"
  {
    echo '### Ops: Actual Provider source COPY rows in disposable DB'
    echo '- Source Provider rows: 93; isolated PostgreSQL delta: 93'
    echo '- Provider/PostgreSQL constraints enforced; SQL replay atomic'
    echo '- Local API/Auth/Storage endpoints stopped before data injection'
    echo '- Hosted-equivalent recovery, privacy continuity and serving: BLOCKED'
  } >>"$GITHUB_STEP_SUMMARY"
fi
{
  echo '### Ops: governed source Provider COPY preflight (no data replay)'
  echo
  echo "- Previously missing source relations COPY-exact: $(jq -r '.historicalSkippedRelationsNowExact' "$report")/29"
  echo "- Previously projected source relations COPY-exact: $(jq -r '.historicalProjectedRelationsNowExact' "$report")/3"
  echo "- Remaining nonexact source relations: $(jq -r '.remainingIncompatibleRelations|length' "$report")"
  if [[ "$MH_OPS_PROVIDER_DATA_REPLAY" == 'true' ]]; then
    echo '- Provider row replay mode: 93 rows, local disposable DB only'
  else
    echo '- Provider row replay mode: disabled (zero rows inserted)'
  fi
  echo '- Production data and services untouched; DR ready/serving BLOCKED'
} >>"$GITHUB_STEP_SUMMARY"
if [[ "$MH_OPS_PROVIDER_DATA_REPLAY" == 'true' ]]; then
  echo 'SEALED_PROVIDER_ISOLATED_ROW_REPLAY_COMPLETE, DR blocked'
else
  echo 'SEALED_PROVIDER_COPY_HEADER_PREFLIGHT_COMPLETE; zero source rows inserted; DR blocked'
fi
