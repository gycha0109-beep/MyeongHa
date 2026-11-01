#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() {
  echo "::error title=Isolated PG18 authority and capacity::${1}" >&2
  exit 1
}

[[ "${GITHUB_ACTIONS:-}" == 'true' ]] || fail 'GitHub Actions only.'
[[ "${GITHUB_REPOSITORY:-}" == 'gycha0109-beep/MyeongHa' ]] || fail 'Wrong repository.'
[[ "${GITHUB_REF:-}" == 'refs/heads/main' ]] || fail 'The manual main branch is required.'
[[ "${GITHUB_EVENT_NAME:-}" == 'workflow_dispatch' ]] || fail 'Manual operator invocation is required.'
[[ -n "${GITHUB_RUN_ID:-}" && -n "${RUNNER_TEMP:-}" ]] || fail 'Ephemeral runner identity missing.'
[[ "${MH_OPS_REPO_ROOT:-}" == "${GITHUB_WORKSPACE:-}" && -d "${MH_OPS_REPO_ROOT:-/nonexistent}" ]] || fail 'Repository checkout mismatch.'
[[ -z "${DATABASE_URL:-}" && -z "${SUPABASE_DB_PASSWORD:-}" && -z "${SUPABASE_ACCESS_TOKEN:-}" && -z "${SUPABASE_PROJECT_ID:-}" ]] || fail 'Hosted database/project credentials are forbidden.'
[[ "${PG_BIN_DIR:-}" == '/usr/lib/postgresql/18/bin' ]] || fail 'Exact PostgreSQL 18 local binary directory required.'
for bin in initdb pg_ctl pg_config; do
  [[ -x "$PG_BIN_DIR/$bin" ]] || fail "Missing PostgreSQL 18 executable: $bin."
done
[[ "$("$PG_BIN_DIR/pg_config" --version)" =~ ^PostgreSQL[[:space:]]18\. ]] || fail 'PostgreSQL server version mismatch.'
command -v jq >/dev/null || fail 'jq required.'
command -v node >/dev/null || fail 'Node.js required.'

proof="$RUNNER_TEMP/myeongha-ops-isolated-pg18-proof.json"
scratch="$(mktemp -d "$RUNNER_TEMP/myeongha-ops-pg18-XXXXXX")"
cleanup() {
  local code=$?
  if (( code != 0 )); then
    cat > "$proof" <<'JSON'
{
  "schema": "myeongha-ops-isolated-pg18-phase7-phase11-v1",
  "scope": "temporary-github-runner-local-postgres18",
  "status": "BLOCKED_INCOMPLETE",
  "realIsolatedRlsProven": false,
  "isolatedPoolSaturationProven": false,
  "productionRlsProven": false,
  "productionCapacityProven": false,
  "sajuResourceCeilingProven": false,
  "scalingThresholdApproved": false,
  "drReady": false,
  "serviceResumptionAllowed": false,
  "outputContainsIdentifiers": false
}
JSON
  fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT

cd "$MH_OPS_REPO_ROOT"
export PG_BIN_DIR
if ! ./node_modules/.bin/vitest run test/postgres-subject-rls-isolated-phase7.test.ts --reporter=verbose >"$scratch/rls.log" 2>&1; then
  fail 'Real PostgreSQL subject execution/RLS integration test failed.'
fi
grep -F 'MYEONGHA_ISOLATED_POSTGRES_RLS_PHASE7_PASS' "$scratch/rls.log" >/dev/null \
  || fail 'Actual isolated RLS evidence missing (skipped tests cannot pass).'
grep -F '1 passed' "$scratch/rls.log" >/dev/null \
  || fail 'Exactly one real isolated RLS test must pass.'
echo 'PASS real ephemeral PostgreSQL 18 subject transaction and RLS isolation: 1/1'

if ! node scripts/operations/measure-isolated-postgres-capacity-phase11.mjs >"$scratch/capacity.json"; then
  fail 'Actual isolated PostgreSQL pool pressure/recovery measurement failed.'
fi
jq -e '
  .schema == "myeongha-isolated-postgres-capacity-phase11-v1"
  and .result == "PASS"
  and .target == "ephemeral PostgreSQL on 127.0.0.1"
  and .dataPrivacy == "synthetic_sql_only"
  and .poolMax == 2
  and .totalRequested == 96
  and (.observations | length) == 4
  and [.observations[].concurrency] == [1,2,4,8]
  and (.observations[0].completed == 20 and .observations[0].acquireTimeouts == 0)
  and (.observations[1].completed == 20 and .observations[1].acquireTimeouts == 0)
  and (.observations[3].acquireTimeouts > 0)
  and ([.observations[].observedPeakConnections] | all(. <= 2))
  and .postSaturationRecovery == true
  and .productionCapacityProven == false
  and .realMyeonghaQueriesMeasured == false
  and .scalingThresholdApproved == false
' "$scratch/capacity.json" >/dev/null || fail 'Isolated capacity measurements failed exact safety contract.'
echo 'PASS real ephemeral PostgreSQL 18 synthetic pool saturation and post-pressure recovery'

jq -n --slurpfile metrics "$scratch/capacity.json" '{
  schema: "myeongha-ops-isolated-pg18-phase7-phase11-v1",
  scope: "temporary-github-runner-local-postgres18",
  status: "PASS",
  realIsolatedRlsProven: true,
  isolatedRlsCaseCount: 1,
  isolatedPoolSaturationProven: true,
  syntheticCapacityMeasurements: $metrics[0],
  productionRlsProven: false,
  productionCapacityProven: false,
  sajuResourceCeilingProven: false,
  scalingThresholdApproved: false,
  drReady: false,
  serviceResumptionAllowed: false,
  outputContainsIdentifiers: false
}' > "$proof"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo '### Operations Phase 7 + 11 — actual disposable PostgreSQL 18'
    echo
    echo '- Local real RLS role/subject isolation: **1/1 PASS**'
    echo '- Local synthetic pool acquisition pressure and recovery: **PASS**'
    echo '- Actual numeric measurements: see identifier-free run artifact'
    echo '- Source: new temporary loopback PostgreSQL 18 clusters, no provider/Production access'
    echo '- Production DB RLS, real queries, DB saturation ceiling, Saju CPU/memory, scaling trigger: **NOT PROVEN**'
    echo '- DR and service-resumption gates: **BLOCKED**'
  } >> "$GITHUB_STEP_SUMMARY"
fi
echo 'ISOLATED_PG18_PHASE7_PHASE11_PASS: actual 1/1 RLS + synthetic pool pressure, Production unmodified.'
