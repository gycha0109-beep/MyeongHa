#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  echo "::error title=Isolated Hosted synthetic acceptance:: $1" >&2
  exit 1
}

[[ "${GITHUB_ACTIONS:-}" == 'true' ]] || fail 'GitHub Actions only.'
[[ "${GITHUB_REPOSITORY:-}" == 'gycha0109-beep/MyeongHa' ]] || fail 'Wrong repository.'
[[ "${GITHUB_REF:-}" == 'refs/heads/main' ]] || fail 'Protected main dispatch only.'
[[ -n "${GITHUB_RUN_ID:-}" && -n "${GITHUB_RUN_ATTEMPT:-}" && -n "${RUNNER_TEMP:-}" ]] || fail 'Ephemeral runner identity missing.'
[[ "${MH_DR_CI_REPO_ROOT:-}" == "${GITHUB_WORKSPACE:-}" && -d "${MH_DR_CI_REPO_ROOT:-/nonexistent}" ]] || fail 'Repository source root mismatch.'
[[ -z "${SUPABASE_ACCESS_TOKEN:-}" && -z "${SUPABASE_DB_PASSWORD:-}" && -z "${SUPABASE_PROJECT_ID:-}" && -z "${DATABASE_URL:-}" ]] || fail 'Hosted credentials or project binding must not be set.'
command -v docker >/dev/null || fail 'Docker CLI not present.'
docker info >/dev/null 2>&1 || fail 'Disposable runner Docker engine unavailable.'
command -v jq >/dev/null || fail 'jq required.'
command -v node >/dev/null || fail 'Node.js required.'

repo_root="$MH_DR_CI_REPO_ROOT"
stack_dir="$RUNNER_TEMP/myeongha-dr-local-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
[[ ! -e "$stack_dir" ]] || fail 'Local stack work directory already exists.'
mkdir -m 700 "$stack_dir"

cleanup() {
  if [[ -d "$stack_dir/supabase" ]]; then
    ( cd "$stack_dir" && npx --yes supabase@2.122.0 stop --no-backup >/dev/null 2>&1 ) || true
  fi
  rm -rf "$stack_dir"
}
trap cleanup EXIT
cd "$stack_dir"

# This temp project has no repository migrations, no Production link and no hosted secrets.
npx --yes supabase@2.122.0 init >"$stack_dir/cli-init.log" 2>&1 || fail 'Local CLI initialization failed.'
[[ -f "$stack_dir/supabase/config.toml" ]] || fail 'Isolated Supabase configuration absent.'
[[ ! -e "$stack_dir/supabase/.temp/project-ref" ]] || fail 'Hosted project link forbidden.'

# Auth, Storage, PostgREST, API gateway and PostgreSQL are required.
# Omit unused memory-heavy local services; never ignore stack health checks.
if ! npx --yes supabase@2.122.0 start -x imgproxy,realtime,edge-runtime,vector,studio,postgres-meta,mailpit,logflare >"$stack_dir/cli-start.log" 2>&1; then
  fail 'Local-only Supabase Auth/Storage stack failed to start. No Hosted resources were used.'
fi

npx --yes supabase@2.122.0 status -o env >"$stack_dir/local-status.env" 2>"$stack_dir/cli-status.log" || fail 'Local-only status unavailable.'
set -a
# CLI-generated environment file from this newly initialized loopback project.
source "$stack_dir/local-status.env"
set +a

