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
