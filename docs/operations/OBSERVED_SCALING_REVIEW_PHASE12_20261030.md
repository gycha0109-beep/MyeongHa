### 2026-11-14 추가 격리 근거 — 느린 DB / 획득 대기 초과

[보호 workerd + GoTrue + PG18 + Saju 실증 #43597769780](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43597769780), exact `main=5ad56e5775644e656db6b1029612c3911c5032a8`, 실제 JSON SHA-256 `2c5768e300090d6d9bfa230793e4df26a4b3b42cf4a761ed5af7c931678e2c14`에서 **synthetic table lock 동안 4/4 HTTP 503, local acquire timeout 2, peak slots 2/2, Health 200, 해제 후 4/4 복구**를 확인했다. 정상 기준선 12/12 HTTP 200; Saju 실제 엔진과 GoTrue JWT 경로·PostgreSQL 18 RLS는 유지했다.

**수동 판단 근거 보강:** DB 연결 획득 실패와 서비스 503이 함께 관측될 때 먼저 해당 요청 구간의 DB 잠금·쿼리 지연·슬롯 점유·재시도 및 Auth/Saju 별도 지표를 확인하고 동시성 추가 확대를 보류한다. 장애 후 락 해제 시 회복 가능성만 격리 환경에서 실증했다. 본 실험의 `2 slots/125ms`는 일회용 **fixture의 로컬 제한**이며 Hosted Hyperdrive 획득 대기/Production 수용량을 측정한 값이 아니다. 따라서 기존 표의 Production 수치·지속 조건·수동 확장/축소 승인 상태는 변경하지 않으며 `automaticScalingEnabled=false`, `productionCapacityProven=false`, `numericalProductionScalingThresholdApproved=false` 유지.

# Phase 12 — Observed concurrency scaling-review trigger

Authority: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §30 and §38 Phase 12.

## Isolated product-chain review

The [actual Linux product-chain observation](REAL_GOTRUE_PG18_SAJU_SUSTAINED_LINUX_OBSERVATION_20261105.json) supports a manual DB pool headroom review. Concurrency 4 was the highest clean short test. Concurrency 8 produced 12 HTTP 503 responses out of 32 and the pool reached its two-connection budget during the run. The evidence does not assign each short-run 503 to a specific dependency.

```sh
node scripts/operations/derive-isolated-product-scaling-review.mjs \
  docs/operations/REAL_GOTRUE_PG18_SAJU_SUSTAINED_LINUX_OBSERVATION_20261105.json \
  9ea61382aad65231d8fbda095a7f5b1da9f515b9 \
  10513f4219f80eaf0f7d1b194683be6f00c4a8585505ac0ce6dd3eb53f9da90e
```

The review checks the source, original bytes, complete request accounting, cleanup and the observed Saju constraints. It keeps the short concurrency ramp separate from the sustained windows. The 15-minute run handled four arrivals per second with a measured peak of one request in flight. SQL p95 was 81.435ms including the fixture's deliberate 80ms delay, Auth response headers p95 was 27.185ms and Saju adapter p95 was 1.954ms. Saju recorded zero CPU throttle periods and zero OOM kills in both windows. These observations leave sustained overlapping-request limits, Worker product-runtime capacity and Production scaling or downscaling thresholds open.

### Overlapping arrivals and measured DB pressure

The [15-minute four-way observation](REAL_GOTRUE_PG18_SAJU_OVERLAP_LINUX_OBSERVATION_20261105.json) uses the same command with main `d08636181b0957721b5a318898510f4045264b96` and SHA-256 `c8691b44ab15ac67874a3526778bbf0593ab21b603e425dd00b7adec29db8941`. The analyzer verifies the four-client wave, four concurrent calculations at the gateway and short-probe DB acquisition counts before returning the review.

The paced and overlapping trials each offered 4 requests/s. In the overlapping trial the gateway admitted four concurrent requests in all 900 waves, and DB acquisition p95 was 83.171 ms compared with 0.066 ms in the earlier paced trial. Both trials used the two-connection fixture with an 80 ms SQL delay. This is a cross-run observation for those constraints. The short concurrency-8 ramp in the overlap run recorded 16 acquisition failures and 16 HTTP 503 responses. This supports reviewing pool headroom, bounded acquisition waits and query duration before increasing API concurrency. The successful overlap trial, without Saju throttling, leaves the combined Saju ceiling and Production scaling settings unapproved.

### Paired Saju CPU comparison

Use the same analyzer with the [paired Linux CPU observation](REAL_GOTRUE_PG18_SAJU_CPU_COMPARISON_LINUX_OBSERVATION_20261106.json), main `4bcad41cda3287c75cbe741f2a2331145514d0d0`, and SHA-256 `646c94a4bb4fb51113b4e8f809c161e4a42f659ab33ae7d5b43037b6283aa3cb`. It validates the shared image, both cgroup quotas, request accounting, and recovery before emitting a review signal.

`reviewSajuCpuHeadroom` is true when the lower-quota trial shows more throttled periods and higher Saju adapter and product p95, with no DB acquisition failures in either comparison window. A DB acquisition failure withholds that signal for manual dependency review. In the recorded run, adapter p95 rose from 2.939 to 582.129 ms and throttled periods rose from zero to 364. The CPU comparison reports its own evidence alongside the separate DB-pool review from the sustained trial. It leaves Production CPU sizing and automatic scaling disabled.

## Public diagnostic route review

### 2026-11-07 local loopback observation — no failure boundary observed

A fresh, identifier-free local report array was collected from the current `main` source `4f9b8ed8352be45a19879c59f30290988519f7d9` using the in-process Cloudflare Worker `fetch` handler behind a disposable HTTP listener bound only to `127.0.0.1`. The only route was `GET /api/health`; no credentials, DB, Saju service, Cloudflare endpoint, Production data, or paid resource was used. Each level completed 100/100 requests:

| Requested concurrency | Observed peak | Successful | Non-200 / transport | Successful p95 |
|---:|---:|---:|---:|---:|
| 1 | 1 | 100/100 | 0 | 1.131 ms |
| 2 | 2 | 100/100 | 0 | 1.330 ms |
| 4 | 4 | 100/100 | 0 | 3.228 ms |
| 8 | 8 | 100/100 | 0 | 5.127 ms |

The local-only input array was preserved outside the repository as `myeongha-phase12-local-health-reports.json` (SHA-256 `074fe369bbda0115e8e5401ec52276d1a521cb4df50c6c9a90ab621ca5023cd4`). Running `derive-observed-scaling-review.mjs` on those exact bytes returned **`NO_DEGRADATION_OBSERVED`**; `firstObservedFailureConcurrency=null` and `diagnosticScalingReviewAtOrAboveConcurrency=null`. The raw local report remains local-only and is not committed.

This is a small in-process Worker health-route diagnostic, not a workerd runtime, deployed Cloudflare Worker, full product chain, DB pool, Saju CPU/memory, or Production measurement. The result therefore yields **no scaling trigger** and does not change `automaticScalingEnabled=false`, `productionCapacityProven=false`, or `numericalProductionScalingThresholdApproved=false`.


### 2026-11-07 corrected local workerd product-chain overlap — 15-minute observation

The corrected main-only [Phase 11 run #42244701347](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347) completed SUCCESS after repairing the experiment argument in both proof validators. It ran Wrangler 4.152.0 / workerd 1.20261019.1 against four synthetic members, actual disposable GoTrue JWT verification, temporary PostgreSQL 18 RLS, and the pinned Saju production calculation engine (source `9807ce89c08afc61b587560d515a475efd819032`).

- 900 seconds at 4 requests/second, concurrency 4: 3,600 scheduled, **3,600 successful**, zero skipped/unavailable/transport/unexpected, peak 4, p95 174.231ms, p99 184.088ms.
- Baseline: 12/12 successful, p95 143.776ms. Client pending peak 4 is explicitly not Worker admission saturation.
- Saju outage simulation: calculation returned 503 while health remained 200; post-recovery requests 4/4 successful. Anonymous access denied and runtime cleanup verified.
- Sanitized original artifact `myeongha-ops-real-product-chain-phase11-proof.json`: 1,909 bytes, SHA-256 `96c29b2083b2479d6a9293102638e916d45f9d9647748274f695213b7dde9a8f`.

This confirms the isolated local workerd product path only. The artifact explicitly keeps `productionWorkerAdmissionMeasured=false`, `hostedHyperdriveMeasured=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, and `serviceResumptionAllowed=false`. Do not promote these timings to a Production capacity or autoscaling threshold.



`scripts/derive-observed-scaling-review.mjs` consumes an **array of actual Phase 11 collector JSON reports** from a single controlled non-production loopback diagnostic route. It combines repeated measurements at the same concurrency level conservatively, preserving any observed non-200 or transport failures. It does **not** invent a numeric service SLO, scaling ceiling, production target or Saju/DB performance claim.


## Phase 12 기존 실측 기반 수동 확장·축소 검토 절차 (종료 기준 #3–4)

이 절차는 ROADMAP Gate 3 / Phase 12의 수동 판단·조치 요구사항을 기존 관측에 연결한다. **새 Production 수치 임계치, 자동 확장 또는 용량 승인은 아니다.** Phase 11의 격리 제품 경로와 Production Worker/Hosted Hyperdrive는 별도의 대상이므로 기록된 4/8 동시성 수치를 운영 한도로 복사하지 않는다.

### 사용 가능한 실측 범위 및 판단 입력

| 증거 | 확인 가능한 경계 | 운영 판단으로 승격할 수 없는 것 |
|---|---|---|
| 격리 900초 4-way workerd [#42244701347](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347) | 3,600/3,600 성공, 동시 4개 요청, p95 174.231ms·p99 184.088ms, Saju 장애/복구 및 정리 성공 | Production API 처리량·Hosted DB pool 한계·상시 최소 자원 |
| DB pool=2 및 80ms SQL fixture의 짧은 부하 비교 | 동시 4는 성공 범위, 동시 8에서는 DB acquisition 실패·503 관측; 격리 4-way acquisition p95 83.171ms | 특정 운영 동시성에서 반드시 실패한다는 임계치 |
| 동일 이미지의 Saju CPU 0.50 대 0.01 비교 | 낮은 quota에서 throttle 364회, Saju adapter p95 2.939→582.129ms 증가, DB acquisition 실패 0; 압력 해제 후 복구 | 운영 CPU 확장 기준, 비용 대비 적정 인스턴스 크기 |
| 별도 127.0.0.1 Health-only 비교 | 동시 1·2·4·8 모두 100/100 성공, diagnostic-only | 사용자 제품 경로의 확장 여유 또는 축소 근거 |

수동 검토에 필요한 최소 입력은 **같은 배포 버전·같은 환경·같은 시험 구간**의 요청수/성공수/503/transport/skipped, 애플리케이션 p50/p95/p99, DB 연결 점유·획득 지연·획득 실패·쿼리 시간, Saju adapter 지연·CPU throttle·메모리/OOM, Auth 지연, 오류 이후 회복 시간, 해당 자원 비용이다. 정보가 누락되면 숫자를 보충해 꾸미지 않고 판단을 보류한다.

### 수동 판단 및 조치

| 실제 관찰 신호 | 먼저 확인할 원인·경계 | 허용된 다음 대응 |
|---|---|---|
| DB 획득 실패 또는 pool 포화와 함께 503 발생 | 같은 구간의 연결 점유/획득 대기·쿼리 시간과 재시도 횟수, Saju 자원 압력 분리 | 동시성 추가 확대 중단 → 느린 쿼리/인덱스·연결 누수·pool budget 먼저 조사 → 권위가 허용한 연결 설정 검토. Production 변경에는 별도 승인 |
| DB 획득 오류 없이 Saju CPU throttle 및 adapter p95 증가 | 같은 이미지/요청 종류와 CPU quota, OOM·메모리, Saju 외 의존성 비교 | Saju 자원 압력으로 분류하고 기존 분리·bounded-fail 경계 유지 → 수동 CPU/메모리 sizing 검토. 운영 리소스 수정은 별도 승인 |
| DB와 Saju 지표가 동시에 나빠지거나 요청 회계가 불완전 | 원인 분리 불가·누락된 실패/성공/건너뜀 여부 | 자동 확장/축소 및 특정 의존성의 원인 단정 **보류**. 먼저 유효한 관측 자료와 장애 복구 경계 확보 |
| 낮은 사용량 또는 Health만 정상 | 실제 인증 제품 경로의 실패율·p95/p99·DB pool 회복 여유·Saju CPU/메모리·비용과 복원 후보 | 해당 조건이 장기간 확인되더라도 즉시 축소하지 않고 최소 복구 여유·실제 제품 경로 호환성·롤백 대상을 먼저 검토; 운영 축소는 승인 전 금지 |

수동 작업 순서는 **① 동일 배포 SHA와 실측 구간 고정 → ② DB/Auth/Saju 지표와 실패 분모 대조 → ③ 원인·용량·비용 및 복구 여유 판단 → ④ 변경 대상과 되돌릴 정확한 버전 확인 → ⑤ 사용자 승인 범위 내에서만 운영 변경 → ⑥ 해당 변경으로 영향을 받은 제품 경로만 재검증 → ⑦ 결과·대응 기록**이다. 장애 상태에서 이미 성공한 900초 시험을 관성적으로 재실행하지 않는다.

### 관찰 구간·지속 조건·회복 여유의 결정 경계

- 격리 제품 경로의 기존 **900초 / 4req/s** 관측과 별도 **60초 CPU 비교**는 실험에 묶인 실제 구간이다. 이를 Production 지속시간·알림 반복 횟수·롤링 구간으로 임의 채택하지 않는다.
- Production 확장·축소 결정에 필요한 관찰 구간, 지속 조건, 허용 실패율, p95/p99 및 회복 여유의 **승인된 숫자는 아직 없다**. 수치를 공란/TBD로 유지하며 실제 Production 서비스 계측 및 사용자 결정 없이 시행하지 않는다.
- 격리 DB failover [#42402515024](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42402515024)의 503 4/4, Health 200, 재개 후 4/4 성공은 복구 방식의 경계에만 활용한다. 측정 p95 175.559ms를 Production RTO·확장 임계치로 바꾸지 않는다.
- 성공적인 수동 변경에도 Production DB/Worker/Saju 상호 의존성이 악화되거나 미승인 자원 사용이 발생하면 변경을 멈추고 기존 승인된 롤백 후보·복구 절차로만 대응한다. 승인되지 않은 후보를 임의 선택하지 않는다.

**Phase 12 범위 판정:** 실측 기반 원인 분리 신호와 **수동 조치 순서**는 문서화했지만, 운영 수치·관찰 구간·비용/회복 여유에 대한 승인 전에는 Phase 12 종료 조건을 충족하지 않는다. automaticScalingEnabled=false, productionCapacityProven=false, numericalProductionScalingThresholdApproved=false 유지.

## Execute

Collect reports using the already implemented Phase 11 collector, save their JSON output to a local-only file as an array (measure at distinct concurrency values; e.g. 1, 2, 4, 8), then run:

```sh
node scripts/derive-observed-scaling-review.mjs --input ./local-phase11-reports.json
```

The public report contains:

- `observedConcurrencyLevels`: counts, highest observed successful p95, and failures per tested concurrency;
- `firstObservedFailureConcurrency`: first tested level with a real non-200 or transport failure, or `null`;
- `highestCleanConcurrencyBeforeFailure`: highest lower tested level with no observed failure (NOT a guarantee of capacity);
- `diagnosticScalingReviewAtOrAboveConcurrency`: the first measured failure level, only when a lower clean level exists and later measured levels do not contradict it;
- `status`: `OBSERVED_FAILURE_BOUNDARY`, `NO_DEGRADATION_OBSERVED`, `NONMONOTONIC_OUTCOMES`, or `NO_CLEAN_LOWER_CONCURRENCY`.

**The trigger is to investigate local diagnostic degradation, not to auto-scale Production.** Mixed routes, malformed data, invented successes, incomplete requests, or unsupported privacy/target claims are rejected. No failure means **no threshold inferred**. A failure at the lowest measured concurrency means **no preceding clean level inferred**. A higher tested level with no failure after a lower level with failures invalidates a single monotonic failure boundary.

`automaticScalingEnabled=false`, `productionCapacityProven=false`, `dbConnectionBudgetProven=false`, `sajuResourceCeilingProven=false`, `numericalProductionScalingThresholdApproved=false` remain explicit. Phase 12's production thresholds need real service measurements, DB pool headroom and Saju CPU/memory envelopes. This implementation handles the documented *measured concurrency -> review signal* step without pretending that data exists.

Watchtower-Track: ops