[[ "${API_URL:-}" == 'http://127.0.0.1:54321' ]] || fail 'API URL is not the expected loopback instance.'
[[ -n "${ANON_KEY:-}" && -n "${SERVICE_ROLE_KEY:-}" && -n "${DB_URL:-}" ]] || fail 'Legacy synthetic local API and database credentials missing.'
[[ "$DB_URL" == postgresql://postgres:*@127.0.0.1:54322/postgres ]] || fail 'DB URL is not the expected local instance.'

export MH_DR_LOCAL_TARGET='http://127.0.0.1:54321'
export MH_DR_LOCAL_ANON_KEY="$ANON_KEY"
export MH_DR_LOCAL_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export MH_DR_LOCAL_DB_PASSWORD
MH_DR_LOCAL_DB_PASSWORD="$(node -p 'decodeURIComponent(new URL(process.env.DB_URL).password)')"
[[ -n "$MH_DR_LOCAL_DB_PASSWORD" ]] || fail 'Local DB password absent.'
export MH_DR_LOCAL_MEMBER_EMAIL="dr-synthetic-member-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}@example.test"
export MH_DR_LOCAL_DELETED_EMAIL="dr-synthetic-deleted-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}@example.test"
export MH_DR_LOCAL_MEMBER_PASSWORD
export MH_DR_LOCAL_DELETED_PASSWORD
MH_DR_LOCAL_MEMBER_PASSWORD="$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')"
MH_DR_LOCAL_DELETED_PASSWORD="$(node -p 'require("node:crypto").randomBytes(24).toString("hex")')"
export MH_DR_LOCAL_PRIVATE_BUCKET='dr-synthetic-private'
export MH_DR_LOCAL_OBJECT_PATH='probe/data.txt'
export MH_DR_LOCAL_OBJECT_SHA256='641ca9086ef039b62e8bd97b5813fed6dabd847c934e5d834d5c6746a9b4fee4'

echo "::add-mask::$MH_DR_LOCAL_ANON_KEY"
echo "::add-mask::$MH_DR_LOCAL_SERVICE_ROLE_KEY"
echo "::add-mask::$MH_DR_LOCAL_DB_PASSWORD"
echo "::add-mask::$MH_DR_LOCAL_MEMBER_PASSWORD"
echo "::add-mask::$MH_DR_LOCAL_DELETED_PASSWORD"

fixture="$stack_dir/fixture.json"
proof="$RUNNER_TEMP/myeongha-dr-synthetic-evidence.json"
node "$repo_root/scripts/prepare-postgres-hosted-synthetic-local-fixtures.mjs" >"$fixture" || fail 'Synthetic local fixture creation failed.'
jq -e '
  .schema == "myeongha-dr-synthetic-local-fixture-v1"
  and .productionDataUsed == false
  and .hostedRecoveryProven == false
  and .drReady == false
  and .serviceResumptionAllowed == false
  and .gate == "BLOCKED"
  and .outputContainsIdentifiers == false
' "$fixture" >/dev/null || fail 'Local fixture evidence invalid.'

node "$repo_root/scripts/run-postgres-hosted-synthetic-local-acceptance.mjs" >"$proof" || fail 'Real local Auth/Storage E2E failed.'
jq -e '
  .schema == "myeongha-hosted-recovery-synthetic-local-v1"
  and .target == "local-loopback-synthetic-only"
  and .positiveLogin == "PASS"
  and .wrongPasswordDenied == "PASS"
  and .deletedSyntheticLoginDenied == "PASS"
  and .refreshTokenRotation == "PASS"
  and .refreshAfterSignOutDenied == "PASS"
  and .privateStorageByteDigest == "PASS"
  and .anonymousStorageDenied == "PASS"
  and .hostedProviderRecoveryProven == false
  and .independentPrivacyContinuityProven == false
  and .wholeServiceRpoRtoProven == false
  and .providerManagedDataFullRestore == false
  and .futureSafePrivacyReconciliation == false
  and .drReady == false
  and .gate == "BLOCKED"
  and .serviceResumptionAllowed == false
  and .outputContainsIdentifiers == false
' "$proof" >/dev/null || fail 'Bounded result or fail-closed gate invalid.'

{
  echo '### Ops: real ephemeral local Auth/Storage (synthetic only)'
  echo
  echo '- Positive sign-in / wrong-password denial / deleted-user denial: PASS'
  echo '- Refresh token + sign-out revocation: PASS'
  echo '- Private object bytes verified + anonymous access denied: PASS'
  echo '- Source: disposable runner-local Supabase CLI 2.122.0, no Production project binding'
  echo '- Hosted recovery, privacy continuity, full-service RPO/RTO: **NOT PROVEN**'
  echo '- DR ready: false; serving admission: BLOCKED'
} >>"$GITHUB_STEP_SUMMARY"
echo 'SYNTHETIC_LOCAL_HOSTED_AUTH_STORAGE_PASS: 7/7, Production untouched, DR blocked.'
