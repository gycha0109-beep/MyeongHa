#!/usr/bin/env bash
set -euo pipefail
umask 077
fail(){ echo "::error title=Isolated product proof::$1" >&2; exit 1; }
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REPOSITORY:-}" == "gycha0109-beep/MyeongHa" &&
  ( "${GITHUB_EVENT_NAME:-}" == workflow_dispatch || "${GITHUB_EVENT_NAME:-}" == push ) &&
  "${GITHUB_REF:-}" == refs/heads/main ]] ||
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
  SUPABASE_PROJECT_ID SUPABASE_SECRET_KEY SAJU_PRODUCTION_SERVICE_BEARER CLOUDFLARE_API_TOKEN CF_API_TOKEN; do
  [[ -z "$(printenv "$k" 2>/dev/null || true)" ]] || fail 'Production credential prohibited.'
done
for k in docker jq node git openssl curl; do command -v "$k" >/dev/null || fail 'Runtime missing.'; done
[[ "$(docker info --format '{{.OSType}}')" == linux ]] || fail 'Local Linux Docker only.'
[[ "$(docker context inspect --format '{{.Endpoints.docker.Host}}')" == unix://* ]] ||
  fail 'Remote Docker context forbidden.'
docker compose version >/dev/null || fail 'Docker Compose v2 missing.'
experiment="${MH_OPS_REAL_PRODUCT_EXPERIMENT:-short}"
export COMPOSE_PROFILES= MH_OPS_AUTH_JWT_EXP_SECONDS=300
case "$experiment" in
  short|workerd|workerd_db_failover) ;;
  workerd_overlap) MH_OPS_AUTH_JWT_EXP_SECONDS=1800 ;;
  sustained|overlap) COMPOSE_PROFILES=sustained; MH_OPS_AUTH_JWT_EXP_SECONDS=1800 ;;
  saju_cpu) COMPOSE_PROFILES=sustained,cpu-pressure; MH_OPS_AUTH_JWT_EXP_SECONDS=1800 ;;
  *) fail 'Unknown isolated product experiment.' ;;
