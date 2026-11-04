# Phase 11 — bounded controlled Saju CPU/memory saturation characterization

**Status: ACTUAL TWO-ROUND GITHUB LINUX SYNTHETIC SATURATION PROBE VERIFIED (2026-11-04); PRODUCTION CEILING / DR / SCALING APPROVAL REMAIN BLOCKED.**

## Why this is the next approved roadmap step

The [Production Operations architecture §29](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md) explicitly includes **Saju saturation** with deterministic synthetic fixtures and controlled CPU/memory ceiling observation. Scaling triggers in §30 remain **`TBD-BY-MEASUREMENT`** and are **not approved**. Earlier real Linux isolated service/driver experiments completed the 10–400/s six-stage ladder and 5m/15m demand scenarios, including a 15-minute four outstanding-client test. **The split-cgroup GitHub 400/s ladder reported no service throttling**, so it did not identify a service saturation knee.

This fourth measurement type extends that same Phase 11 **manually dispatched, main-only** synthetic workflow with the explicit `experiment=saturation` choice. It is *not* a new workflow, auto-trigger, Production traffic replay or scaling decision. Existing `shared`, `split`, `sustained` and `four-client-waves` scenarios are unchanged. It must be invoked manually only after its implementation has passed the required CI and merged into exact `main`.

## Exactly bounded non-Production experiment

| Fixed experimental property | Value |
| --- | --- |
| Source | Real public Saju production-calculation-host pinned SHA `9807ce89c08afc61b587560d515a475efd819032` |
| Isolated service | 0.5 CPU, 256MiB memory, swap 0, no external network |
| Synthetic driver | Independent 1 CPU, 256MiB memory, swap 0, shares offline loopback namespace only |
| Fixed test-input | Deterministic synthetic Saju birth fixture; no user record |
| Probe-only stage rates | **400, 800, 1,200, 1,600 scheduled requests/s**; *not scaling thresholds* |
| Repetition | Exactly **2 full rounds** at each stage rate |
| Stage duration | Exactly **15 seconds**; eight stages, 120 nominal load seconds |
| Sending pattern | Fixed 100 scheduling waves/second; 4, 8, 12 or 16 requests initiated per wave |
| Cap | Maximum 64 outstanding client-side HTTP operations; no unbounded queue |
| Planned load | **120,000** synthetic slots (not a claim of 120,000 delivered successes) |
| Individual request timeout | 2,500ms; dropped/failed/invalid requests counted, never hidden |
| Runtime bounds | Driver process maximum 240 seconds; GitHub job timeout 35 minutes |
| Artifact | Identifier-free JSON, 14-day GitHub retention; `BLOCKED_INCOMPLETE` if any execution/contract constraint fails |

The runner reuses its existing hardened, read-only, non-root Docker sandbox with no host ports, `--network=none` on the server, `--network=container:<service>` on the driver, strict source SHA, immutable Node Docker image digest and refusal to run with Production DB/Provider configuration. **No Production services, user data, provider calls, migrations, Cloudflare resources or credentials are contacted.** The source checkout/build is identical to previous Phase 11 measurements.

## How observations are interpreted

Each real stage records attempted, successful, HTTP/invalid/transport failures, **scheduler-lag skips** versus **64-in-flight cap skips**, actual elapsed scheduling and drain windows, successful p50/p95/p99 and achieved throughput. It separately observes service and synthetic driver Linux CPU usage, CPU throttling periods/time, peak memory, OOM kills, and verifies actual Saju post-pressure recovery. The two rounds let investigators compare the same synthetic demand point on a single GitHub host and distinguish repeatable server CPU pressure from client scheduler saturation or memory pressure.

The result is explicitly **diagnostic evidence only**. A rising p95, CPU throttling or unsuccessful schedule can signal a *candidate* pressure point; it cannot independently prove a portable **Saju saturation knee**, maximum safe throughput, CPU/memory ceiling, actual 4 CPU-parallel calculations, Production end-to-end SLO, autoscaling trigger or Phase 12 approval. Underlying GitHub host resources still influence results; 100 Hz driver scheduling may itself become the limiting factor. A stage with a driver scheduling backlog must **not** be attributed to the Saju service alone. No automatic decision, scale operation, knee flag or threshold is produced from these experiments.

All production/DR governance flags stay **false**: `saturationKneeApproved`, `sajuSaturationCeilingProven`, `productionSajuCpuMemoryCeilingProven`, `productionCapacityProven`, `productionScalingThresholdApproved`, `drReady`, `serviceResumptionAllowed`, `outputContainsIdentifiers`. Hosted recovery and migration-history issue [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) remains OPEN. There is no Production restart permission.

## First actual GitHub Linux attempt — 2026-11-04 (blocked, not a measurement)

