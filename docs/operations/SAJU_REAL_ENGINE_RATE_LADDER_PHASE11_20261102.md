# Phase 11 — controlled real Saju engine rate-ladder procedure

**Status: ACTUAL LINUX OBSERVATION COMPLETE (2026-11-03); PRODUCTION ACCEPTANCE REMAINS BLOCKED.** This is an additional bounded non-production workload in the existing Phase 11 saturation-characterization roadmap. It is not a scaling approval or a replacement for Phase 12 production-like evidence.

## Separate resource-cgroup follow-up — implementation (Phase 11)

The first actual Linux observation showed 316 scheduler-lag slots when **the synthetic driver and Saju shared one CPU cgroup**. This leaves the engine-only saturation question open. The existing manually dispatched workflow now supports two explicit `experiment` choices: `shared` (historical original, unchanged by default) and `split` (separate source-constrained service and load-generator cgroups). No new per-phase workflow is created.

The `split` runner first verifies the *exact clean public Saju SHA* `9807ce89c08afc61b587560d515a475efd819032` on the host and pins the Node 24 Docker image by immutable digest. A disposable **service** container has `--network=none`, 0.5 CPU, 256MiB memory, swap 0, a read-only source mount and root filesystem, zero extra capabilities, no host port mapping and a non-root runtime. A separate **driver** container uses 1 CPU, 256MiB memory, swap 0 and `--network=container:<service>`, which shares the *offline* loopback network namespace but **not** the service's CPU or memory cgroup. There is no public/Production endpoint. Both sides use bounded synthetic input, no Production environment variables, no credentials and no user records.

The driver performs the same 6-second 10/25/50/100/200/400 requests/s synthetic schedule, maximum 16 concurrent requests, 2.5-second request deadline, 300ms inter-stage gap, and counts all skipped slots. Per stage it reads **service-only** and **driver-only** cgroup CPU usage/throttling and peak memory separately. The lightweight service cgroup meter is reachable on another loopback-only port; only synthetic counters are returned. It also checks real warmup and recovery calculation, no OOM, forced resource limits, and explicit false Production/DR acceptance flags. Failures produce `BLOCKED_INCOMPLETE`, never fabricated evidence. A completed split run uses `OBSERVED_SPLIT_CGROUP_RATE_LADDER` and a distinct 14-day sanitized artifact.

The service and driver remain on the *same Docker host*, potentially contending for underlying host CPU even with separate cgroups. Separate-accounting measurements remove the shared **quota** confound but do **not** prove a portable saturation ceiling or Production safe TPS. Neither the short shared-cgroup nor short split-cgroup report may be fed into the Phase 12 short-probe analyzer. Long-duration, actual request distribution, real API/DB/Auth topology, worker/process sizing and repeatability remain outside this single diagnostic.

### 2026-11-03 — Actual GitHub Ubuntu 26.04 split-cgroup Linux proof

