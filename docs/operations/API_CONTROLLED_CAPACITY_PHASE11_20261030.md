# Phase 11 — Controlled non-production loopback capacity probe

## 2026-11-01 — actual isolated PostgreSQL 18 CI execution (manual, synthetic-only)

The existing `scripts/operations/measure-isolated-postgres-capacity-phase11.mjs` has previously run against the user's standalone PostgreSQL 18 installation with a real temporary database and measured connection pool contention. The existing Phase 7 subject/RLS test `test/postgres-subject-rls-isolated-phase7.test.ts` has also run locally, but **without `PG_BIN_DIR` it is skipped by ordinary GitHub CI**. This is not an admissible Linux DB proof.

A separate main-only manual workflow, `.github/workflows/postgres-isolated-rls-capacity-acceptance.yml`, now executes both on an ephemeral GitHub-hosted **Ubuntu 26.04** runner whose PostgreSQL **18** binaries are installed under `/usr/lib/postgresql/18/bin`. The runtime `scripts/operations/run-isolated-postgres-phase7-phase11-ci.sh` refuses any other repository/ref/event, production database credentials, missing or incorrect PostgreSQL binaries, missing actual RLS PASS output, or capacity evidence that violates the existing bounded measurement contract. Each script creates its own disposable loopback database and cleans it up. No external project, hosted database, real user records, Production SQL migration or paid testing resource is created.

The resulting 14-day sanitized artifact contains the actual stage-by-stage synthetic pool metrics (concurrency 1/2/4/8, 96 total requests, pool max 2), post-pressure recovery flag and exact Phase 7 RLS acceptance; on failure it emits `BLOCKED_INCOMPLETE`, never fabricated PASS. **The first actual successful Linux run occurred on 2026-11-01T16:40Z (2026-11-02 KST), documented in the evidence addendum below.**

### 2026-11-02 — First successful GitHub Linux real isolated PostgreSQL 18 acceptance

