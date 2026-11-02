# Phase 11 — controlled real Saju engine rate-ladder procedure

**Status: IMPLEMENTED, NOT YET EXECUTED ON LINUX.** This is an additional bounded non-production workload in the existing Phase 11 saturation-characterization roadmap. It is not a scaling approval or a replacement for Phase 12 production-like evidence.

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

## Evidence and non-claims

Only identifier-free measurement totals, per-stage resource observations, and immutable source/runtime digests may be saved as the workflow's 14-day JSON artifact. The artifact uses `OBSERVED_RATE_LADDER` only if actual source and kernel constraints, all six rate-stage accounting invariants, and post-pressure recovery pass; otherwise it remains `BLOCKED_INCOMPLETE`.

The output explicitly retains `saturationKneeApproved=false`, `sajuSaturationCeilingProven=false`, `productionSajuCpuMemoryCeilingProven=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, and `serviceResumptionAllowed=false`.

The observations must not be used to set production worker sizing, auto-scaling triggers, SLOs, hosted DR readiness or service resumption. The actual service topology, sustained workload, database/Auth dependencies and provider quotas require separate approved evidence; the independent Hosted restoration/privacy continuity blocker remains [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887).
