#!/usr/bin/env bash
set -euo pipefail
umask 077
fail(){ echo "::error title=Isolated product proof::$1" >&2; exit 1; }
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REPOSITORY:-}" == "gycha0109-beep/MyeongHa" &&
  "${GITHUB_EVENT_NAME:-}" == workflow_dispatch && "${GITHUB_REF:-}" == refs/heads/main ]] ||
  fail 'Only the manual main runner may execute the real synthetic chain.'
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ && -n "${GITHUB_WORKSPACE:-}" && -n "${RUNNER_TEMP:-}" ]] ||
  fail 'Runner identity missing.'
[[ "${MH_OPS_REPO_ROOT:-}" == "$GITHUB_WORKSPACE" &&
  "${PG_BIN_DIR:-}" == /usr/lib/postgresql/18/bin &&
  "$(git -C "$GITHUB_WORKSPACE" rev-parse HEAD)" == "$GITHUB_SHA" ]] ||
  fail 'Exact isolated PG18 checkout mismatch.'
[[ "$(/usr/lib/postgresql/18/bin/pg_config --version)" == PostgreSQL\ 18.* ]] ||
  fail 'Actual local PostgreSQL18 is required.'
for k in DATABASE_URL SUPABASE_URL SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN \
  SUPABASE_PROJECT_ID SUPABASE_SECRET_KEY SAJU_PRODUCTION_SERVICE_BEARER; do
  [[ -z "$(printenv "$k" 2>/dev/null || true)" ]] || fail 'Production credential prohibited.'
done
for k in docker jq node git openssl curl; do command -v "$k" >/dev/null || fail 'Runtime missing.'; done
[[ "$(docker info --format '{{.OSType}}')" == linux ]] || fail 'Local Linux Docker only.'
[[ "$(docker context inspect --format '{{.Endpoints.docker.Host}}')" == unix://* ]] ||
  fail 'Remote Docker context forbidden.'
docker compose version >/dev/null || fail 'Docker Compose v2 missing.'

source_sha=9807ce89c08afc61b587560d515a475efd819032
saju="$GITHUB_WORKSPACE/_isolated_saju"
[[ "$(git -C "$saju" rev-parse HEAD)" == "$source_sha" &&
  -f "$saju/dist/production-calculation-host.js" &&
  -z "$(git -C "$saju" status --porcelain)" ]] ||
  fail 'Pinned clean real Saju build missing.'
node -e 'const p=require(process.argv[1]);if(p.name!=="myeonghwa-saju-engine")process.exit(1)' \
  "$saju/package.json" || fail 'Saju identity invalid.'

output="$RUNNER_TEMP/myeongha-ops-real-product-chain-phase11-proof.json"
scratch="$(mktemp -d "$RUNNER_TEMP/myeongha-ops-realchain-XXXXXXXX")"
project="mh-ops-realchain-$GITHUB_RUN_ID"
compose="$GITHUB_WORKSPACE/scripts/operations/real-gotrue-product-phase11.compose.yml"
blocked(){
  printf '%s\n' '{"schema":"myeongha-ops-real-gotrue-pg18-saju-product-phase11-v1","status":"BLOCKED_INCOMPLETE","productionCapacityProven":false,"productionScalingThresholdApproved":false,"drReady":false,"serviceResumptionAllowed":false,"outputContainsIdentifiers":false}' >"$output"
}
blocked
cleanup(){
  local code=$?
  trap - EXIT
  docker compose --project-name "$project" -f "$compose" down --volumes --remove-orphans >/dev/null 2>&1 || code=1
  if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ||
     -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ||
     -n "$(docker network ls -q --filter "label=com.docker.compose.project=$project")" ]]; then
    code=1
  fi
  if ((code != 0)); then blocked; echo '::error title=Isolated product proof::Proof or disposable cleanup failed.' >&2; fi
  rm -rf -- "$scratch"
  exit "$code"
}
trap cleanup EXIT

