# Phase 11 — Controlled non-production loopback capacity probe

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

**Outstanding:** Execute on an actual isolated service with synthetic data, measure dependency DB/Auth/Saju timings separately, then exercise supported DB/Saju saturation and dependency-latency scenarios. No Production mutation, backup/restore gate or provider infrastructure is added.
