# Phase 11 — bounded four-client overlapping Saju requests (15 minutes)

**Status: ACTUAL GITHUB LINUX FOUR-CLIENT WAVE OBSERVATION VERIFIED (2026-11-04); PRODUCTION ACCEPTANCE REMAINS BLOCKED.**

## Gap addressed in the approved capacity roadmap

The actual GitHub Linux sustained run [#41573816739](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41573816739) completed 3,900/3,900 real Saju calculations and 20 actual load minutes. However, the 15-minute `normal-concurrency-15m` step had an **upper limit of 4 outstanding requests but maximum observed in-flight = 1**. Its stable **4 requests/second arrival-rate** evidence did *not* demonstrate even four simultaneous outstanding client requests. The Phase 11 normal-concurrency measurement requirement therefore remains incomplete.

This independent **four-client-waves** option closes that specific *client-side overlap* evidence gap without rerunning/replacing the successfully verified 5-minute single-user profile or altering the earlier source proof.

## Execution scope and constraints

The **existing** `saju-isolated-rate-ladder-phase11.yml` main-only manual workflow has an explicit fourth `experiment=four-client-waves` mode. Existing `shared`, `split`, and `sustained` modes, plus the default, retain their original meaning and results.

| Constraint | Fixed value |
| --- | --- |
| Real computation | Pinned public Saju SHA `9807ce89c08afc61b587560d515a475efd819032` |
| Test environment | Ubuntu Linux; offline `--network=none` Saju service and shared loopback-only driver namespace |
| Service cgroup | 0.5 CPU, 256MiB memory, no swap |
| Synthetic driver cgroup | 1 CPU, 256MiB memory, no swap |
| Actual scheduling duration | 15 minutes (900 seconds) |
| Scheduling | 900 distinct 1-second waves; attempt **four requests at the same scheduled instant** within each wave |
| Maximum outstanding client requests | 4 (no unbounded queue) |
| Bounded planned slots | 3,600 |
| Request timeout | 2.5 seconds |
| Source and filesystem | Exact pinned clean Saju source, immutable Node image digest, read-only mounts/root, non-root, no extra capabilities |
| Recovery | Actual Saju calculation before and after the 15-minute load |
| Artifact | Sanitized bounded JSON, 14-day GitHub artifact; status `OBSERVED_FOUR_CLIENT_WAVES` on valid observation or `BLOCKED_INCOMPLETE` on failure |

There is **no Production service endpoint, database, credential, payment call, external network access, user input or user record** in this test. A scheduler that is behind does not burst to catch up: missing slots are recorded as `skippedSchedulingLag`; the 4-client pending-request cap causes `skippedInFlightCap`. Started requests are counted as valid calculation responses, HTTP errors, malformed responses, or transport failures. Successful response p50/p95/p99 and realized throughput, exact elapsed duration, both cgroups' CPU/throttling/memory/OOM and post-load recovery are recorded separately.

## Evidence semantics and limitations

The `maxInFlightObserved=4` field measures **four client-side HTTP calculation promises outstanding simultaneously**. It is not an assertion that a single-threaded Node host performed four *CPU calculations in parallel*, nor proof that all four were executing server-side at the same microsecond. Requests may be queued/serialized by the event loop or underlying network. An explicit `clientWaveSize=4` in both the proof root and the stage identifies this workload; the validator requires exact 900 seconds, 3,600 accounted planned slots and observed client in-flight peak 4.

This is **one bounded synthetic Saju workload in a non-production resource configuration**. It cannot establish Production maximum/safe TPS, true service saturation knee, scaling/autoscaling thresholds, Production SLOs, representative traffic or full API/DB/Auth capacity. It also cannot certify Hosted restoration, privacy deletion or service resumption. The flags `saturationKneeApproved=false`, `sajuSaturationCeilingProven=false`, `productionSajuCpuMemoryCeilingProven=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false` and `serviceResumptionAllowed=false` remain unchanged; [Hosted DR blocker #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) remains OPEN.

## Actual GitHub Linux 15-minute four-client wave observation — 2026-11-04

- **Actual manual execution:** [Ubuntu 26.04 main-only four-client run #41752345052](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41752345052) finished **SUCCESS** after prior runner import fix was merged. Exact MyeongHa main SHA `1c2f51f596419a6fe9a6f8d7145586c1cb339074`; actual public Saju production-calculation-host source SHA `9807ce89c08afc61b587560d515a475efd819032`, pinned container image `node@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c`.
- **Original sanitized proof:** Downloaded GitHub artifact ID `13287213790`, name `isolated-saju-four-client-waves-phase11-41752345052`, retention 14 days. Archived unmodified [actual 15m Linux JSON](./SAJU_REAL_ENGINE_FOUR_CLIENT_WAVES_LINUX_OBSERVATION_20261104.json), **raw JSON SHA-256 `ef267d4a158e338bd1c5d23652593c31ad018602de7671dbf2cf16932686817c`** (not ZIP digest). [Independent exact-schema verifier](../../scripts/operations/verify-saju-four-client-wave-linux-phase11.mjs) checks source and main SHAs, digest, both cgroups, actual elapsed clock, full request accounting, observed outstanding client peak, recovery, and explicit false Production flags.
- **Observed bounded demand:** Over **899,999.932ms** (15 minutes), 900 nominal one-second waves with 4 initiated synthetic requests per wave: **3,600 planned, 3,600 attempted and 3,600 successful actual Saju calculations**, skipped scheduling **0**, skipped concurrency cap **0**, HTTP non-200 **0**, transport failures **0**, invalid responses **0**. **Maximum client-side outstanding requests = 4**. Successful calculation response times p50 **2.582ms**, p95 **4.042ms**, p99 **5.277ms**; actual average successful arrival throughput **4/s**.
- **Kernel isolation and recovery:** Real Saju server 0.5 CPU, synthetic driver 1 CPU, each 256MiB and swap 0. Service CPU **3,593,955µs**, peak memory **50,040,832 bytes**; driver CPU **3,935,323µs**, peak memory **51,453,952 bytes**. Service/driver throttling periods **0**, OOM kills **0**; post-experiment real calculation recovery **PASS**.
- **Interpretation:** The previous sustained run observed only 1 client request in flight despite a cap of 4; this run **measures 4 simultaneous outstanding client HTTP requests**, closing the bounded client overlap measurement gap. It does not prove 4 CPU-parallel Saju calculations in a single Node service, a measured saturation knee, representative production traffic, safe Production TPS, DB/Auth/API end-to-end capacity, SLO, scaling threshold or Hosted DR. Kernel isolation still shares underlying host resources. All non-approval flags remain **false**, Hosted DR/privacy [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) stays **OPEN**. The **four-client-wave Phase 11 subtask is evidenced**; the overall Phase 11 saturation/Production-topology acceptance remains incomplete.

Offline original JSON verification:

```sh
node scripts/operations/verify-saju-four-client-wave-linux-phase11.mjs \
  docs/operations/SAJU_REAL_ENGINE_FOUR_CLIENT_WAVES_LINUX_OBSERVATION_20261104.json \
  ef267d4a158e338bd1c5d23652593c31ad018602de7671dbf2cf16932686817c \
  1c2f51f596419a6fe9a6f8d7145586c1cb339074
```

**Remaining approved Phase 11 work:** representative production-like workload topology (API/Auth/DB), controlled saturation characterization and repeatable ceiling evidence. Do not infer numeric Phase 12 scaling thresholds or execute Hosted recovery from this isolated diagnostic; request user approval where an unapproved action becomes necessary.
