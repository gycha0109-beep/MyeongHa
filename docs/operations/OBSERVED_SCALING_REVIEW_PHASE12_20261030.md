# Phase 12 — Observed concurrency scaling-review trigger

Authority: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §30 and §38 Phase 12.

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
