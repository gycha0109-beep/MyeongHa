# Phase 10–11 — Product Saju API/Auth/DB/Saju combined request-path probe (2026-11-05)

> Track: `ops` / `Watchtower-Track: ops`
> Implementation: `test/ops/product-saju-synthetic-path-phase10-11.test.mjs`
> Current claim: **integrated synthetic dependency boundary test; NOT actual multi-service capacity evidence**.

## Existing approved gap

The production operations architecture §28–29 and Phase 10–11 require representative product-path HTTP latency and separate Auth, DB connection/query and Saju dependency measurements. Existing measurements were isolated public Worker Health, real ephemeral PostgreSQL pool, and isolated real Saju resource pressure. None independently proved an authenticated product call through all dependencies.

## Implemented bounded path

```text
127.0.0.1 HTTP client (bounded 12 single / 32 concurrency-8 requests)
  -> actual production current-subject Saju calculation HTTP handler
  -> actual 127.0.0.1 HTTP Supabase Member verifier transport (synthetic Member)
  -> production transaction / birth-profile query code with synthetic bounded pool (max 2)
  -> actual 127.0.0.1 HTTP Saju calculation adapter (synthetic admitted response)
  -> governed JSON response / cache-control:no-store
```

The test uses **synthetic identities and fixed birth input only**, creates disposable loopback HTTP listeners, contains no Production binding or provider credential, and does not reach a public origin. It reports counts, aggregate response p50/p95/p99, peak synthetic DB concurrent connections, no unbounded retry during Saju timeout, independent Health availability, Auth and DB fail-closed failures, and secret non-reflection in responses. Test is run through the pre-existing Vitest suite; it creates no new CI workflow.

## Evidence and limitations

- `baseline`: 12 sequential authenticated Saju requests.
- `contended`: 32 requests through 8 concurrent local HTTP clients; synthetic DB acquisition budget = 2.
- `sajuTimeoutUnavailable`: one explicitly slowed loopback Saju upstream, with no automatic duplicate Saju HTTP request.
- `authUnavailable` / `dbUnavailable`: injected failures must not call the Saju service.
- `healthUnaffected`: independent loopback `/api/health` remains HTTP 200.
- All error/success HTTP bodies checked against synthetic bearer, API key, internal TCP address and DB error text.
- This test reports `databaseTransport=synthetic_pool_not_real_postgres` and `sajuEngineTransport=synthetic_response_not_real_engine` by design.
- **NOT PROVEN:** actual PostgreSQL connection acquisition and SQL, real Saju engine throughput, production-like network geometry, Provider runtime memory/CPU, Production TPS/p95, safe scaling threshold, DR readiness, service resumption.
- Existing `postgres-isolated-rls-capacity-acceptance.yml` and Saju Linux saturation evidence remain distinct real-transport evidence. This test does not combine or relabel their numbers.

## Verification

Run `npx vitest run test/ops/product-saju-synthetic-path-phase10-11.test.mjs` (or the existing repository standard test suite). Capture the exact commit/PR CI evidence before calling this test PASS. Its machine-readable sanitized marker is `MYEONGHA_SYNTHETIC_PRODUCT_PATH_PHASE10_11_PASS`.

**Next approved gap:** Replace the synthetic pool and the synthetic Saju response with a controlled, disposable actual PostgreSQL subject/RLS environment and pinned actual Saju engine respectively; observe isolated connection/query/HTTP/CPU limits independently. The present test provides the first combined request contract, not the full Phase 11 acceptance. No Production or paid hosted environment should be modified.

All admission flags remain false: `productionCapacityProven`, `productionScalingThresholdApproved`, `drReady`, `serviceResumptionAllowed`, `outputContainsIdentifiers`.