After [PR #2873](https://github.com/gycha0109-beep/MyeongHa/pull/2873) fixed the per-cluster Linux Unix socket directory and passed [full Integration #41324933923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41324933923), its merge `03ac28c4ffa77ddb01d05e92f2c1906ab052968f` was deployed into main. A separately dispatched [actual manual Ubuntu26.04 PG18 run #41327504617](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41327504617) executed at exact later main SHA `b7d71697119c1a0d33a95979d5f4333202da1b5d` and **SUCCESS**. The job log shows true isolated RLS subject/role transaction **1/1 PASS** and real synthetic DB pool pressure/recovery **PASS**, not a skipped test.

Its independently downloaded identifier-free [evidence artifact #13092295390](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41327504617/artifacts/13092295390) (ZIP digest `sha256:6ad1330742bc564b3c9f5045b6bdbdf8dfd7dfd2b3b89dd41dccd8b66933278b`, expires 2026-11-15T16:40:41Z) confirms `status=PASS`, `realIsolatedRlsProven=true`, `isolatedPoolSaturationProven=true`, `isolatedRlsCaseCount=1`, `outputContainsIdentifiers=false`, `postSaturationRecovery=true`. The synthetic 80ms SQL-delay, 140ms acquisition-timeout, max-two-connection controlled measurements were:

| Concurrent clients | Synthetic requests | Completed | Controlled acquisition timeouts | Successful p95 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 20 | 20 | 0 | 82.009ms |
| 2 | 20 | 20 | 0 | 81.945ms |
| 4 | 24 | 24 | 0 | 163.545ms |
| 8 | 32 | 16 | 16 | 209.284ms |

Total **96 attempted; 80 completed; 16 expected controlled acquisition timeouts**, with no pool overrun and subsequent successful connection/SQL recovery. These are **isolated synthetic** limits, not MyeongHa Production capacity limits. Both previous Linux failures [#41317389955](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41317389955) and [#41321211252](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41321211252) remain recorded. The evidence explicitly retains `productionRlsProven=false`, `productionCapacityProven=false`, `realMyeonghaQueriesMeasured=false`, `sajuResourceCeilingProven=false`, `scalingThresholdApproved=false`, `drReady=false`, `serviceResumptionAllowed=false`.


**Non-claims:** The synthetic `pg_sleep` contention test does not measure MyeongHa's real queries, Production DB pool budget, TLS verify-full/RLS policy parity, Saju CPU/memory ceiling, approved Production scaling threshold or service-wide RPO/RTO. This workflow adds *reproducible real disposable DB evidence*, not production load or an automatic scaling decision. `productionCapacityProven=false`, `scalingThresholdApproved=false`, `drReady=false` and `serviceResumptionAllowed=false` are mandatory in its evidence.


Authority: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §29 and §38 Phase 11.

`scripts/measure-controlled-loopback-capacity.mjs` executes a **user-invoked** bounded concurrent GET workload against a locally running public diagnostic endpoint only. It collects actual request-completion latencies, measured aggregate throughput, successful/non-200/transport-failure counts and observed peak concurrency. It reports no fabricated production capacity, CPU/memory ceilings or SLO. Requests cannot target a network address beyond `127.0.0.1` or a private/authenticated route.

```sh
node scripts/measure-controlled-loopback-capacity.mjs --port 3000 --path /api/health --count 100 --concurrency 1
node scripts/measure-controlled-loopback-capacity.mjs --port 3000 --path /api/readiness --count 100 --concurrency 4
```

The commands require a **separately started local non-production API**. Each sample reads and discards its response body; neither request nor output contains credentials, subject identifiers or private payloads. No production DB or external endpoint is contacted. Concurrency ranges from 1 to 8 and total samples from 20 to 500; work is not launched automatically in CI or on Production. Both 503 and transport errors remain visible in the report, and all-failed trials have `null` successful latency percentiles rather than an invented zero.

This implements the reusable **controlled synthetic non-production throughput/concurrency probe** for Phase 11. The architecture's 5-minute single-user and 15-minute normal-concurrency baselines, injected DB latency, actual isolated-DB saturation, Saju CPU/memory saturation, and rate-limit boundaries still require their own real target-specific exercises. The tool does not declare those measured or ready. It also does not add any DR gate, change Production settings or consume paid resources.

Watchtower-Track: ops

## Sustained 5m / 15m diagnostic envelope

The separate `scripts/measure-sustained-loopback-capacity.mjs` implements the existing §29 initial **5-minute single-user** and **15-minute normal-concurrency** timing envelope on an operator-started **local** synthetic diagnostic API. It does not reuse the 20–500 request short probe report schema or claim actual DB/Saju saturation. Run only after a separate non-production API is listening on the chosen loopback port:

```sh
node scripts/measure-sustained-loopback-capacity.mjs --port 3000 --path /api/health --duration-seconds 300 --max-rps 1 --concurrency 1
node scripts/measure-sustained-loopback-capacity.mjs --port 3000 --path /api/readiness --duration-seconds 900 --max-rps 4 --concurrency 4
```

The **fixed 127.0.0.1** destination and allowlisted public health/readiness routes reject private/authenticated paths, network hosts, cookies, credentials, request bodies and arbitrary duration values. The runner is manually invoked; no CI or Production load is launched. Exactly 300 or 900 seconds, at most 8 scheduled requests per second and 8 concurrent requests bound the workload to at most 7,200 scheduled slots, while a five-second per-request timeout bounds slow responses. Congested intervals are counted as `skippedSlots` rather than emitted as catch-up bursts.

The JSON report separates successful, non-200, transport-failed and skipped requests; reports measured elapsed duration, achieved throughput, observed concurrency and successful latency p50/p95/p99. Response bodies and transport errors are never printed. A redirect, malformed response or oversized diagnostic body invalidates the report. These are *diagnostic envelope* measurements; no SLO, Production scaling threshold, DB connection ceiling, or Saju CPU/memory limit is inferred. Do not feed the new sustained schema into the Phase 12 short-probe scaling analyzer.

### 2026-11-02 — Actual Saju calculation engine local resource observation (96 requests)

The existing Phase11 dependency-overload scenario uses a deliberately synthetic HTTP upstream, not the actual calculation engine. Separately, `scripts/operations/measure-isolated-saju-engine-capacity-phase11.mjs` now runs the **real Saju production calculation host** compiled from a **clean Saju source checkout**, but exclusively as a disposable, isolated Node.js subprocess listening on `127.0.0.1` with an ephemeral port and a fixed synthetic-only bearer/input. Parent and child processes use only a minimal local execution environment. No hosted project, Saju deployment, external HTTP target, live user record, secret or production database is involved.

Manual reproduction, using a *separate clean Saju worktree* rather than any active development checkout:

```sh
# In the isolated Saju source worktree:
npm ci --ignore-scripts --no-audit --no-fund
npm run build

# In the MyeongHa source worktree:
node scripts/operations/measure-isolated-saju-engine-capacity-phase11.mjs --saju-repo "<absolute-path-to-clean-built-Saju-checkout>"
```

The launcher verifies the Saju package name, clean Git worktree and exact 40-character source SHA. It refuses arbitrary URL targets. The actual Saju service executes the pinned synthetic birth fixture through its real `/api/calculations` HTTP endpoint. It measures **20/20/24/32 actual completed requests at 1/2/4/8 concurrency**, each under an 8-second request deadline, with response-format checks, CPU usage deltas and *sampled* RSS memory observations from the isolated child process, followed by a successful recovery request. The local measurement uses **96 total requests** and declares `status=OBSERVED`, never a production capacity acceptance.

An inspectable sanitized measurement from **Node 24.20.0 on Windows, Saju SHA `9807ce89c08afc61b587560d515a475efd819032`**, is checked into [SAJU_REAL_ENGINE_PHASE11_OBSERVATION_20261102.json](./SAJU_REAL_ENGINE_PHASE11_OBSERVATION_20261102.json) (file SHA-256 `2d3d8d4c4cf389898d0b5eb2bcdc8a2f5ded205da7bae0be316c811a28207019`).

| Concurrent callers | Actual real-engine responses | p95 success latency (ms) | Observed server CPU time (ms) | Sampled peak RSS (MiB) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 20/20 | 17.003 | 0 | 81.480 |
| 2 | 20/20 | 14.550 | 47 | 83.449 |
| 4 | 24/24 | 4.870 | 16 | 84.707 |
| 8 | 32/32 | 9.207 | 63 | 86.156 |

All **96/96 actual synthetic calculation responses** succeeded, and the subsequent recovery request succeeded. The per-stage CPU timing is an OS/Node observation and can be coarse at short durations; shorter/more concurrent p95 measurements are **not** proof that concurrency improves performance. The observed peak RSS is sampled and **not an upper bound**. No controlled saturation threshold was reached, so no service CPU ceiling, safe concurrency limit, worker sizing, auto-scale trigger, SLO or production-wide RPO/RTO is inferred. `sajuSaturationCeilingProven=false`, `productionSajuCpuMemoryCeilingProven=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false` and `serviceResumptionAllowed=false`.

**Outstanding:** Repeat and characterize real engine performance under an explicitly approved isolated, resource-constrained service target to find an actual saturation point; measure DB/Auth/Saju dependency timing with production-like geometry without touching live user traffic. Hosted full DR and privacy continuity remain independently blocked. No Production mutation, backup/restore gate or provider infrastructure is added.

### 2026-11-02 — Controlled Saju dependency overload boundary (local actual HTTP)

The new `test/saju-calculation-controlled-overload-phase11.test.ts` exercises the **real production Saju calculation HTTP adapter** against an ephemeral `127.0.0.1` HTTP server (not a mocked fetch). It submits **32 synthetic requests with 8 concurrent workers** to a deliberately constrained **2-in-flight** local upstream, returning controlled `429` overload rejection or `503` temporary failure. The test requires exactly 32 upstream requests (no unbounded retry), at least one overload rejection and one unavailable response, a peak of at most two accepted in-flight upstream jobs, consistent `SAJU_TEMPORARILY_UNAVAILABLE` public error classification, and no leakage of the synthetic bearer or upstream private response body.

This fills **only the Phase 11 caller-side concurrent dependency overload/error isolation evidence** using the implemented real HTTP adapter. The upstream is a synthetic local HTTP stub: it **does not run the actual Saju calculation engine**, perform real saju calculation, measure CPU/memory, establish provider limits, demonstrate service-wide concurrency budgets, or authorize Production scaling. Unlike the initial PostgreSQL18 proof, this case is a bounded Vitest local integration test; production `sajuResourceCeilingProven=false`, `productionCapacityProven=false` and `scalingThresholdApproved=false` remain unchanged. Initial local Node24/Vitest4 result: **1/1 PASS**; GitHub PR verification remains separate.
**Outstanding:** Execute on an actual isolated service with synthetic data, measure dependency DB/Auth/Saju timings separately, then exercise supported DB/Saju saturation and dependency-latency scenarios. No Production mutation, backup/restore gate or provider infrastructure is added.


### 2026-11-02 — CPU and memory capped actual Saju engine acceptance path (manual, NOT YET EXECUTED)

The Phase 11 real engine local observation (20/20/24/32 requests at concurrency 1/2/4/8) measured CPU time and sampled RSS **without an enforced resource ceiling**. It cannot establish a saturation point. To close the next independent experimental gap, the main-only manual workflow `.github/workflows/saju-isolated-cgroup-capacity-acceptance.yml` and its `scripts/operations/run-isolated-saju-cgroup-phase11-ci.sh` launcher will run the **same actual pinned production calculation engine** from public Saju source SHA `9807ce89c08afc61b587560d515a475efd819032` in a disposable Docker container on the GitHub Ubuntu26.04 runner.

The container uses `--cpus=0.50`, `--memory=256m --memory-swap=256m`, `--network none` (only internal loopback), read-only source/code mounts, a read-only root filesystem, a small writable `/tmp`, no privileged capabilities or external endpoint. Actual HTTP calculations run entirely inside the same container/cgroup. The result collector reads Linux kernel `/sys/fs/cgroup/cpu.max`, `cpu.stat`, `memory.max`, `memory.peak`, `memory.events` to **require actual enforced CPU and memory hard limits**, measured CPU throttling, peak cgroup memory, no OOM-kill, exactly 96 attempted real requests, and a post-pressure recovery request. It fails closed with `BLOCKED_INCOMPLETE` if Docker, the pinned source, container startup, kernel limits, evidence validation, or the request run is incomplete. The image's resolved digest and main SHA are recorded in a sanitized 14-day artifact.

**Execution status: NOT YET PROVEN.** The local Windows machine currently does not have a running Docker engine or WSL Linux runtime. The manual workflow must first pass GitHub full CI and merge into main, then run on real GitHub Linux. Even if this single bounded workload passes with hard caps, it proves only one constrained observation. It does **not** prove Saju's CPU/memory *saturation ceiling*, Production server sizing, performance SLO, provider-specific quotas, auto-scale trigger, DR or full Production operations readiness. Those acceptance flags remain false.
