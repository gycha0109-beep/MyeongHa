# Phase 10 — Controlled API latency baseline collector

Source: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §28 and §38 Phase 10.

The new `scripts/collect-loopback-api-performance-baseline.mjs` measures real response-completion latency (headers **and body**) from a controlled local API endpoint. It uses a monotonic clock, excludes warm-up samples, and reports per-sample measurements and interpolated p50/p95/p99 in milliseconds. It intentionally does not invent a p95 SLO or derive a production target from CI.

Usage with a separately running local web/API server:

```sh
node scripts/collect-loopback-api-performance-baseline.mjs --port 3000 --path /api/health --samples 50 --warmup 5
node scripts/collect-loopback-api-performance-baseline.mjs --port 3000 --path /api/readiness --samples 50 --warmup 5
```

The collector fixes the destination host to `127.0.0.1` and accepts only `/api/health` or `/api/readiness`. It never sends credentials, cookies, payloads or user-controlled URLs. Each bounded sequential diagnostic GET has a five-second timeout; any non-200 or redirect invalidates the sample set. At least 20 and at most 250 samples are accepted. Only timing numbers and public route names are output.

**Scope:** the collector makes an API latency baseline practical for a controlled non-production server, but it does not yet measure DB connection, DB query, Auth verification, Saju roundtrip or the end-user product's deployed p50/p95/p99. Those remain explicit follow-on Phase 10 work, not fictitious zeroes. Static assets and Production databases are untouched. This does not relax the DR serviceability constraints or add a new DR gate.

Watchtower-Track: ops
