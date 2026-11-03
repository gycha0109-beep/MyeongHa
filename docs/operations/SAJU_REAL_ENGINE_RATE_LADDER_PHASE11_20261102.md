# Phase 11 — controlled real Saju engine rate-ladder procedure

**Status: ACTUAL LINUX OBSERVATION COMPLETE (2026-11-03); PRODUCTION ACCEPTANCE REMAINS BLOCKED.** This is an additional bounded non-production workload in the existing Phase 11 saturation-characterization roadmap. It is not a scaling approval or a replacement for Phase 12 production-like evidence.

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