**Execution:** [main-only manual split run #41565835572](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41565835572) completed **SUCCESS** at exact MyeongHa main SHA `137211996b27a5b7f34755e85c61334001bbf4bf`. It compiled the actual Saju production calculation host from exact public SHA `9807ce89c08afc61b587560d515a475efd819032` (Node image `node@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c`) and ran the explicit `split` experiment. All workflow steps, including the isolated computation and evidence upload, succeeded.

**Original evidence:** [permanent sanitized Linux JSON](./SAJU_REAL_ENGINE_SPLIT_CGROUP_LINUX_OBSERVATION_20261103.json), SHA-256 **`2063321492567f7bff495e14844040030da8fd9878c3a6672bfaac6c4ddb6ec3`** (JSON bytes, not the ZIP digest). Downloaded from actual run artifact `13199220968`, `isolated-saju-split-rate-ladder-phase11-41565835572` (GitHub artifact retention 14 days). Independently checked using [the exact-schema, digest, and fail-closed validator](../../scripts/operations/verify-saju-split-rate-ladder-proof-phase11.mjs):

```sh
node scripts/operations/verify-saju-split-rate-ladder-proof-phase11.mjs \
  docs/operations/SAJU_REAL_ENGINE_SPLIT_CGROUP_LINUX_OBSERVATION_20261103.json \
  2063321492567f7bff495e14844040030da8fd9878c3a6672bfaac6c4ddb6ec3 \
  137211996b27a5b7f34755e85c61334001bbf4bf
```

| Target requests/s | Planned slots | Attempted / successful | Scheduling / cap skips | Successful p95 / p99 | Achieved success/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 60 | 60 / 60 | 0 / 0 | 3.102 / 3.553ms | 10.169 |
| 25 | 150 | 150 / 150 | 0 / 0 | 2.309 / 2.506ms | 25.168 |
| 50 | 300 | 300 / 300 | 0 / 0 | 2.242 / 5.074ms | 50.168 |
| 100 | 600 | 600 / 600 | 0 / 0 | 1.277 / 1.566ms | 100.170 |
| 200 | 1,200 | 1,200 / 1,200 | 0 / 0 | 1.035 / 1.671ms | 200.187 |
| 400 | 2,400 | 2,400 / 2,400 | 0 / 0 | 0.711 / 1.280ms | 400.137 |
| **Total** | **4,710** | **4,710 / 4,710** | **0 / 0** | — | — |

**Separate kernel observations:** Actual Saju service was constrained to **0.5 CPU / 256MiB RAM / zero swap**, while the independent driver had **1 CPU / 256MiB RAM / zero swap**. Service cgroup: `2,394,137µs` CPU usage, **0** throttled periods, `55,746,560` bytes peak memory. Driver cgroup: `2,933,030µs` CPU usage, **0** throttled periods, `53,788,672` bytes peak memory. Both recorded `oom_kill=0`, no HTTP/transport/invalid-response errors, and an actual post-pressure calculation recovery **PASS**.

**Interpretation and independent environment comparison:**

| Environment | Distinct service/driver CPU cgroups | Success / planned | Missing scheduled slots at 400/s | Observed highest-step successful p95 |
| --- | --- | --- | ---: | ---: |
| GitHub Linux shared cgroup [#41556469998](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41556469998) | No | 4,394 / 4,710 | 297 | 1.377ms |
| Local Docker Desktop split cgroups ([local JSON](./SAJU_REAL_ENGINE_SPLIT_CGROUP_LOCAL_OBSERVATION_20261103.json)) | Yes | 4,367 / 4,710 | 341 (120 scheduling, 221 concurrency cap) | 59.081ms |
| **GitHub Linux split cgroups** [#41565835572](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41565835572) | **Yes** | **4,710 / 4,710** | **0** | **0.711ms** |

The host platforms and resource-accounting layout differ, so these numbers are **not** controlled same-host A/B measurements or portable performance baselines. In this GitHub split run, **no Saju saturation knee was reached up to the bounded target of 400/s**. The source-specific, short synthetic success does **not** prove a 400 TPS Production minimum, maximum Saju throughput, production-like API/DB/Auth response, any sustained 5m/15m baseline, resource scaling trigger, or approved SLO. The server and driver remain on the same physical host even when independently cgroup-constrained. The artifact explicitly retains all Production capacity/scaling and Hosted DR/service-resumption approvals `false`. Phase 11 service capacity and Phase 12 scaling evaluation remain blocked pending reproducible sustained production-like evidence.

### 2026-11-03 — Actual local split-cgroup Linux Docker evidence

The split-cgroup variant was executed once on **local Docker Desktop with a Linux Docker Engine** using pinned, clean public Saju SHA `9807ce89c08afc61b587560d515a475efd819032` and a content-addressed Node 24 image. This is a *local Linux container result*, not a GitHub Ubuntu run or a Production capacity measurement. The sanitized raw [JSON](./SAJU_REAL_ENGINE_SPLIT_CGROUP_LOCAL_OBSERVATION_20261103.json) has SHA-256 `7e7793f687427c79bb86ad6f6acb2eff8ba540aa9386611f5a3275b9a01e1ab4`, includes `localValidationOnly=true`, and retains all seven Production/DR acceptance flags as `false`.

| Target arrival rate | Planned slots | Successful actual calculations | Scheduling lag skips | In-flight cap skips | Success p95 / p99 | Achieved successful rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10/s | 60 | 60 | 0 | 0 | 5.126 / 9.087ms | 10.167/s |
| 25/s | 150 | 150 | 0 | 0 | 3.124 / 6.148ms | 25.166/s |
| 50/s | 300 | 300 | 0 | 0 | 2.687 / 4.587ms | 50.159/s |
| 100/s | 600 | 600 | 0 | 0 | 3.775 / 5.501ms | 100.178/s |
| 200/s | 1,200 | 1,198 | 2 | 0 | 2.22 / 3.678ms | 199.854/s |
| 400/s | 2,400 | 2,059 | 120 | 221 | 59.081 / 75.266ms | 343.353/s |
| **Total** | **4,710** | **4,367** | **122** | **221** | — | — |

The run successfully performed all 4,367 attempted calculations, without non-200, transport or invalid-response failures. Resource accounting is now **separated**: Saju service 0.5 CPU / 256MiB / no swap, actual kernel CPU use `5,527,264µs`, 27 throttled periods, cgroup peak memory `59,404,288 bytes`; load-generator 1 CPU / 256MiB / no swap, kernel CPU use `6,910,115µs`, 2 throttled periods, peak memory `50,528,256 bytes`; both zero OOM kills and final calculation recovery PASS.

At 400/s, scheduling lag and the driver's 16-in-flight cap both caused skipped slots. The observation supports further investigation into service response pressure **under the specified local constraints**. It is not sufficient to establish an engine-only maximum TPS, a reproducible saturation knee or Production worker/auto-scaling numbers; it cannot be compared 1:1 to the earlier GitHub runner shared-cgroup experiment because both the container layout and host environment differ. The main-only GitHub Linux `split` dispatch will be evaluated independently after merging this implementation.

## Execution contract

After this change merges into MyeongHa `main`, the owner may manually dispatch `.github/workflows/saju-isolated-rate-ladder-phase11.yml`. It checks out the exact public Saju source `9807ce89c08afc61b587560d515a475efd819032`, builds the actual production calculation host, and runs the controlled pressure driver within **one disposable Linux Docker cgroup**.

The runner fixes `--network none`, `--cpus=0.50`, `--memory=256m --memory-swap=256m`, no host ports, read-only source and root filesystem, a bounded memory-backed `/tmp`, no privileged capabilities, and a non-root user. No Production Saju or database endpoint, credentials, user identity, checkout, billing or live user data is used.

The synthetic driver makes actual authenticated HTTP calculations only over container-local `127.0.0.1`. The bearer and birth fixture are synthetic constants, never printed. It validates Saju package identity, exact Git commit and clean source, kernel cgroup CPU quota, hard memory limit, swap prohibition and zero memory OOM kills. Any invalid or missing evidence fails closed.

## Fixed bounded pressure profile

| Target synthetic arrival rate | Duration | Scheduled slots |
| --- | ---: | ---: |
| 10 requests/s | 6 s | 60 |
| 25 requests/s | 6 s | 150 |
| 50 requests/s | 6 s | 300 |
| 100 requests/s | 6 s | 600 |
| 200 requests/s | 6 s | 1,200 |
| 400 requests/s | 6 s | 2,400 |
| **Total** | **36 s** | **4,710** |

At most **16 in-flight** HTTP requests are permitted by the driver, each with a **2.5-second timeout**. Slow scheduling and full in-flight capacity are counted as **skipped slots** rather than issuing catch-up bursts. Actual attempts can therefore be **less than 4,710** and are never reported as full completion without evidence. A 300-ms gap separates stages. A real calculation must succeed before the series starts and again after the last stage.

Each stage records actual successes, non-200 responses, timeouts/transport failures, malformed responses, missed scheduling slots, skipped concurrency slots, p50/p95/p99 for actual successes, measured successful throughput, maximum in-flight requests, and the Linux kernel CPU usage/throttling deltas and cgroup peak memory. The kernel CPU measurements **include both the synthetic client driver and the service**, which share the cgroup; this is not isolated provider-side CPU usage. Saturation shape can be *observed*, but no safe capacity number can be inferred from one brief synthetic execution.

## Actual 2026-11-03 Linux observation — evidence inspected

- **Execution:** [manual Ubuntu 26.04 run #41556469998](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41556469998) succeeded on exact MyeongHa main SHA `103ce134b9419baf6d28f756d252a249dcfc127c`. The actual Saju calculation host from fixed public SHA `9807ce89c08afc61b587560d515a475efd819032` was built and exercised with synthetic requests only on container-local loopback. Driver and service shared the same Linux Docker cgroup.
- **Original evidence:** [sanitized JSON](./SAJU_REAL_ENGINE_RATE_LADDER_PHASE11_OBSERVATION_20261103.json), SHA-256 `dd1d4b7a2e47f782e401273b83702f83dedb378810335655b839da5cf703679a` (digest of JSON, not artifact ZIP). Downloaded and independently verified from workflow artifact `13194193281`, with 14-day expiration. `OBSERVED_RATE_LADDER` schema, six-stage accounting, enforced limits, recovery, source SHA and explicit non-claims checked.
- **Kernel constraints:** `cpu.max=50000 100000` (0.5 CPU), `memory.max=268435456` (256 MiB), `memory.swap.max=0`, zero OOM kills. Overall throttling: 34 periods / 2,362,210 microseconds; peak memory 84,426,752 bytes (~80.5 MiB). Actual post-pressure calculation recovered.

| Target arrival rate | Scheduled | Attempted / successful | Skipped scheduling | Skipped at in-flight cap | Successful p95 / p99 | Achieved success rate | Stage throttle periods |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10/s | 60 | 60 / 60 | 0 | 0 | 3.544 / 4.301 ms | 10.168/s | 1 |
| 25/s | 150 | 150 / 150 | 0 | 0 | 2.321 / 2.691 ms | 25.167/s | 0 |
| 50/s | 300 | 300 / 300 | 0 | 0 | 2.005 / 2.369 ms | 50.171/s | 0 |
| 100/s | 600 | 595 / 595 | 5 | 0 | 1.639 / 2.122 ms | 99.335/s | 3 |
| 200/s | 1200 | 1186 / 1186 | 14 | 0 | 1.365 / 1.55 ms | 197.843/s | 4 |
| 400/s | 2400 | 2103 / 2103 | 297 | 0 | 1.377 / 5.145 ms | 350.642/s | 20 |
| **Total** | **4,710** | **4,394 / 4,394** | **316** | **0** | — | — | **28 in-stage** |

- **Outcome accounting:** Every one of 4,394 started requests succeeded; no HTTP, transport or malformed-response failure. The 316 unsent slots are scheduling lag (5 at 100/s, 14 at 200/s, 297 at 400/s); these are *not* successful calculations. Max observed in-flight was 5 of permitted 16.
- **Degradation candidate:** At target 400/s, 297/2,400 slots (12.375%) could not be scheduled. Actual success throughput was 350.642/s, versus 197.843/s at target 200/s. p99 was 5.145ms at target 400/s versus 1.55ms at 200/s, but successful p95 did **not** show monotonic worsening. Last-step CPU throttle: 20 periods / 1,195,545 microseconds. Since the generator shares CPU with Saju, this is evidence of shared-cgroup scheduler pressure, **not** proof of an isolated Saju service saturation knee. Overall throttling also covers non-stage intervals, explaining why its total differs from the sum of stage deltas.
- **No Production approval:** `saturationKneeApproved=false`, `sajuSaturationCeilingProven=false`, `productionSajuCpuMemoryCeilingProven=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false` and `serviceResumptionAllowed=false` all remain. `outputContainsIdentifiers=false`. A short, synthetic, shared-driver cgroup test does not establish safe Production TPS, scaling thresholds, SLO, real-query DB/Auth behavior, or Hosted DR. Blocker [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) remains OPEN.

**Next Phase 11 gap:** Separate load-generator scheduling interference from actual Saju service saturation in production-like isolation; follow with representative sustained observations before Phase 12 scaling criteria. Do not feed this rate-ladder schema into the different Phase 12 short-probe analyzer.

## Evidence and non-claims

Only identifier-free measurement totals, per-stage resource observations, and immutable source/runtime digests may be saved as the workflow's 14-day JSON artifact. The artifact uses `OBSERVED_RATE_LADDER` only if actual source and kernel constraints, all six rate-stage accounting invariants, and post-pressure recovery pass; otherwise it remains `BLOCKED_INCOMPLETE`.

The output explicitly retains `saturationKneeApproved=false`, `sajuSaturationCeilingProven=false`, `productionSajuCpuMemoryCeilingProven=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, and `serviceResumptionAllowed=false`.

The observations must not be used to set production worker sizing, auto-scaling triggers, SLOs, hosted DR readiness or service resumption. The actual service topology, sustained workload, database/Auth dependencies and provider quotas require separate approved evidence; the independent Hosted restoration/privacy continuity blocker remains [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887).
