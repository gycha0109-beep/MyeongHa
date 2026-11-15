# Phase 12 — evidence-bound manual scaling and rollback decision runbook

> Date: 2026-11-08 KST · Track: `ops` · Source main `9740e36ed1c6c49a9eb771c0048b890aa70e0e03`
>
> Authority: `PRODUCTION_OPERATIONS_EXIT_ROADMAP_20261107.md` Gate 3 and
> `OBSERVED_SCALING_REVIEW_PHASE12_20261030.md`. This is an **operator decision
> procedure**, not an automatic scaling configuration or an approved numeric
> Production load threshold.

## Inputs already measured: reuse, do not rerun without source changes

| Evidence | Exact observation | Supported conclusion | Not supported |
|---|---|---|---|
| [5m/15m PG18+GoTrue+Saju sustained](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41987403626) | 300/300 at 1 request/s and 3,600/3,600 at 4 requests/s, but actual sustained in-flight peak **1** | paced isolated product path worked | overlapping Production concurrency |
| [15m isolated four-way overlap](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347) | 900s; 3,600/3,600; 4 concurrent requests; p95 **174.231 ms**, p99 **184.088 ms**; zero skipped | this precise disposable workerd/GoTrue/PG18/Saju workload succeeded | deployed Worker or Hosted Hyperdrive capacity |
| [Actual isolated PostgreSQL pool trial](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41327504617) | pool max **2**; 1/2/4 short concurrent probes clean; 8 concurrent gave **16/32** bounded acquisition timeouts | pool saturation is visible under deliberately constrained concurrency | Production pool connection budget |
| [Actual Linux Saju CPU comparison](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42168622091) | 0.50 CPU: 240/240, adapter p95 **2.939 ms**, 0 throttled periods; 0.01 CPU: 219/240, adapter p95 **582.129 ms**, **364** throttled periods, one 503, 20 skipped | CPU throttling and Saju latency rose together under forced constraint | Production CPU sizing |
| [Local public health route](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md) | 1/2/4/8 concurrency all 100/100, highest p95 **5.127 ms** | no diagnostic health-route failure boundary measured | Saju/DB scaling threshold |
| Phase 11 workerd DB stop/restart proposal | PR proof must produce exact-source Linux artifact | tests whether *real* isolated DB outage returns bounded 503 and recovers | no PASS until actual evidence available |

The **two different 15-minute trials** are distinct isolated proof configurations; they are not two repeated Production capacity runs. Never combine their success rates as if they shared the same traffic admission constraints.

## Manual decision procedure: one operator, no automatic configuration changes

1. **Confirm evidence applicability.** Pin the exact deployed Worker source/worker version, Saju digest, active DB/Hyperdrive configuration and 5m/15m observation source. Reject stale, mismatched or synthetic-only proof for live Production decisions. Record success, 401/403, 503, transport failures, dropped/skipped slots, latency p50/p95/p99, actual in-flight, DB acquire/query latency, Saju adapter timing, CPU throttling, memory/OOM, and rollback candidate. A green Health response alone is insufficient.
2. **Distinguish bottlenecks before proposing an increase.**
   - If DB acquisition timeouts or dependency 503 accompany rising DB acquisition p95 at a known pool budget, review query duration and pool limits first. In the isolated **max-two** trial, concurrency 8 triggered 16/32 timeouts. Do not copy **2**, **4**, **8**, or the observed timings as Production capacity thresholds.
   - If Saju adapter p95 rises with CPU throttling while DB timing remains stable, review Saju CPU sizing, not DB capacity. The 0.01 CPU pressure input was deliberately artificial; do not set a Production alarm at 0.01 CPU or 582 ms from this result.
   - If memory OOM or transport loss occurs, fail closed and investigate; do not widen admission by default. Distinguish dependency outage (bounded 503) from Worker admission saturation and from request auth denial (401/403).
3. **Propose a manual increase only after** current-production comparable data shows a repeatable bottleneck in a named subsystem, with an exact before/after candidate, expected resource and financial cost, no broadened data access, tested recovery behavior and an independently verifiable rollback path. One run or an isolated experiment alone is not enough. Record the operator's decision and exact production-version evidence; if not available, **HOLD**.
4. **Propose a manual decrease only after** production-version observation repeatedly shows spare headroom across DB acquisition, Saju latency/throttling, memory and private-path failures over representative workloads, and a lower setting has passed the same synthetic product + dependency failure/recovery checks. Never interpret a fast Health route or low sampled load as sufficient alone. If missing, **HOLD**.
5. **Post-change verification** must use the newly deployed exact Worker/Saju version and representative load, confirm Auth/subject/RLS/private no-store and degradation behavior, DB and Saju recovery, secret non-reflection and alert delivery. Unexpected failure, lost evidence, RLS uncertainty, increased unauthorized access or lack of rollback => **stop changes and rollback through separately approved Production change governance**.
6. **Safety gate:** while Phase 8 is `BLOCKED`, `dr_ready=false` or `serviceResumptionAllowed=false`, this runbook authorizes **measurement and review only**, not Production scale-up/down, migration changes or automatic scaling. Any new Production changes require exact scoped approval, measured target and rollback plan.

## Operator decision record (fill only with observed data)

| Required entry | Value / rule |
|---|---|
| Decision | `HOLD` / `REVIEW_INCREASE` / `REVIEW_DECREASE` |
| Tested deployment identity | Exact Worker version + Saju digest + DB config |
| Workload and observation window | 5m/15m and short concurrency profile; report actual in-flight |
| Source evidence | Exact Git SHA, job run/artifact, sanitized data hash |
| Dependency attribution | DB acquire/query vs Auth vs Saju + CPU/memory; do not infer |
| Failure/recovery | 503/transport/skipped/401/403, post-recovery success, privacy no-store |
| Candidate and cost | Concrete infrastructure setting, resource/price difference; no blanket approval |
| Rollback | Previous artifact and tested return path, current Phase 8 serving gate |
| Final sign-off | User/sole operator decision with date; default `HOLD` |

**Current decision:** `HOLD` for Production numerical scaling and all automatic scaling. The observed data supports **manual diagnostic triage**, not a new live scaling threshold. `automaticScalingEnabled=false`, `productionCapacityProven=false`, `numericalProductionScalingThresholdApproved=false`, `dr_ready=false`, `serviceResumptionAllowed=false`.

Watchtower-Track: ops
