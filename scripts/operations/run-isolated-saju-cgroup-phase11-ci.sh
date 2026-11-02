#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "::error::ISOLATED_SAJU_CGROUP: $1" >&2
  exit 1
}
[[ "$GITHUB_REPOSITORY" == "gycha0109-beep/MyeongHa" ]] || fail "Wrong repository"
[[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]] || fail "Manual event required"
[[ "$GITHUB_REF" == "refs/heads/main" ]] || fail "Exact main ref required"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "Exact main commit required"
[[ -n "$GITHUB_WORKSPACE" && -n "$RUNNER_TEMP" ]] || fail "GitHub runner paths required"

# Never accept production DB or Saju bearer credentials.
for key in DATABASE_URL SUPABASE_URL SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN \
  SUPABASE_SECRET_KEY SUPABASE_PROJECT_ID SAJU_PRODUCTION_SERVICE_BEARER \
  SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER; do
  [[ -z "$(printenv "$key" 2>/dev/null || true)" ]] ||
    fail "Production credential environment is forbidden"
done
command -v docker >/dev/null || fail "Docker Engine is missing"
command -v jq >/dev/null || fail "jq for strict evidence validation is missing"
command -v git >/dev/null || fail "Git is missing"

repo="$GITHUB_WORKSPACE"
saju="$GITHUB_WORKSPACE/_isolated_saju"
expected="9807ce89c08afc61b587560d515a475efd819032"
source_script="$repo/scripts/operations/measure-isolated-saju-engine-capacity-phase11.mjs"
collector="$repo/scripts/operations/collect-isolated-saju-cgroup-phase11.mjs"
out="$RUNNER_TEMP/myeongha-ops-isolated-saju-cgroup-phase11-proof.json"
scratch="$(mktemp -d "$RUNNER_TEMP/myeongha-saju-cgroup.XXXXXXXX")"
cleanup() { rm -rf -- "$scratch"; }
trap cleanup EXIT

cat >"$out" <<'JSON'
{
  "schema": "myeongha-ops-real-saju-cgroup-phase11-v1",
  "status": "BLOCKED_INCOMPLETE",
  "resourceConstraintEnforced": false,
  "productionCapacityProven": false,
  "sajuSaturationCeilingProven": false,
  "drReady": false,
  "serviceResumptionAllowed": false,
  "outputContainsIdentifiers": false
}
JSON

[[ -f "$repo/package.json" && -f "$source_script" && -f "$collector" ]] ||
  fail "Required MyeongHa source missing"
[[ -f "$saju/package.json" && -f "$saju/dist/production-calculation-host.js" ]] ||
  fail "Prebuilt isolated Saju checkout missing"
[[ "$(git -C "$repo" rev-parse HEAD)" == "$GITHUB_SHA" ]] ||
  fail "MyeongHa source does not match GitHub main SHA"
[[ "$(git -C "$saju" rev-parse HEAD)" == "$expected" ]] ||
  fail "Unapproved Saju source SHA"
[[ -z "$(git -C "$saju" status --porcelain)" ]] ||
  fail "Saju source checkout is dirty"
node -e 'const p=require(process.argv[1]);if(p.name!=="myeonghwa-saju-engine")process.exit(1)' \
  "$saju/package.json" || fail "Saju package identity mismatch"

# The public image is pulled without sending any source or Production credentials.
docker pull node:24-bookworm >"$scratch/image-pull.log" 2>&1 ||
  fail "Could not obtain the public Node 24 runtime image"
image="$(docker image inspect node:24-bookworm --format '{{index .RepoDigests 0}}')"
[[ "$image" =~ ^[^[:space:]]+@sha256:[0-9a-f]{64}$ ]] ||
  fail "Node runtime image digest could not be pinned"

# Real Saju engine and driver share one isolated kernel cgroup.
# No network egress, mapped host ports, privileged capabilities, or writable host mounts.
docker run --rm --pull=never \
  --network none \
  --cpus=0.50 \
  --memory=256m --memory-swap=256m \
  --pids-limit=128 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --user "$(id -u):$(id -g)" \
  --env GIT_OPTIONAL_LOCKS=0 \
  --mount "type=bind,source=$saju,target=/saju,readonly" \
  --mount "type=bind,source=$source_script,target=/usr/local/bin/mh-measure.mjs,readonly" \
  --mount "type=bind,source=$collector,target=/usr/local/bin/mh-collector.mjs,readonly" \
  "$image" sh -ec \
    'node /usr/local/bin/mh-measure.mjs --saju-repo /saju >/tmp/actual-saju-observation.json &&
     node /usr/local/bin/mh-collector.mjs /tmp/actual-saju-observation.json' \
    >"$scratch/result.json" 2>"$scratch/container-stderr.log" ||
  fail "Actual resource-limited Saju execution failed; PASS forbidden"

[[ "$(wc -l <"$scratch/result.json")" -eq 1 ]] ||
  fail "Unexpected container output count"
jq -e --arg sha "$expected" \
  '.schema == "myeongha-ops-real-saju-cgroup-phase11-v1" and
   .status == "OBSERVED_CONSTRAINED" and
   .resourceConstraintEnforced == true and
   .sourceSha == $sha and
   .actualSajuProductionHostUsed == true and
   .realCalculationRequestsAttempted == 96 and
   .cpuQuotaMicroseconds == 50000 and
   .cpuPeriodMicroseconds == 100000 and
   .memoryLimitBytes == 268435456 and
   .memorySwapLimitBytes == 0 and
   .observedCgroupPeakMemoryBytes > 0 and
   .observedMemoryOomKillEvents == 0 and
   .sajuSaturationCeilingProven == false and
   .productionCapacityProven == false and
   .productionScalingThresholdApproved == false and
   .drReady == false and
   .serviceResumptionAllowed == false and
   .outputContainsIdentifiers == false' "$scratch/result.json" >/dev/null ||
  fail "Kernel-enforced constrained Saju evidence incomplete or unsafe"

jq --arg digest "$image" --arg mainSha "$GITHUB_SHA" \
  '.nodeImageDigest = $digest | .githubMainSha = $mainSha' \
  "$scratch/result.json" > "$out" ||
  fail "Could not materialize sanitized constrained evidence"
echo "ISOLATED_SAJU_CGROUP_PHASE11_OBSERVED: actual pinned Saju engine under 0.5 CPU / 256 MiB, Production untouched."
