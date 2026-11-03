# Phase 11 — bounded four-client overlapping Saju requests (15 minutes)

**Status: IMPLEMENTED, ACTUAL LINUX WAVE OBSERVATION NOT YET VERIFIED.**

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

## Next verification

After implementation merges to exact `main`, first query existing manual runs and **execute `experiment=four-client-waves` only if no completed evidence exists**. Download `isolated-saju-four-client-waves-phase11-<run-id>`, check exact build commit/source SHA, 900-second window, all 3,600 slot outcomes, observed peak outstanding 4, actual kernel quotas/recovery and all false acceptance flags. Permanently preserve a sanitized original file and SHA-256. Do not treat a green CI test as real Linux load evidence.
