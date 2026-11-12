# Production Operations worklog — Phase 12 decision runbook

2026-11-08 KST · Watchtower-Track: ops

## Completed this unit

- Applied the approved Gate 3 existing evidence only (5-minute paced 300/300; 15-minute four-way workerd 3600/3600; PG max-two pool failures at concurrency eight; 0.01-vs-0.50 Saju CPU paired observation).
- Added [manual scaling decision runbook](PHASE12_MANUAL_SCALING_DECISION_RUNBOOK_20261108.md) specifying how to distinguish DB, Auth, Saju CPU and memory pressure, when to hold, request scoped increase/decrease, check after changes, and require a rollback candidate.
- Kept observed fixture quantities separate from any Production numerical thresholds, and documented how to record exact source, incident, metrics and user operator decision. No repeated load test or synthetic experiment was invoked.
- Set current Production action `HOLD`; `automaticScalingEnabled=false`, `productionCapacityProven=false`, `numericalProductionScalingThresholdApproved=false`. The runbook is a method, not a capacity approval.

## Remaining and next

- If existing Phase 11 PR #3117 passes exact-source Linux DB outage/recovery one-shot, attach its artifact and finish the remaining Phase 11 failure combination. Do not mark this test passed on PR CI alone.
- Apply this procedure to Production-version measurements only after Phase 8 DR gate and approval constraints are met; the existing synthetic observations alone are not live scalability limits.
- Primary blocker remains Phase 8 #1887: Hosted Auth/Storage recovery, independent privacy replay and whole-service RPO/RTO. `dr_ready=false`, `serviceResumptionAllowed=false` unchanged.
- Merge via standard required GitHub CI Integration; do not relax protection.

No Production data/config/traffic/secret/IAM/canary changes and no paid resources. No extra approval is requested merely to merge this documentation.

Watchtower-Track: ops
