# Phase 11 — bounded controlled Saju CPU/memory saturation characterization

**Status: IMPLEMENTED; ACTUAL GITHUB LINUX SATURATION MEASUREMENT NOT YET EXECUTED.**

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

## Required evidence after merge

Run `saju-isolated-rate-ladder-phase11.yml` with `experiment=saturation` exactly once on the merged `main` only if no successful matching run exists. Obtain the original sanitized artifact `isolated-saju-saturation-phase11-<run-id>`, bind its SHA-256 to the exact GitHub main + Saju SHAs, verify two rounds/eight 15-second stages/120,000 scheduled slots and kernel quotas, preserve it in the operations evidence directory and update the Production Operations worklog with **observed** counters only. Keep the service ceiling and Phase 12/13 decisions blocked until representative topology and independently supported acceptance evidence exist.
