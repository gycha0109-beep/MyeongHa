# PostgreSQL DR Readiness Status v1

> Issue: #389  
> Evidence date: 2026-09-18 KST  
> Purpose: record measured restore evidence separately from unresolved privacy/legal-retention and RPO/RTO authority.

## Current evidence

```yaml
backup_run_id: 35329018925
latest_proven_backup_source_sha: e1a6500968f7722666cae2038fd49ddf3f9d3540
backup_artifact_id: 10540625562
backup_artifact_name: myeongha-postgres-20260918T092042Z
backup_artifact_expires_at: 2026-10-18T09:23:19Z
backup_encrypted_sha256: 96c40cb4c61f71d56a97dd9af34a2c31eb4674809a501f435b2634c12043a394
production_schema_latest_deployed_migration: 1120
production_schema_deploy_run_id: 35324012524
production_schema_deploy_head_sha: eddc1c331b6a8c0f47f54c150acd2f6cc5c7c0c2
backup_schema_freshness: CURRENT_FOR_DEPLOYED_MIGRATION_1120
backup_refresh_required: false
backup_to_restore_head_migration_delta_count: 0
restore_run_id: 35331742188
restore_result: SUCCESS
restore_target: github-actions-loopback-supabase-postgres
restore_runtime_head_sha: f736381f21171a1480292988e97c61ca68a5e62b
restore_evidence_artifact_id: 10541321355
restore_evidence_artifact_expires_at: 2026-10-18T09:52:36Z
restore_evidence_envelope: IMPLEMENTED_CI_VERIFIED
restore_evidence_envelope_runtime: PROVEN_ON_RUN_35331742188
restored_db_synthetic_privacy_replay: IMPLEMENTED_CI_VERIFIED
restored_db_synthetic_privacy_replay_runtime: PROVEN_ON_RUN_35331742188
isolated_restore_validation_duration_seconds: 2
manual_drill_workflow_elapsed_seconds: 52
synthetic_data_loss_window_seconds: 4
provider_managed_data_full_restore: false
provider_managed_data_blocks_projected: 3
provider_managed_data_blocks_skipped: 27
synthetic_privacy_replay_event_count: 4
authoritative_post_backup_source: false
post_backup_privacy_delta_count: 0
privacy_reconciliation: BLOCKED_BY_P0_PR_01_AND_ISSUE_964
rpo_authority: OPEN_DECISION
rto_authority: OPEN_DECISION
dr_ready: false
```

Manual restore run `35331742188` completed successfully from current main head `f736381f21171a1480292988e97c61ca68a5e62b` using fresh production backup run `35329018925`. The backup source SHA is `e1a6500968f7722666cae2038fd49ddf3f9d3540`, taken after production migration `1120` was deployed. A fresh comparison from that backup source to the restore head found **zero** changes under `supabase/migrations/`. Current-production-schema backup freshness and restore portability are therefore proven through deployed migration `1120`.

Artifact `10541321355` (`postgres-isolated-restore-drill-35331742188`) contains both `restore-evidence.json` and `privacy-reconciliation-evidence.json`. The restore evidence records envelope version `myeongha-postgres-isolated-restore-evidence-envelope-v1`, exact backup/source bindings, 2-second restore/validation, 3 projected provider COPY blocks, 27 skipped provider COPY blocks, `provider_managed_data_full_restore=false`, Auth identity continuity PASS, and `dr_ready=false`. The privacy evidence records four synthetic replay events, identical second-replay idempotency PASS, negative terminal-state fail-closed PASS, `authoritative_post_backup_source=false`, and `dr_ready=false`.

The 2-second value is the measured isolated restore/validation diagnostic from run `35331742188`. The 52-second value is GitHub workflow dispatch-to-completion elapsed time for that manual drill. The 4-second value is the synthetic data-loss-window diagnostic for the selected incident reference. None is an approved RTO or RPO, and the 52-second workflow elapsed time is not a full achieved recovery duration because authoritative privacy/legal-retention reconciliation remains outside the run.