The first main-only `saturation` dispatch [#41786718871](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41786718871), exact MyeongHa main `512ef9d5b20888553eb5cfe6b15fd3b9e3b3643b`, **FAILED** before completing the first measured stage. GitHub uploaded artifact `13301855853`, name `isolated-saju-saturation-phase11-41786718871`, containing only `BLOCKED_INCOMPLETE` and the all-false Production/DR gates. No usable 120,000-slot, eight-stage data exists from that run.

The failure was independently reproduced against the pinned clean Saju source on offline local Linux Docker: the driver function's numeric `round` parameter shadowed its existing `round()` metric-rounding function. The stage failed with `round is not a function` after its first bounded 15-second observation window. This was a **driver implementation defect**, not evidence of a saturated Saju service. The corrective change renames only the numeric stage-round parameter to `roundNumber`, preserves the JSON `round` field and original rounding helper, and adds a regression test that fails on the previous shadowed name. The original GitHub failed artifact remains classified incomplete; do not report its wall-clock exit as a service saturation knee.

## Actual GitHub Ubuntu Linux observation — 2026-11-04 (diagnostic evidence only)

- **Successful actual Linux dispatch:** [main-only controlled-saturation #41798949702](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41798949702) on exact MyeongHa `main` SHA `11045d4b9662f1c8c50d92f58db6ea8916a643e0` after [the rounding variable repair PR #2960](https://github.com/gycha0109-beep/MyeongHa/pull/2960). Fixed public real Saju calculation source `9807ce89c08afc61b587560d515a475efd819032`; immutable Node Docker image digest recorded in the JSON. This is a **separately CPU/memory constrained, offline Linux synthetic experiment**, not a Production benchmark.
- **Immutable original evidence:** Downloaded GitHub artifact ID `13307121804`, `isolated-saju-saturation-phase11-41798949702`, retention 14 days. Original [sanitized 9,352-byte Linux JSON](./SAJU_REAL_ENGINE_CONTROLLED_SATURATION_LINUX_OBSERVATION_20261104.json) saved without modification. **Raw SHA-256 `73ca63552f3cd3469cba44769094ba94b2feed9a3187f7c7ff12ccc4cdd833ae`** (not the compressed artifact digest). [Independent exact-byte verifier](../../scripts/operations/verify-saju-saturation-linux-proof-phase11.mjs) binds the original SHA, GitHub main and pinned Saju SHAs, exact eight-stage and 120,000-slot accounting, kernel limits and recovery; [fixture/negative tests](../../test/ops/saju-saturation-linux-proof-phase11.test.mjs) include the real captured source proof.
- **Actual aggregate:** Eight real 15-second stages, 2 rounds of 400/800/1,200/1,600 scheduled requests/s: **120,000 planned, 114,174 attempted and all 114,174 successful**, 5,826 unstarted due to the explicit 64-outstanding-client cap, scheduler-lag skips 0, HTTP non-200 / transport / invalid responses 0. All requests **actually attempted** returned valid Saju calculation results. Do not count capped slots as requests handled or failures returned by the server.
- **Kernel and post-pressure:** Service cgroup **0.5 CPU / 256MiB RAM**, driver cgroup **1 CPU / 256MiB RAM**, both swap 0, no external network. Total service CPU `42,305,624µs`, **346 throttled periods**, `15,543,014µs` total throttled CPU time, peak service memory `68,313,088` bytes. Driver CPU `43,629,502µs`, **1 throttled period**, peak driver memory `66,572,288` bytes. Both OOM kills 0; actual Saju calculation after pressure **PASS**.

| Synthetic target and 15s stage | Round 1: successful / capped / achieved success/s / p95 / service throttled periods | Round 2: successful / capped / achieved success/s / p95 / service throttled periods |
| --- | --- | --- |
| 400 scheduled/s | 6,000 / 0 / 400.225 / 2.004ms / 2 | 6,000 / 0 / 400.261 / 1.630ms / 0 |
| 800 scheduled/s | 11,805 / 195 / 787.513 / 3.710ms / 12 | 12,000 / 0 / 800.472 / 2.852ms / 0 |
| 1,200 scheduled/s | 17,935 / 65 / 1,196.330 / 5.395ms / 23 | 17,947 / 53 / 1,197.236 / 4.888ms / 9 |
| 1,600 scheduled/s | 21,131 / 2,869 / 1,409.582 / 51.366ms / 150 | 21,356 / 2,644 / 1,424.534 / 48.708ms / 150 |

**Interpretation:** At 1,600/s synthetic offered demand, both 15-second rounds hit the 64-outstanding-client cap, dropped more than 2,600 **unstarted** slots each, and showed 150 service throttling periods with successful-response p95 above 48ms. Driver throttling **was 0** in both 1,600/s stages. This supports a **repeated pressure candidate in this isolated 0.5-CPU Saju service setup**, not a portable exact throughput ceiling or Production-usable knee. Differences at 800/s and the 100-wave/s synthetic load generator further preclude inferring a universally stable threshold. No errors, OOM or recovery failure were observed in attempted calculations. CPU-parallel execution, representative workload, API/Auth/DB end-to-end service, cloud scaling, rollback/DR and Production SLO were **not** measured.

**Acceptance unchanged:** `saturationKneeApproved=false`, `sajuSaturationCeilingProven=false`, `productionSajuCpuMemoryCeilingProven=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, `serviceResumptionAllowed=false`, `outputContainsIdentifiers=false`. Hosted restoration [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) remains OPEN.

Independent raw-byte check:

```sh
node scripts/operations/verify-saju-saturation-linux-proof-phase11.mjs \
  docs/operations/SAJU_REAL_ENGINE_CONTROLLED_SATURATION_LINUX_OBSERVATION_20261104.json \
  73ca63552f3cd3469cba44769094ba94b2feed9a3187f7c7ff12ccc4cdd833ae \
  11045d4b9662f1c8c50d92f58db6ea8916a643e0
```

## Next approved Phase 11 evidence gap

The **bounded synthetic isolated Saju saturation diagnostic** is measured and permanently evidence-backed. The separately required **representative Production-like API/Auth/DB topology**, acceptable error/latency envelopes under that topology and demonstrably portable resource ceilings remain unproven. Phase 12 scaling thresholds cannot be derived or approved from this isolated 0.5-CPU synthetic study. Do not run Production workloads or Hosted recovery without explicit authority.
