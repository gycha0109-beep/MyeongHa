# Production Operations worklog — Phase 11 isolated workerd DB outage/recovery

Date: 2026-11-08 KST | Track: `ops`

Source baseline: `9740e36ed1c6c49a9eb771c0048b890aa70e0e03`
Authoritative exit roadmap: `docs/operations/PRODUCTION_OPERATIONS_EXIT_ROADMAP_20261107.md`
Scoped to Phase 11's **missing real-DB failure / bounded-fail / recovery** combination; prior 900-second workerd overlap #42244701347 remains valid and is not repeated.

## Implemented in this work unit

- Added `workerd_db_failover` experiment to the existing **disposable, main-only** Linux PostgreSQL 18 + GoTrue + pinned Saju + local workerd harness. It does not connect to Production or Hosted Hyperdrive.
- After successful four synthetic-member baseline, stops the **actual isolated PG18 process** with `pg_ctl stop -m fast -w`, checks that four authenticated calculations return bounded dependency `503`, and checks independent Worker Health `200`.
- Restarts the same isolated PostgreSQL 18 cluster, confirms it accepts SQL, and requires four authenticated calculations to recover (at most eight bounded attempts). The unchanged Saju service remains running to isolate the DB failure cause.
- Added exact-shape, privacy-preserving JSON acceptance to the existing workerd proof script. Existing Saju outage experiments and 900-second overlap retain their own assertions.
- Added a one-shot, main-only, exact-title gated GitHub Actions trigger, restricted to `.github/ops/phase11-workerd-db-failover-20261108.once`, so the short missing-scenario proof can actually run once following compliant PR integration and merge.
- Bounded evidence explicitly leaves `productionWorkerAdmissionMeasured=false`, `hostedHyperdriveMeasured=false`, `productionCapacityProven=false`, `drReady=false`, `serviceResumptionAllowed=false`.

## Validation and closure boundary

**Implementation committed, real Linux run NOT YET VERIFIED at authoring.**
Only a successful exact-source integration, one-shot main GitHub Actions run, sanitized proof artifact and cleanup can establish Phase 11's newly added DB-outage case. A PR being green or the marker being merged is not substitute evidence. The job has no Production credentials, real user records, external traffic, schema migration or paid resource.

## Remaining

Phase 8 Hosted Auth/Storage provider-equivalent restoration, independent Production privacy continuity, whole-service RPO/RTO and Phase 13 acceptance remain outstanding. P0 #1887 stays open. The current owner's blanket approval does not remove the roadmap's exact-string Production privacy canary guard or justify unknown paid-resource charges / unspecified Production DDL.

Next: allow required CI Integration Verify, then inspect exact main-only proof. If it passes, record actual measured result and proceed to the approved Phase 12 manual scale criteria without promoting isolated metrics to Production thresholds.

Watchtower-Track: ops