A count-only production audit against the governed backup completion point found zero post-backup privacy state deltas on the timestamp-authoritative surfaces checked for this tested interval. Zero observed deltas means there was nothing to replay for that interval; it does not prove the future-safe deletion/revocation/legal-retention reconciliation procedure.

## Promotion blockers

Current-schema recovery freshness is now evidenced through deployed migration `1120` by backup run `35329018925` and restore run `35331742188`. This removes the schema-freshness blocker only; it does not resolve the independent privacy/legal-retention, provider-service, or RPO/RTO gates.

Canonical authority remains unresolved in the existing source documents:

- `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`: `RPO = OPEN DECISION`, `RTO = OPEN DECISION`, and no DR Ready claim before approved objectives plus achieved evidence.
- `docs/P0_DECISION_REGISTER.md`: parent `P0-PR-01` retention / backup / legal-retention authority remains `OPEN-P0`.
- `docs/AUTH_RLS_PRIVACY_SPEC.md`: account deletion must keep personalization erase separate from legally retained commerce data, but the legal/accounting/backup retention duration and final Commerce tombstone/pseudonymization/destructive schedule remain under `P0-PR-01`.
- `docs/SOURCE_AUTHORITY_GAPS.md`: `SRC-06` remains blocking before the final standalone Birth/Target deletion DDL baseline.
- GitHub issue `#964`: account-deletion finalization and legal-retention authority remains the explicit policy blocker for future-safe recovery reconciliation.

Therefore restore success must remain classified as mechanics evidence only:

```text
backup proven                      = yes — run 35329018925
backup current-schema freshness    = yes — through deployed migration 1120
isolated application restore       = yes — run 35331742188
application integrity/auth baseline= yes — run 35331742188
self-contained evidence envelope   = implemented / CI-verified
envelope runtime evidence          = proven — run 35331742188
restored-DB synthetic privacy replay= implemented / CI-verified
restored-DB synthetic replay runtime= proven — run 35331742188
privacy delta observed in interval = 0
future-safe privacy reconciliation = blocked
approved RPO                       = no
approved RTO                       = no
DR Ready                           = false
```

## Change rule

Do not flip `dr_ready` to true merely because another restore succeeds or because measured diagnostic values improve.

Promotion requires all of the following authority changes to be reviewed together:

1. `P0-PR-01` resolves the deletion/legal-retention/backup-retention authority needed by recovery reconciliation.
2. The applicable deletion/revocation reconciliation procedure is exercised against an isolated recovered state with non-zero or intentionally constructed authoritative deltas.
3. Numeric RPO and RTO objectives are explicitly approved by the owning product/business authority.
4. Achieved evidence is compared against those approved objectives.
5. The #389 closure contract is updated with the exact evidence and only then may DR readiness be reconsidered.

`scripts/verify-postgres-dr-readiness-authority.mjs` fail-closes repository CI while the canonical authority remains in the current OPEN state.


## Privacy reconciliation replay foundation

A policy-neutral replay planner now exists at:

```text
scripts/build-postgres-privacy-reconciliation-plan.mjs
```

It can deterministically compile post-backup account-deletion-start and revocation events into existing idempotent PostgreSQL command calls. Direct destructive DML, account deletion finalization, and commerce retention decisions are outside the planner and fail closed.

This advances recovery mechanics but does not remove the promotion blockers:

```text
revocation replay plan mechanics   = implemented
restored-DB synthetic replay path  = runtime-proven — latest run 35331742188
durable post-backup source authority = not proven
destructive account finalization   = blocked by P0-PR-01 / #964
commerce legal retention           = blocked by P0-PR-01 / #964
authoritative privacy reconciliation= not yet executed against restored DB
DR Ready                           = false
```

The planner output report is identifier-free; the executable SQL contains required resource identifiers and must remain an ephemeral operator artifact rather than uploaded DR evidence.
