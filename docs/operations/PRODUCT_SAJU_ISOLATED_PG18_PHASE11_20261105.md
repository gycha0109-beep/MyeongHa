# Phase 10–11 — Actual isolated PostgreSQL18 product request path implementation (2026-11-05)

> Track: `ops` / `Watchtower-Track: ops`
> Code: `test/ops/product-saju-isolated-pg18-phase11.test.mjs`
> Runner: existing `postgres-isolated-rls-capacity-acceptance.yml` → `run-isolated-postgres-phase7-phase11-ci.sh`
> **Execution status: ACTUAL ISOLATED PG18 GITHUB LINUX OBSERVATION VERIFIED (2026-11-05); Production acceptance NOT PROVEN.**

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


## Verified actual Linux measurement and preserved original (2026-11-05 KST)

- **GitHub Actions:** [manual isolated PostgreSQL18 run #41908376007](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41908376007), **SUCCESS** on exact `main` `b536a7e232f9f7810c0ba5c02e906789c706c369` (fix PR #2985 merged after integration CI [#41902288435](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41902288435) SUCCESS). Independent actual source: artifact **13362285487**, `isolated-pg18-phase7-phase11-41908376007`.
- **Original immutable bytes:** [3,747-byte sanitized JSON](POSTGRES_REAL_PRODUCT_PATH_LINUX_OBSERVATION_20261105.json) with SHA-256 **`b582350aa1d839d1ae5b7813b930dc43c3859a4c30dda323078dd2f311f9bb6e`**. [Independent offline verifier](../../scripts/operations/verify-isolated-pg18-product-linux-proof-phase11.mjs) compares original bytes and source commit, all request counts, latency monotonicity, pool constraints, dependency failure mapping and false Production/DR flags. The independent verifier ran successfully against the preserved original.
- **Actual disposable DB and RLS:** PostgreSQL18 transaction subject/RLS assertion **1/1 PASS**. Existing synthetic SQL pool max=2, 80ms query delay and 140ms admission deadline: 96 requests at concurrency 1,2,4,8. At concurrency 8, 16/32 completed and 16/32 acquisition timeouts; observed peak connections 2; recovery PASS. This is a synthetic SQL pool limit, **not** actual Production DB capacity.
- **Product request path:** existing production HTTP handler with real isolated PostgreSQL18 and local synthetic Auth and Saju HTTP. Sequential baseline **12/12 HTTP 200**, successful p50/p95/p99 **86.399/102.006/113.778ms**. Concurrency 8: **16/32 HTTP 200, 16/32 expected HTTP 503**, no unexpected codes; successful-only p50/p95/p99 **174.088/212.375/212.753ms**. Connection acquisition p95 **123.710ms**, SQL query p95 **81.809ms**. One each of simulated Saju timeout, Auth failure, DB failure maps to dependency-unavailable, and Health remains successful.
- **Previous RED classified correctly:** [first attempt #41897344670](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41897344670) was **FAILURE** because Vitest stdout marker extraction failed after tests passed; its 441-byte archive contained `BLOCKED_INCOMPLETE`. The proof-file handoff repair was merged in PR #2985. Do not promote the failed artifact as evidence.
- **Scope and remaining gates:** Saju response is **synthetic**, not the actual Saju engine; Auth endpoint is synthetic local HTTP; DB is a disposable local Postgres18 instance with test RLS/functions, not hosted schema, user data, Production TLS or provider capacity. No 5m/15m integrated run, real engine+DB topology ceiling, Production TPS/SLO, scaling threshold, Hosted DR or service resumption proven. `productionRlsProven=false`, `productionCapacityProven=false`, `productionScalingThresholdApproved=false`, `drReady=false`, `serviceResumptionAllowed=false`, `outputContainsIdentifiers=false`. [P0 #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) remains OPEN.
