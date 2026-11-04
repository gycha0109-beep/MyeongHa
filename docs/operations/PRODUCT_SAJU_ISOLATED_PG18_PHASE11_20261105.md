# Phase 10–11 — Actual isolated PostgreSQL18 product request path implementation (2026-11-05)

> Track: `ops` / `Watchtower-Track: ops`
> Code: `test/ops/product-saju-isolated-pg18-phase11.test.mjs`
> Runner: existing `postgres-isolated-rls-capacity-acceptance.yml` → `run-isolated-postgres-phase7-phase11-ci.sh`
> **Execution status: IMPLEMENTED / first actual isolated PG18 workflow measurement NOT YET VERIFIED.**

## Approved roadmap linkage

`PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` Phase 7, 10, 11 require real isolated resource/dependency measurements, not an asserted Production throughput or new feature. Previous evidence already measured isolated real PostgreSQL synthetic pool and isolated real Saju CPU. This new slice adds the existing **production current-subject calculation handler** driving real temporary PostgreSQL18 subject transaction/RLS and loopback Auth and Saju transports together.

## Bounded experiment architecture

```text
Loopback HTTP client: 12 sequential / 32 at concurrency 8
 → existing current-subject Saju calculation HTTP handler
 → existing Supabase Member verifier over real local HTTP (synthetic identity)
 → existing subject transaction code under non-BYPASSRLS login
 → real ephemeral PostgreSQL18 over 127.0.0.1
    - transaction-local subject
    - force-RLS owner fixture and a foreign owner row
    - real SQL functions with 80ms synthetic DB query delay
    - PostgreSQL pool max 2, acquisition deadline 125ms
 → existing Saju calculation HTTP adapter over real local HTTP
    - **synthetic admitted calculation response, not real Saju engine**
 → HTTP response, no-store transport and safe error mapping
```

All test accounts and birth records are fixed synthetic fixtures. The local PostgreSQL cluster and HTTP services are ephemeral. No secrets from GitHub environments or Production URLs are referenced; the pre-existing manual runner rejects hosted DB/project credentials and only runs from `main` on GitHub Ubuntu26.04. The CI runner remains `contents: read`. A synthetic service timeout, injected Auth failure and injected DB failure demonstrate caller behavior and no unintended Saju retry. Real DB query timing/pool pressure is independently reported. This is not a real Production schema or Hosted Supabase Auth service.

## Expected machine-readable evidence

- Marker `MYEONGHA_REAL_PG18_PRODUCT_PATH_PHASE10_11_PASS`.
- `baseline`: 12 sequential product calculations all HTTP 200.
- `contended`: 32 requests, 8 client workers, DB max 2, expected bounded 503 pressure.
- `dbAcquireP95Ms`, `dbQueryP95Ms`, `dbPeak`: actual ephemeral PostgreSQL18 client measurements.
- `sajuTimeoutUnavailable`, `authUnavailable`, `dbUnavailable` and `healthUnaffected`: bounded dependency error behavior and independent Health.
- `databaseTransport=actual_ephemeral_postgres18_rls`; `sajuEngineTransport=synthetic_response_not_real_engine`.
- Existing isolated PG18 proof JSON artifact extends with an `isolatedProductPath` object after **actual manual run** and schema+flag checks. `BLOCKED_INCOMPLETE` continues for any unsuccessful manual run.

## Acceptance boundaries

Implementation alone is **not** observed 5m/15m capacity, actual Saju + DB end-to-end, actual Provider network performance, Production safe concurrency, approved auto-scaling threshold, Hosted Auth/Storage recovery, or live Production smoke. Do not interpolate measurements from independent runners or promote synthetic errors to claimed actual dependency outages. No Product/DB schema migration or feature activation.

The existing `#1887` migration-history and Hosted disaster recovery blocker remains OPEN. `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, `serviceResumptionAllowed=false`, `outputContainsIdentifiers=false`.

**Next within the approved roadmap:** confirm PR CI; after the code is on current `main`, execute the existing manual isolated PostgreSQL18 workflow once under its guards, verify and preserve the exact output artifact, then determine which remaining representative transport/engine/5m–15m gaps are still unmeasured. No additional workflow or paid external target is introduced.
