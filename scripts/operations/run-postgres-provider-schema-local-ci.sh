#!/usr/bin/env bash
# Schema-only Provider inventory in a disposable local Supabase stack.
# Watchtower-Track: ops
set -euo pipefail
umask 077
fail() { echo "HOLD_LOCAL_PROVIDER_SCHEMA_INVENTORY: $1" >&2; exit 1; }
[[ "${GITHUB_ACTIONS:-}" == true ]] || fail 'GitHub Actions only'
[[ "${GITHUB_REPOSITORY:-}" == 'gycha0109-beep/MyeongHa' ]] || fail 'Wrong repo'
[[ "${GITHUB_REF:-}" == 'refs/heads/main' ]] || fail 'Protected main only'
[[ "${MH_DR_CI_REPO_ROOT:-}" == "${GITHUB_WORKSPACE:-}" && -d "${MH_DR_CI_REPO_ROOT:-/unavailable}" ]] || fail 'Source root mismatch'
[[ -n "${GITHUB_RUN_ID:-}" && -n "${GITHUB_RUN_ATTEMPT:-}" && -n "${RUNNER_TEMP:-}" ]] || fail 'Runner identity missing'
[[ -z "${SUPABASE_ACCESS_TOKEN:-}" && -z "${SUPABASE_DB_PASSWORD:-}" && -z "${SUPABASE_PROJECT_ID:-}" && -z "${DATABASE_URL:-}" ]] || fail 'Hosted credentials forbidden'
for cmd in docker node jq; do command -v "$cmd" >/dev/null || fail 'Dependency missing'; done
docker info >/dev/null 2>&1 || fail 'Docker unavailable'
root="$MH_DR_CI_REPO_ROOT"
stack_dir="$(mktemp -d "$RUNNER_TEMP/myeongha-provider-schema.XXXXXX")"
network="myeongha-provider-schema-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
report="$RUNNER_TEMP/myeongha-provider-schema-inventory.json"
local_catalog="$stack_dir/local-catalog.private.json"
network_created=false
cleanup() {
  status=$?
  if [[ -f "$stack_dir/supabase/config.toml" ]]; then
    (cd "$stack_dir" && npx --yes supabase@2.122.0 stop --no-backup >/dev/null 2>&1) || true
  fi
  if [[ "$network_created" == true ]]; then
    docker network rm "$network" >/dev/null 2>&1 || true
  fi
  rm -rf "$stack_dir"
  exit "$status"
}
trap cleanup EXIT
docker network create \
  -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 \
  "$network" >"$stack_dir/docker-network.private.log" 2>&1 ||
  fail 'Loopback Docker network unavailable'
network_created=true
(
  cd "$stack_dir"
  npx --yes supabase@2.122.0 init >"$stack_dir/cli-init.private.log" 2>&1 ||
    fail 'Disposable local init failed'
  timeout 1200 npx --yes supabase@2.122.0 start \
    --network-id "$network" \
    -x imgproxy,realtime,edge-runtime,vector,studio,postgres-meta,mailpit,logflare \
    >"$stack_dir/cli-start.private.log" 2>&1 ||
    fail 'Disposable local stack start failed'
  npx --yes supabase@2.122.0 status -o env \
    >"$stack_dir/cli-status.private.env" 2>"$stack_dir/cli-status.private.log" ||
    fail 'Disposable stack status unavailable'
  set -a
  source "$stack_dir/cli-status.private.env"
  set +a
  [[ "${DB_URL:-}" == postgresql://postgres:*@127.0.0.1:54322/postgres ]] ||
    fail 'Not a fixed loopback local PostgreSQL'
  if ! command -v psql >/dev/null; then
    sudo apt-get update >/dev/null 2>&1 || fail 'PostgreSQL client bootstrap failed'
    sudo apt-get install -y postgresql-client >/dev/null 2>&1 || fail 'PostgreSQL client install failed'
  fi
  psql "$DB_URL" -X -qAt --set ON_ERROR_STOP=1 \
    --file "$root/scripts/operations/local-provider-schema-catalog-readonly.sql" \
    >"$local_catalog" 2>"$stack_dir/local-pg-read.private.log" ||
    fail 'Local read-only schema query failed'
)
[[ -s "$local_catalog" ]] || fail 'Local catalog missing'
MH_OPS_DISPOSABLE_PG17_ONLY=true \
  node "$root/scripts/operations/assess-postgres-provider-copy-local-schema.mjs" \
    --source "$root/docs/operations/POSTGRES_PROVIDER_COPY_SOURCE_GAP_20261111.json" \
    --local "$local_catalog" --output "$report"
jq -e '(.sourceMissingCopyBlocks == 29)
  and (.sourceMissingCopyRows == 66)
  and (.sourceProjectedCopyBlocks == 3)
  and (.sourceProjectedCopyRows == 27)
  and (.productionConnectionUsed == false)
  and (.sourceRowPayloadsRead == false)
  and (.targetRowPayloadsRead == false)
  and (.recoveredProductionProviderRows == 0)
  and (.providerManagedDataFullRestore == false)
  and (.hostedAuthenticationSessionRecoveryProven == false)
  and (.hostedStorageObjectBytesRecovered == false)
  and (.drReady == false)
  and (.serviceResumptionAllowed == false)
  and (.gate == "BLOCKED")' "$report" >/dev/null ||
  fail 'Source or non-acceptance boundary invalid'
{
  echo '### Ops: disposable local Provider schema compatibility'
  echo
  echo "- Source-missing relations present: $(jq -r '.previouslySkippedRelationsPresentInLocal' "$report")/29"
  echo "- Previously dropped source columns now present: $(jq -r '.previouslyProjectedSourceColumnsPresentInLocal' "$report")/$(jq -r '.previouslyProjectedSourceColumnCount' "$report")"
  echo '- Actual Production Provider rows restored: 0 (schema-only)'
  echo '- Hosted provider restore and service resumption: BLOCKED'
} >>"$GITHUB_STEP_SUMMARY"
echo 'LOCAL_PROVIDER_SCHEMA_INSPECTION_SUCCESS; Production untouched; DR blocked'