export MH_OPS_GOTRUE_PORT MH_OPS_AUTH_DB_PASSWORD MH_OPS_AUTH_DB_URL MH_OPS_AUTH_JWT_SECRET
MH_OPS_GOTRUE_PORT="$(node -e 'const n=require("node:net"),s=n.createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
[[ "$MH_OPS_GOTRUE_PORT" =~ ^[0-9]{4,5}$ ]] || fail 'Loopback port missing.'
MH_OPS_AUTH_DB_PASSWORD="$(openssl rand -hex 24)"
MH_OPS_AUTH_JWT_SECRET="$(openssl rand -hex 32)"
MH_OPS_AUTH_DB_URL="postgres://postgres:${MH_OPS_AUTH_DB_PASSWORD}@auth-db:5432/myeongha_saju_gotrue_verify?sslmode=disable"
docker compose --project-name "$project" -f "$compose" config --quiet ||
  fail 'Disposable Compose configuration failed.'
docker compose --project-name "$project" -f "$compose" up --detach --wait --wait-timeout 120 auth-db >/dev/null ||
  fail 'Disposable Auth DB failed.'
docker compose --project-name "$project" -f "$compose" up --detach gotrue >/dev/null ||
  fail 'Disposable GoTrue container failed.'
ready=false
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$MH_OPS_GOTRUE_PORT/health" >/dev/null; then
    ready=true; break
  fi
  sleep 1
done
[[ "$ready" == true ]] || fail 'Actual GoTrue health did not pass.'

cd "$GITHUB_WORKSPACE"
export MH_OPS_REAL_GOTRUE_LOCAL_ORIGIN="http://127.0.0.1:$MH_OPS_GOTRUE_PORT"
export MH_OPS_REAL_SAJU_CHECKOUT="$saju"
export MH_OPS_REAL_PRODUCT_PROOF_PATH="$scratch/real-product.json"
if ! ./node_modules/.bin/vitest run test/ops/product-saju-isolated-pg18-phase11.test.mjs \
  --reporter=verbose --testNamePattern='four authenticated synthetic members' >"$scratch/vitest.log" 2>&1; then
  fail 'Real GoTrue, PostgreSQL18 and Saju calculation test failed.'
fi
grep -F '1 passed' "$scratch/vitest.log" >/dev/null ||
  fail 'Exactly one real integrated test required.'
[[ -s "$scratch/real-product.json" ]] || fail 'Actual private evidence not created.'
jq -e --arg sha "$source_sha" '
  .schema=="myeongha-ops-real-gotrue-pg18-saju-product-phase11-v1"
  and .status=="OBSERVED_ISOLATED_REAL_CHAIN"
  and .scope=="disposable-main-only-local-gotrue-postgres18-and-pinned-saju"
  and .memberCount==4 and .actualGoTrueJwtVerified==true
  and .realGoTrueHttp==true and .actualPostgres18Rls==true
  and .actualPinnedSajuProductionEngine==true
  and .sajuSourceSha==$sha and .cloudflareWorkerRuntimeMeasured==false
  and .databasePoolMax==2 and .dbPeak>=1 and .dbPeak<=2
  and .baseline.requested==12 and .baseline.successful==12
  and .baseline.unavailable==0 and .baseline.unexpected==0
  and .contended.requested==32 and .contended.concurrency==8
  and (.contended.successful+.contended.unavailable)==32
  and .contended.successful>0 and .contended.unexpected==0
  and (.dbAcquireP95Ms|type=="number") and (.dbQueryP95Ms|type=="number")
  and .authHttpCalls>=44 and .sajuCalculationCalls>=.baseline.successful
  and .anonymousDenied==true and .healthUnaffected==true
  and .actualSajuResourceCgroupConstrained==false
  and .productionCapacityProven==false and .productionScalingThresholdApproved==false
  and .drReady==false and .serviceResumptionAllowed==false
  and .outputContainsIdentifiers==false
' "$scratch/real-product.json" >/dev/null || fail 'Evidence failed strict isolated contract.'
jq --arg main "$GITHUB_SHA" '.githubMainSha=$main' "$scratch/real-product.json" >"$output" ||
  fail 'Sanitized proof serialization failed.'
echo 'ISOLATED_REAL_GOTRUE_PG18_SAJU_CHAIN_PHASE11_PASS: four synthetic members on real disposable GoTrue, PG18 and pinned Saju.'
