#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::ISOLATED_SAJU_RATE_LADDER: $1" >&2
  exit 1
}
[[ "$GITHUB_REPOSITORY" == "gycha0109-beep/MyeongHa" ]] || fail "Wrong source repository"
[[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]] || fail "Main-only manual dispatch required"
[[ "$GITHUB_REF" == "refs/heads/main" ]] || fail "Main ref required"
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "Exact main SHA required"
[[ -n "$GITHUB_WORKSPACE" && -n "$RUNNER_TEMP" ]] || fail "Runner path missing"

for key in DATABASE_URL SUPABASE_URL SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN \
  SUPABASE_SECRET_KEY SUPABASE_PROJECT_ID SAJU_PRODUCTION_SERVICE_BEARER \
  SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER; do
  [[ -z "$(printenv "$key" 2>/dev/null || true)" ]] ||
    fail "Production credential environment is forbidden"
done
command -v docker >/dev/null || fail "Docker Engine missing"
command -v jq >/dev/null || fail "jq missing"
command -v git >/dev/null || fail "Git missing"

repo="$GITHUB_WORKSPACE"
saju="$repo/_isolated_saju"
source_sha="9807ce89c08afc61b587560d515a475efd819032"
source_script="$repo/scripts/operations/measure-isolated-saju-rate-ladder-phase11.mjs"
out="$RUNNER_TEMP/myeongha-isolated-saju-rate-ladder-phase11-proof.json"
scratch="$(mktemp -d "$RUNNER_TEMP/myeongha-saju-rate-ladder.XXXXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT

# Preserve a negative, non-acceptance artifact on every fail-closed exit.
cat > "$out" <<'JSON'
{
  "schema": "myeongha-ops-saju-real-engine-cgroup-rate-ladder-phase11-v1",
  "status": "BLOCKED_INCOMPLETE",
  "sajuSaturationCeilingProven": false,
  "productionCapacityProven": false,
  "productionScalingThresholdApproved": false,
  "drReady": false,
  "serviceResumptionAllowed": false,
  "outputContainsIdentifiers": false
}
JSON

[[ -f "$source_script" && -f "$saju/dist/production-calculation-host.js" ]] ||
  fail "Real Saju engine or rate-ladder script missing"
[[ "$(git -C "$repo" rev-parse HEAD)" == "$GITHUB_SHA" ]] ||
  fail "MyeongHa source does not match frozen main commit"
[[ "$(git -C "$saju" rev-parse HEAD)" == "$source_sha" ]] ||
  fail "Saju source is not the pinned public revision"
[[ -z "$(git -C "$saju" status --porcelain)" ]] ||
  fail "Saju checkout is not clean"

docker pull node:24-bookworm >"$scratch/image-pull.log" 2>&1 ||
  fail "Public Node runtime image unavailable"
image="$(docker image inspect node:24-bookworm --format '{{index .RepoDigests 0}}')"
[[ "$image" =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]] ||
  fail "Cannot pin Node image digest"

# Exactly one isolated, CPU- and memory-constrained process with local loopback only.
# No writable host mounts, host port mapping, remote service, Production secret or network egress.
docker run --rm --pull=never \
  --network none --cpus=0.50 \
  --memory=256m --memory-swap=256m \
  --pids-limit=128 --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --user "$(id -u):$(id -g)" \
  --env GIT_OPTIONAL_LOCKS=0 \
  --mount "type=bind,source=$saju,target=/saju,readonly" \
  --mount "type=bind,source=$source_script,target=/usr/local/bin/mh-rate-ladder.mjs,readonly" \
  "$image" node /usr/local/bin/mh-rate-ladder.mjs --saju-repo /saju \
  >"$scratch/actual.json" 2>"$scratch/driver-stderr.log" ||
  fail "Actual isolated Saju pressure run failed, PASS forbidden"

[[ "$(wc -l <"$scratch/actual.json")" -eq 1 ]] ||
  fail "Unexpected result line count"
jq -e --arg sha "$source_sha" '
   .schema == "myeongha-ops-saju-real-engine-cgroup-rate-ladder-phase11-v1" and
   .status == "OBSERVED_RATE_LADDER" and
   .sourceSha == $sha and
   .actualSajuProductionHostUsed == true and
   .syntheticInputOnly == true and
   .networkScope == "container-loopback-only" and
   .driverSharesServiceCgroup == true and
   .kernelConstraints.cpuQuotaCores == 0.5 and
   .kernelConstraints.memoryLimitBytes == 268435456 and
   .kernelConstraints.memorySwapLimitBytes == 0 and
   .totalPlannedSlots == 4710 and
   .totalActualAttempts > 0 and
   .totalActualAttempts <= 4710 and
   .totalSuccessfulCalculations > 0 and
   .totalSuccessfulCalculations <= .totalActualAttempts and
   (.rates | length == 6)
' "$scratch/actual.json" >/dev/null ||
  fail "Missing bounded real-engine pressure evidence"

jq -e '
  .postPressureRecoverySucceeded == true and
  .memoryOomKills == 0 and
  .kernelCgroupPeakMemoryBytes > 0 and
  .kernelCgroupPeakMemoryBytes <= 268435456 and
  .saturationKneeApproved == false and
  .sajuSaturationCeilingProven == false and
  .productionSajuCpuMemoryCeilingProven == false and
  .productionCapacityProven == false and
  .productionScalingThresholdApproved == false and
  .drReady == false and
  .serviceResumptionAllowed == false and
  .outputContainsIdentifiers == false and
  (all(.rates[]; .attempted + .skippedInFlightCap + .skippedSchedulingLag == .plannedSlots))
' "$scratch/actual.json" >/dev/null ||
  fail "Incomplete request accounting or unsafe approval claim"

jq --arg digest "$image" --arg mainSha "$GITHUB_SHA" \
  '.nodeImageDigest = $digest | .githubMainSha = $mainSha' \
  "$scratch/actual.json" > "$out" ||
  fail "Sanitized evidence could not be materialized"
echo 'ISOLATED_SAJU_RATE_LADDER_OBSERVED: actual pinned Saju CPU-constrained open-loop rate measurements, no Production saturation claim.'
