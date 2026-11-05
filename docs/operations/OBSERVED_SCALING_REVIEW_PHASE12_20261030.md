# Phase 12 — Observed concurrency scaling-review trigger

Authority: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §30 and §38 Phase 12.

## Isolated product-chain review

The [actual Linux product-chain observation](REAL_GOTRUE_PG18_SAJU_SUSTAINED_LINUX_OBSERVATION_20261105.json) supports a manual DB pool headroom review. Concurrency 4 was the highest clean short test. Concurrency 8 produced 12 HTTP 503 responses out of 32 and the pool reached its two-connection budget during the run. The evidence does not assign each short-run 503 to a specific dependency.

```sh
node scripts/operations/derive-isolated-product-scaling-review.mjs \
  docs/operations/REAL_GOTRUE_PG18_SAJU_SUSTAINED_LINUX_OBSERVATION_20261105.json \
  9ea61382aad65231d8fbda095a7f5b1da9f515b9 \
  10513f4219f80eaf0f7d1b194683be6f00c4a8585505ac0ce6dd3eb53f9da90e
```

The review checks the source, original bytes, complete request accounting, cleanup and the observed Saju constraints. It keeps the short concurrency ramp separate from the sustained windows. The 15-minute run handled four arrivals per second with a measured peak of one request in flight. SQL p95 was 81.435ms including the fixture's deliberate 80ms delay, Auth response headers p95 was 27.185ms and Saju adapter p95 was 1.954ms. Saju recorded zero CPU throttle periods and zero OOM kills in both windows. These observations leave sustained overlapping-request limits, Worker product-runtime capacity and Production scaling or downscaling thresholds open.

### Overlapping arrivals and measured DB pressure

The [15-minute four-way observation](REAL_GOTRUE_PG18_SAJU_OVERLAP_LINUX_OBSERVATION_20261105.json) uses the same command with main `d08636181b0957721b5a318898510f4045264b96` and SHA-256 `c8691b44ab15ac67874a3526778bbf0593ab21b603e425dd00b7adec29db8941`. The analyzer verifies the four-client wave, four concurrent calculations at the gateway and short-probe DB acquisition counts before returning the review.

The paced and overlapping trials each offered 4 requests/s. In the overlapping trial the gateway admitted four concurrent requests in all 900 waves, and DB acquisition p95 was 83.171 ms compared with 0.066 ms in the earlier paced trial. Both trials used the two-connection fixture with an 80 ms SQL delay. This is a cross-run observation for those constraints. The short concurrency-8 ramp in the overlap run recorded 16 acquisition failures and 16 HTTP 503 responses. This supports reviewing pool headroom, bounded acquisition waits and query duration before increasing API concurrency. The successful overlap trial, without Saju throttling, leaves the combined Saju ceiling and Production scaling settings unapproved.

## Public diagnostic route review

`scripts/derive-observed-scaling-review.mjs` consumes an **array of actual Phase 11 collector JSON reports** from a single controlled non-production loopback diagnostic route. It combines repeated measurements at the same concurrency level conservatively, preserving any observed non-200 or transport failures. It does **not** invent a numeric service SLO, scaling ceiling, production target or Saju/DB performance claim.

## Execute

Collect reports using the already implemented Phase 11 collector, save their JSON output to a local-only file as an array (measure at distinct concurrency values; e.g. 1, 2, 4, 8), then run:

```sh
node scripts/derive-observed-scaling-review.mjs --input ./local-phase11-reports.json
```

The public report contains:

- `observedConcurrencyLevels`: counts, highest observed successful p95, and failures per tested concurrency;
- `firstObservedFailureConcurrency`: first tested level with a real non-200 or transport failure, or `null`;
- `highestCleanConcurrencyBeforeFailure`: highest lower tested level with no observed failure (NOT a guarantee of capacity);
- `diagnosticScalingReviewAtOrAboveConcurrency`: the first measured failure level, only when a lower clean level exists and later measured levels do not contradict it;
- `status`: `OBSERVED_FAILURE_BOUNDARY`, `NO_DEGRADATION_OBSERVED`, `NONMONOTONIC_OUTCOMES`, or `NO_CLEAN_LOWER_CONCURRENCY`.

**The trigger is to investigate local diagnostic degradation, not to auto-scale Production.** Mixed routes, malformed data, invented successes, incomplete requests, or unsupported privacy/target claims are rejected. No failure means **no threshold inferred**. A failure at the lowest measured concurrency means **no preceding clean level inferred**. A higher tested level with no failure after a lower level with failures invalidates a single monotonic failure boundary.

`automaticScalingEnabled=false`, `productionCapacityProven=false`, `dbConnectionBudgetProven=false`, `sajuResourceCeilingProven=false`, `numericalProductionScalingThresholdApproved=false` remain explicit. Phase 12's production thresholds need real service measurements, DB pool headroom and Saju CPU/memory envelopes. This implementation handles the documented *measured concurrency -> review signal* step without pretending that data exists.

Watchtower-Track: ops
