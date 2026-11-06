# Phase 11 — Controlled non-production loopback capacity probe

## Actual local Workers runtime observation

On 2026-11-05 KST, the actual `workerd` process ran the main Worker entrypoint from `9ea61382aad65231d8fbda095a7f5b1da9f515b9` under the repository's pinned Wrangler 4.152.0 (`workerd` 1.20261019.1, Windows Node 24.20.0). The 127.0.0.1 listener used a temporary Wrangler configuration with the source compatibility date and flags, a local-only name, and no bindings or credentials. [Original 1,149-byte observation](LOCAL_WORKERD_HEALTH_OBSERVATION_20261105.json), SHA-256 `6e23bc849965c3906b28ff7868e86a881556eccc2912f7266f8aa777f129076a`.

| `/api/health` scenario | Successful / measured | p50 / p95 / p99 (ms) |
| --- | ---: | ---: |
| Baseline after 5 warmups | 50 / 50 | 15.442 / 18.901 / 22.390 |
| Concurrency 4 | 100 / 100 | 10.070 / 12.927 / 14.758 |
| Concurrency 8 | 100 / 100 | 17.355 / 21.748 / 22.366 |

Health returned 200, its unsupported method returned 405, and Member/calculation/preview routes returned the default 404 with all five responses marked `no-store`. These are local runtime ingress and fail-closed observations. The origin/transport admission rules still require a separately configured isolated HTTPS origin and approved dependency bindings for positive Worker-path measurement. This run recorded no Auth, SQL, Saju, Production capacity, or scaling evidence.