esac
if [[ "${GITHUB_EVENT_NAME:-}" == push ]]; then
  [[ "$experiment" == workerd_db_failover ]] ||
    fail 'Main push only authorizes the exact isolated DB outage experiment.'
  [[ "$(git -C "$GITHUB_WORKSPACE" show -s --format=%s HEAD)" =~ ^fix\(ops\):\ retry\ isolated\ workerd\ DB\ failover\ proof\ \(\#[0-9]+\)$ ]] ||
    fail 'One-shot push subject is not the reviewed DB outage proof.'
  [[ "$(cat "$GITHUB_WORKSPACE/.github/ops/phase11-workerd-db-failover-20261108.once")" == 'PHASE11-ISOLATED-WORKERD-DB-FAILOVER-20261108-V2' ]] ||
    fail 'One-shot DB outage marker is absent or unreviewed.'
fi

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
  local containers volumes networks
  trap - EXIT
  docker compose --project-name "$project" -f "$compose" down --volumes --remove-orphans >/dev/null 2>&1 || code=1
  containers="$(docker ps -aq --filter "label=com.docker.compose.project=$project")" || code=1
  volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" || code=1
  networks="$(docker network ls -q --filter "label=com.docker.compose.project=$project")" || code=1
  [[ -z "$containers$volumes$networks" ]] || code=1
  if ((code == 0)); then
    jq '.dockerCleanupVerified=true' "$output" >"$scratch/complete.json" &&
      mv -- "$scratch/complete.json" "$output" || code=1
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
if [[ "$ready" != true ]]; then
  # Never print Docker logs or full inspect output: these may contain synthetic
  # auth DB URLs, JWT signing keys or generated identities.
  container="$(docker compose --project-name "$project" -f "$compose" ps -q gotrue 2>/dev/null || true)"
  state=missing
  if [[ -n "$container" ]]; then
    state="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || echo unknown)"
  fi
  inside=unavailable
  if docker compose --project-name "$project" -f "$compose" exec -T gotrue \
    wget --no-verbose --tries=1 --spider http://127.0.0.1:9999/health \
    >/dev/null 2>&1; then inside=healthy; fi
  echo "::error title=Isolated GoTrue health::Container state=$state; inside-container health=$inside; host loopback was not reachable." >&2
  fail 'Actual GoTrue host-only health did not pass.'
fi

saju_loopback_origin(){
  local address
  address="$(docker compose --project-name "$project" -f "$compose" port "$1" "$2")" ||
    fail 'Disposable Saju port lookup failed.'
  [[ "$address" =~ ^127\.0\.0\.1:[0-9]{4,5}$ ]] ||
    fail 'Constrained Saju published outside loopback.'
  printf 'http://%s\n' "$address"
}
wait_saju_metrics(){
  for _ in $(seq 1 "$2"); do
    if curl --fail --silent --max-time 2 "$1/metrics" >/dev/null; then
      return
    fi
    sleep 1
  done
  fail 'Constrained Saju metrics did not become ready.'
}

saju_image_id=''
if [[ "$experiment" != short && "$experiment" != workerd && "$experiment" != workerd_overlap && "$experiment" != workerd_db_failover ]]; then
  services=(saju)
  if [[ "$experiment" == saju_cpu ]]; then services+=(saju-cpu-pressure); fi
  docker compose --project-name "$project" -f "$compose" up --detach "${services[@]}" >/dev/null ||
    fail 'Disposable constrained Saju container failed.'
  export MH_OPS_REAL_SAJU_ORIGIN MH_OPS_REAL_SAJU_METRICS_ORIGIN
  MH_OPS_REAL_SAJU_ORIGIN="$(saju_loopback_origin saju 43007)"
  MH_OPS_REAL_SAJU_METRICS_ORIGIN="$(saju_loopback_origin saju 43008)"
  wait_saju_metrics "$MH_OPS_REAL_SAJU_METRICS_ORIGIN" 30
  if [[ "$experiment" == saju_cpu ]]; then
    reference_id="$(docker compose --project-name "$project" -f "$compose" ps -q saju)"
    pressure_id="$(docker compose --project-name "$project" -f "$compose" ps -q saju-cpu-pressure)"
    saju_image_id="$(docker inspect --format '{{.Image}}' "$reference_id")"
    pressure_image_id="$(docker inspect --format '{{.Image}}' "$pressure_id")"
    [[ "$saju_image_id" =~ ^sha256:[a-f0-9]{64}$ && "$pressure_image_id" == "$saju_image_id" ]] ||
      fail 'CPU comparison Saju container images differ.'
    export MH_OPS_PRESSURE_SAJU_ORIGIN MH_OPS_PRESSURE_SAJU_METRICS_ORIGIN
    MH_OPS_PRESSURE_SAJU_ORIGIN="$(saju_loopback_origin saju-cpu-pressure 43007)"
    MH_OPS_PRESSURE_SAJU_METRICS_ORIGIN="$(saju_loopback_origin saju-cpu-pressure 43008)"
    wait_saju_metrics "$MH_OPS_PRESSURE_SAJU_METRICS_ORIGIN" 120
  fi
fi

if [[ "$experiment" == workerd || "$experiment" == workerd_overlap || "$experiment" == workerd_db_failover ]]; then
  npm install --prefix "$scratch/wrangler" --ignore-scripts --no-audit --no-fund --save-exact \
    wrangler@4.152.0 >"$scratch/wrangler-install.log" 2>&1 || fail 'Pinned Wrangler installation failed.'
  export MH_OPS_WORKERD_WRANGLER_ENTRY="$scratch/wrangler/node_modules/wrangler/bin/wrangler.js"
fi

cd "$GITHUB_WORKSPACE"
export MH_OPS_REAL_GOTRUE_LOCAL_ORIGIN="http://127.0.0.1:$MH_OPS_GOTRUE_PORT"
export MH_OPS_REAL_SAJU_CHECKOUT="$saju"
export MH_OPS_REAL_PRODUCT_PROOF_PATH="$scratch/real-product.json"
export MH_OPS_REAL_PRODUCT_EXPERIMENT="$experiment"
if ! ./node_modules/.bin/vitest run test/ops/product-saju-isolated-pg18-phase11.test.mjs \
  --reporter=verbose --testNamePattern='four authenticated synthetic members' >"$scratch/vitest.log" 2>&1; then
  # The raw test output is deliberately private because it can contain
  # randomized GoTrue credentials/UUIDs or a PostgreSQL exception payload.
  # Report only recognized, controlled stage labels, never raw lines or paths.
  stage_pattern='MYEONGHA_REAL_CHAIN_FAILURE_STAGE: (member_signup|isolated_pg18_start|subject_rls_map|real_saju_start|api_setup|workerd_runtime|workerd_requests|workerd_saju_outage|workerd_saju_recovery|workerd_db_outage|workerd_db_health|workerd_db_recovery|workerd_sustained_overlap|baseline_requests|contended_requests|anonymous_and_health|sustained_baseline|sustained_concurrent|sustained_overlap|cpu_reference|cpu_pressure|post_pressure_recovery|runtime_cleanup|proof_write|complete)'
  if grep -Eq "$stage_pattern" "$scratch/vitest.log"; then
    stage="$(grep -oE "$stage_pattern" "$scratch/vitest.log" | tail -n 1)"
    echo "::error title=Isolated three-dependency failure stage::$stage" >&2
  else
    echo '::error title=Isolated three-dependency failure stage::No allowlisted stage emitted; inspect harness/integration in a private sandbox.' >&2
  fi
  fail 'Real GoTrue, PostgreSQL18 and Saju calculation test failed.'
fi
grep -F '1 passed' "$scratch/vitest.log" >/dev/null ||
  fail 'Exactly one real integrated test required.'
[[ -s "$scratch/real-product.json" ]] || fail 'Actual private evidence not created.'
if [[ "$experiment" == workerd || "$experiment" == workerd_overlap || "$experiment" == workerd_db_failover ]]; then
  jq -e --arg sha "$source_sha" --arg experiment "$experiment" '
    .schema=="myeongha-ops-workerd-local-product-phase11-v1" and .status=="OBSERVED_ISOLATED_WORKERD_PRODUCT"
    and .scope=="wrangler-local-loopback-go-true-pg18-and-pinned-saju" and .wranglerVersion=="4.152.0"
    and (.workerdVersion | test("^[0-9.]+$")) and .sajuSourceSha==$sha and .memberCount==4
    and .baseline.requested==12 and .baseline.concurrency==1 and .baseline.successful==12
    and .baseline.unavailable==0 and .baseline.unexpected==0
    and .baseline.p50Ms>=0 and .baseline.p95Ms>=.baseline.p50Ms and .baseline.p99Ms>=.baseline.p95Ms
    and (if $experiment == "workerd_overlap" then
      .workerdWindow.durationSeconds==900 and .workerdWindow.requestsPerSecond==4
      and .workerdWindow.concurrency==4 and .workerdWindow.waveSize==4
      and .workerdWindow.scheduled==3600 and .workerdWindow.peak==4
      and .workerdWindow.clientPendingPeak==4 and .workerdWindow.clientPendingOnlyNotWorkerAdmission==true
      and .workerdWindow.elapsedMs>=900000
      and .workerdWindow.successful>0 and .workerdWindow.unexpected==0
      and .workerdWindow.skipped==0 and .workerdWindow.transportFailures>=0
      and .workerdWindow.unavailable>=0
      and (.workerdWindow.successful+.workerdWindow.unavailable+
        .workerdWindow.transportFailures+.workerdWindow.unexpected+.workerdWindow.skipped)==3600
      and .workerdWindow.p50Ms>=0 and .workerdWindow.p95Ms>=.workerdWindow.p50Ms
      and .workerdWindow.p99Ms>=.workerdWindow.p95Ms
      and .workerdWindow.sajuResourceCgroupConstrained==false
    else .workerdWindow==null end)
    and (if $experiment == "workerd_db_failover" then
      .sajuOutage==null and .workerdWindow==null
      and .dbOutage.realPostgresProcessStopped==true
      and .dbOutage.localPoolOnlyNoHostedHyperdrive==true
      and .dbOutage.requested==4 and .dbOutage.unavailable==4
      and .dbOutage.unexpected==0 and .dbOutage.healthStatus==200
      and .dbOutage.recoveryAttempts>=1 and .dbOutage.recoveryAttempts<=8
      and (.dbOutage.recovery | .requested==4 and .concurrency==4
        and .successful==4 and .unavailable==0 and .unexpected==0)
    else
      .dbOutage==null and .sajuOutage.calculationStatus==503
      and .sajuOutage.healthStatus==200
      and (.sajuOutage.recovery | .requested==4 and .concurrency==4 and .successful==4
        and .unavailable==0 and .unexpected==0)
    end)
    and .actualGoTrueJwtVerified==true and .actualPostgres18Rls==true and .actualPinnedSajuProductionEngine==true
    and .localWorkerdProductPathMeasured==true and .anonymousDenied==true and .healthUnaffected==true
    and .runtimeCleanupVerified==true and .productionWorkerAdmissionMeasured==false and .hostedHyperdriveMeasured==false
    and .productionCapacityProven==false and .productionScalingThresholdApproved==false
    and .drReady==false and .serviceResumptionAllowed==false and .outputContainsIdentifiers==false
  ' "$scratch/real-product.json" >/dev/null || fail 'Local workerd proof failed the isolated contract.'
else
jq -e --arg sha "$source_sha" --arg experiment "$experiment" '
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
  and .runtimeCleanupVerified==true
  and (if $experiment == "short" then .actualSajuResourceCgroupConstrained==false and .sustained==null
    elif $experiment == "saju_cpu" then .actualSajuResourceCgroupConstrained==true
      and .sustained==null and .cpuComparison.recoverySucceeded==true
      and ([.cpuComparison.reference.saju.cpuCores,.cpuComparison.pressure.saju.cpuCores]==[0.5,0.01])
      and (all([.cpuComparison.reference,.cpuComparison.pressure][];
        .durationSeconds==60 and .scheduled==240 and .waveSize==4 and .apiPeak==4
        and .successful>0 and .elapsedMs>=60000
        and .scheduled==(.successful+.unavailable+.transportFailures+.skipped)
        and .saju.memoryPeakBytes<=268435456 and .saju.oomKills==0))
    else .actualSajuResourceCgroupConstrained==true and .sustained.recoverySucceeded==true
      and .sustained.injectedDbUnavailable==1
      and (if $experiment == "overlap" then
        (.sustained.windows | map(.durationSeconds))==[900]
        and (.sustained.windows | map(.scheduled))==[3600]
        and .sustained.windows[0].waveSize==4 and .sustained.windows[0].peak==4
        and .sustained.windows[0].apiPeak==4 and .sustained.windows[0].apiFourWayAdmissions>0
        and .sustained.windows[0].apiFourWayAdmissions<=900
        and (.sustained.shortDbAcquireFailures | length)==4
        and (all(.sustained.shortDbAcquireFailures[]; type=="number" and .>=0 and .<=32))
      else (.sustained.windows | map(.durationSeconds))==[300,900]
        and (.sustained.windows | map(.scheduled))==[300,3600]
      end)
      and (all(.sustained.windows[]; .scheduled==(.successful+.unavailable+.transportFailures+.skipped)
        and .successful>0 and .elapsedMs >= (.durationSeconds*1000)
        and .saju.memoryPeakBytes <= 268435456 and .saju.oomKills==0))
    end)
  and .productionCapacityProven==false and .productionScalingThresholdApproved==false
  and .drReady==false and .serviceResumptionAllowed==false
  and .outputContainsIdentifiers==false
' "$scratch/real-product.json" >/dev/null || fail 'Evidence failed strict isolated contract.'
fi
jq --arg main "$GITHUB_SHA" --arg image "$saju_image_id" '
  .githubMainSha=$main | if $image == "" then . else .cpuComparison.imageId=$image end
' "$scratch/real-product.json" >"$output" ||
  fail 'Sanitized proof serialization failed.'
echo 'ISOLATED_REAL_GOTRUE_PG18_SAJU_CHAIN_PHASE11_PASS: four synthetic members on real disposable GoTrue, PG18 and pinned Saju.'
