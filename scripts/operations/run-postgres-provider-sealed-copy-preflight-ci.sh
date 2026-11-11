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
{
  echo '### Ops: governed source Provider COPY preflight (no data replay)'
  echo
  echo "- Previously missing source relations COPY-exact: $(jq -r '.historicalSkippedRelationsNowExact' "$report")/29"
  echo "- Previously projected source relations COPY-exact: $(jq -r '.historicalProjectedRelationsNowExact' "$report")/3"
  echo "- Remaining nonexact source relations: $(jq -r '.remainingIncompatibleRelations|length' "$report")"
  echo '- Actual rows inserted: 0; Production data and services untouched'
  echo '- DR ready/serving: BLOCKED'
} >>"$GITHUB_STEP_SUMMARY"
echo 'SEALED_PROVIDER_COPY_HEADER_PREFLIGHT_COMPLETE; zero source rows inserted; DR blocked'