To reproduce, create a temporary Wrangler JSON config outside the checkout with only a distinct local `name`, the absolute path to `cloudflare/myeongha-worker.mjs`, `compatibility_date`, and `compatibility_flags` copied from the current source config. Launch the pinned Wrangler from the temporary directory with `dev --local --config <temporary-config> --ip 127.0.0.1 --port 0`. Use the printed local port with `collect-loopback-api-performance-baseline.mjs` and `measure-controlled-loopback-capacity.mjs` as documented below, then stop the local process. [Cloudflare local development](https://developers.cloudflare.com/workers/local-development/).

## Real product path sustained experiment

### Controlled Saju CPU quota comparison

After the comparison code merges, dispatch the existing manual Linux workflow with `experiment=saju_cpu` to compare 0.50 and 0.01 CPU on the same runner and product path. Both pinned Saju containers use 256 MiB with no swap and loopback-only published ports. Each resource setting receives the same one-minute, four-request wave profile with the same temporary GoTrue, PostgreSQL18 and Node gateway. The workflow records the kernel quota, CPU throttling, adapter and end-to-end latencies, request outcomes and recovery after returning to the reference container.

#### Verified Linux CPU comparison, 2026-11-06 KST

[Run #42168622091](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42168622091) succeeded on `main` `4bcad41cda3287c75cbe741f2a2331145514d0d0`. [Artifact 13479993634](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42168622091/artifacts/13479993634) contains the [original 3,147-byte JSON](REAL_GOTRUE_PG18_SAJU_CPU_COMPARISON_LINUX_OBSERVATION_20261106.json) with SHA-256 `646c94a4bb4fb51113b4e8f809c161e4a42f659ab33ae7d5b43037b6283aa3cb`.

| Saju CPU | Success / scheduled | HTTP 503 / transport / skipped | Product p50 / p95 / p99 (ms) | Saju adapter p95 (ms) | CFS throttled periods |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.50 | 240 / 240 | 0 / 0 / 0 | 174.645 / 217.156 / 224.348 | 2.939 | 0 |
| 0.01 | 219 / 240 | 1 / 0 / 20 | 291.515 / 791.162 / 1373.091 | 582.129 | 364 |

Both settings used the same container image, pinned engine, 256 MiB memory limit and no swap. The DB recorded zero acquisition failures, with acquisition p95 at 83.419 and 83.363 ms. The lower quota coincided with higher Saju and product latency at similar DB timings. The response-level cause of the single 503 was not recorded. The launcher restored the reference target, four follow-up calculations passed and runtime plus Docker cleanup checks passed.

The low quota is a controlled pressure input. The observation supplies a diagnostic signal for a Saju CPU investigation when adapter latency and throttling rise together. Production CPU sizing, automated scaling thresholds and the product path under the deployed Worker remain unverified.

Run the existing main-only GitHub Linux workflow with `experiment=sustained` after the implementation is merged. Its default `short` mode remains the short GoTrue, PostgreSQL18 and pinned Saju experiment.

```sh
gh workflow run postgres-isolated-rls-capacity-acceptance.yml --ref main -f experiment=sustained
```

The sustained mode adds a short concurrency ramp at 1/2/4/8, five minutes at one scheduled request per second for one synthetic member, and 15 minutes at four per second with at most four outstanding requests across the synthetic members. Overdue or full-capacity slots are counted and skipped. The experiment uses a disposable GoTrue token lifetime that covers both windows. The Saju container uses its own bridge with loopback-only published ports and kernel-checked limits of 0.5 CPU, 256 MiB RAM and no swap. The API test gateway and PostgreSQL18 remain separate from that cgroup.

The artifact separates successful calculations, HTTP 503, transport failures and unstarted slots. Each sustained window includes successful p50/p95/p99, separate DB connection and SQL timing, Auth HTTP header timing, Saju request timing, CPU throttle counts and cgroup memory peak. The runner injects one local DB-adapter failure and requires four successful calculations after the adapter is restored. Runtime and Docker cleanup must both succeed before the artifact can record success.

Only an actual successful manual run provides sustained evidence. These fixed probe loads are experimental inputs. The Node gateway, synthetic SQL fixture, and Saju limits apply to the isolated run. Workers runtime, Production capacity, automatic scaling and Hosted disaster recovery require separate evidence.

### Verified first sustained Linux run

[Run #41987403626](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41987403626) passed at exact `main` `9ea61382aad65231d8fbda095a7f5b1da9f515b9`. The [original 3,503-byte JSON](REAL_GOTRUE_PG18_SAJU_SUSTAINED_LINUX_OBSERVATION_20261105.json) is preserved from [artifact 13398260151](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41987403626/artifacts/13398260151). Raw JSON SHA-256 `10513f4219f80eaf0f7d1b194683be6f00c4a8585505ac0ce6dd3eb53f9da90e`.

| Window | Success / scheduled | 503 / transport / skipped | Actual peak in flight | p50 / p95 / p99 (ms) |
| --- | ---: | ---: | ---: | ---: |
| 5 min, 1/s | 300 / 300 | 0 / 0 / 0 | 1 | 111.877 / 114.150 / 117.387 |
| 15 min, 4/s | 3600 / 3600 | 0 / 0 / 0 | 1 | 110.218 / 112.824 / 116.510 |

Short tests succeeded at 1/2/4 concurrency. At 8, 20/32 succeeded and 12 returned 503. The pool reached two connections across the run and both sustained windows had zero acquisition failures. Saju's constrained cgroup recorded zero throttle periods and OOM kills. The 15-minute cgroup memory peak was 46,780,416 bytes out of 268,435,456. One injected DB adapter failure returned 503, all four recovery requests succeeded and the runtime and Docker cleanup checks passed.

The sustained trial observed paced throughput through the three dependencies on the Node gateway. Actual simultaneous sustained arrivals, per-failure dependency attribution in the short concurrency ramp, and a Saju saturation ceiling in this topology remain open. [Phase 12 diagnostic review](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md).

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


### 2026-11-02 — CPU and memory capped actual Saju engine acceptance path (manual, ACTUAL LINUX OBSERVED)

The Phase 11 real engine local observation (20/20/24/32 requests at concurrency 1/2/4/8) measured CPU time and sampled RSS **without an enforced resource ceiling**. It cannot establish a saturation point. To close the next independent experimental gap, the main-only manual workflow `.github/workflows/saju-isolated-cgroup-capacity-acceptance.yml` and its `scripts/operations/run-isolated-saju-cgroup-phase11-ci.sh` launcher will run the **same actual pinned production calculation engine** from public Saju source SHA `9807ce89c08afc61b587560d515a475efd819032` in a disposable Docker container on the GitHub Ubuntu26.04 runner.

The container uses `--cpus=0.50`, `--memory=256m --memory-swap=256m`, `--network none` (only internal loopback), read-only source/code mounts, a read-only root filesystem, a small writable `/tmp`, no privileged capabilities or external endpoint. Actual HTTP calculations run entirely inside the same container/cgroup. The result collector reads Linux kernel `/sys/fs/cgroup/cpu.max`, `cpu.stat`, `memory.max`, `memory.peak`, `memory.events` to **require actual enforced CPU and memory hard limits**, measured CPU throttling, peak cgroup memory, no OOM-kill, exactly 96 attempted real requests, and a post-pressure recovery request. It fails closed with `BLOCKED_INCOMPLETE` if Docker, the pinned source, container startup, kernel limits, evidence validation, or the request run is incomplete. The image's resolved digest and main SHA are recorded in a sanitized 14-day artifact.

**Execution status: ACTUAL CONSTRAINED LINUX OBSERVATION COMPLETE (2026-11-02).** [GitHub Actions run #41433151383](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41433151383) completed **SUCCESS** on Ubuntu 26.04 from exact MyeongHa `main` SHA `20cf1167298aa98fdaf9519a5bed0b1a4f3cbd25`, running the real calculation host built from pinned public Saju SHA `9807ce89c08afc61b587560d515a475efd819032`. The run's exact job log confirmed `ISOLATED_SAJU_CGROUP_PHASE11_OBSERVED`, and the downloaded sanitized evidence JSON was independently inspected. The original 14-day artifact (ID `13135266669`) expires on 2026-11-16 UTC. **Permanent evidence** is checked in at [SAJU_REAL_ENGINE_CGROUP_PHASE11_OBSERVATION_20261102.json](./SAJU_REAL_ENGINE_CGROUP_PHASE11_OBSERVATION_20261102.json), SHA-256 `d52e6757caccaf25961aeb77e4ba40ea02e00e4a79f2fd6bf8ac251c63c66606`.

The container verified `cpu.max=50000 100000` (**0.5 CPU quota**), `memory.max=268435456` (**256 MiB hard memory cap**), and `memory.swap.max=0` (no swap). Actual kernel `cpu.stat` recorded `nr_throttled=15`, `throttled_usec=1762910`, and `usage_usec=831323` over the bounded run. Kernel cgroup `memory.peak=73580544` bytes (~70.17 MiB) and `memory.events oom_kill=0`. The cgroup memory metric is a different accounting domain from the process-sampled RSS included in the per-stage observations: these numbers must **not** be treated as directly interchangeable. The resolved public Node image was pinned at `node@sha256:e7add2a490bb17d97b485b8641bd88455fff7839ade0f5eba493c3508124d413`. Container networking was `none`, all test inputs and credentials were synthetic, no Production database or external Saju endpoint was contacted, and no real identifiers were included in the saved JSON.

| Concurrent callers | Real Saju completed | p95 latency (ms) | Observed per-stage process CPU (ms) | Sampled process peak RSS (MiB) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 20/20 | 66.046 | 37.597 | 87.555 |
| 2 | 20/20 | 82.495 | 28.769 | 87.930 |
| 4 | 24/24 | 83.484 | 36.626 | 88.555 |
| 8 | 32/32 | 91.033 | 42.927 | 88.805 |

**Verified scope:** 96/96 real engine calculations completed, zero non-200 or transport failures, post-pressure recovery succeeded, actual kernel resource constraints and CPU throttling observed. **Not proved:** a saturation ceiling, maximum safe concurrency, sustained service capacity, Production sizing, scaling triggers, provider quotas, RPO/RTO, Hosted full restore, or Production service resumption. `sajuSaturationCeilingProven=false`, `productionSajuCpuMemoryCeilingProven=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, `serviceResumptionAllowed=false`. Any Phase 12 scaling decision remains authority-gated and requires additional Production-like sustained evidence. Hosted DR gate issue #1887 remains OPEN.
