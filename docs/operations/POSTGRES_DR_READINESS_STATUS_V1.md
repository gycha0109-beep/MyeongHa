# PostgreSQL DR Readiness Status v1

> Issue: #389  
> Evidence date: 2026-09-21 KST  
> Purpose: record measured restore evidence separately from unresolved privacy/legal-retention and RPO/RTO authority.

## Current evidence

```yaml
latest_governed_backup_run_id: 35536655149
latest_governed_backup_source_sha: 00580651fa79c6361a03d09f207b6c27678d2714
latest_governed_backup_artifact_id: 10612622254
latest_governed_backup_artifact_name: myeongha-postgres-20260920T204732Z
latest_governed_backup_artifact_expires_at: 2026-10-20T20:50:05Z
latest_governed_backup_artifact_digest: sha256:259681c964817bbb0cf534a9a142d417503a499281dd8f20b996094c535a3c0f
latest_governed_backup_completed_at_utc: 2026-09-20T20:50:05Z
latest_proven_backup_migration_frontier: 1230
production_schema_latest_deployed_migration: 1230
production_schema_deploy_run_id: 35522337472
production_schema_deploy_head_sha: 217698890a49c525ab043ac902037f2029227fa4
current_repository_migration_frontier: 1230
backup_schema_freshness: CURRENT_FOR_DEPLOYED_MIGRATION_1230
backup_refresh_required: false

latest_isolated_restore_run_id: 35331742188
latest_isolated_restore_result: SUCCESS
latest_isolated_restore_target: github-actions-loopback-supabase-postgres
latest_isolated_restore_runtime_head_sha: f736381f21171a1480292988e97c61ca68a5e62b
latest_isolated_restore_evidence_artifact_id: 10541321355
latest_isolated_restore_evidence_artifact_expires_at: 2026-10-18T09:52:36Z
latest_isolated_restore_backup_migration_frontier: 1120
restore_evidence_envelope_runtime: PROVEN_ON_RUN_35331742188
isolated_restore_validation_duration_seconds: 2
manual_drill_workflow_elapsed_seconds: 52
synthetic_data_loss_window_seconds: 4
provider_managed_data_full_restore: false
provider_managed_data_blocks_projected: 3
provider_managed_data_blocks_skipped: 27

historical_post_backup_privacy_delta_count_audit_workflow: RUNTIME_PROVEN
historical_post_backup_privacy_delta_count_audit_run_id: 35353128407
historical_post_backup_privacy_delta_count_audit_result: SUCCESS
historical_post_backup_privacy_delta_count_audit_runtime_head_sha: 532a92e061506bfac8f9485e84ebbab8d756f1db
historical_post_backup_privacy_delta_count_audit_artifact_id: 10550013004
historical_post_backup_privacy_delta_count_audit_artifact_name: postgres-privacy-delta-count-audit-35353128407
historical_post_backup_privacy_delta_count_audit_artifact_expires_at: 2026-10-18T13:56:23Z
historical_post_backup_privacy_delta_count_audit_artifact_digest: sha256:87010c5c12b2ac319f1b6ef71b0829ab713c13a70189d294a8af720e9a2d6374
historical_post_backup_privacy_delta_count_audit_backup_completed_at_utc: 2026-09-18T09:23:19Z
historical_post_backup_privacy_delta_count_audit_completed_at_utc: 2026-09-18T13:56:22Z
historical_privacy_delta_audit_observed_delta_total: 0
historical_privacy_delta_audit_observed_deltas: false
historical_privacy_delta_audit_authority: COUNT_ONLY_OBSERVATION_NON_AUTHORITATIVE

privacy_recovery_ledger_workflow: RUNTIME_PROVEN
privacy_recovery_ledger_run_id: 35539838537
privacy_recovery_ledger_result: SUCCESS
privacy_recovery_ledger_runtime_head_sha: 5bb5de08ef211f78565d06c1f9c4ff0c0ec8a956
privacy_recovery_ledger_backup_run_id: 35536655149
privacy_recovery_ledger_backup_completed_at_utc: 2026-09-20T20:50:05Z
privacy_recovery_ledger_artifact_id: 10614412005
privacy_recovery_ledger_artifact_name: myeongha-privacy-ledger-20260920T214938Z
privacy_recovery_ledger_artifact_expires_at: 2026-10-20T21:49:39Z
privacy_recovery_ledger_artifact_digest: sha256:c048023ae254a8aa176a4c0c23f0853c699f902711bfefe350200ab4718f70ef
privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1
privacy_recovery_ledger_scope: governed_backup_completion_lt_event_lte_captured_at
privacy_recovery_ledger_retention: P30D
authoritative_post_backup_source: true_bounded_captured_window_only

account_deletion_finalizer_runtime: IMPLEMENTED_AND_PROVIDER_MECHANICS_SEPARATELY_PROVEN
recovered_state_finalization_drill: IMPLEMENTED_MERGED_POST_MERGE_CI_GREEN
recovered_state_finalization_restored_backup_runtime: PENDING_CURRENT_FRONTIER_ISOLATED_RESTORE
authoritative_privacy_reconciliation: false
future_safe_privacy_reconciliation: false
privacy_reconciliation: BLOCKED_BY_FRESH_RESTORE_RUNTIME_AND_APPLICABLE_AUTHORITATIVE_DELTA_PROOF
rpo_authority: OPEN_DECISION
rto_authority: OPEN_DECISION
dr_ready: false
```

The latest governed backup is run `35536655149`, source SHA `00580651fa79c6361a03d09f207b6c27678d2714`, artifact `10612622254` (`myeongha-postgres-20260920T204732Z`). Its exact completion cutoff is `2026-09-20T20:50:05Z`. Production deployment run `35522337472` had already applied migrations `1220` and `1230`, and the backup source SHA contains repository migration frontier `1230`. The governed backup is therefore current for the deployed/repository migration frontier `1230`; the remaining current-schema gap is the isolated restore runtime, not backup freshness.

The latest isolated restore runtime evidence remains run `35331742188` against the older governed backup frontier. Artifact `10541321355` proves application-data portability, projected provider COPY handling, Auth identity continuity for the supported loopback scope, and the earlier synthetic replay mechanics. Its 2-second isolated restore/validation, 52-second workflow elapsed time, and 4-second synthetic loss window remain diagnostics only. None is an approved RTO or RPO, and none represents a full achieved recovery duration.

Historical count-only audit run `35353128407` remains valid evidence for its exact 2026-09-18 observation interval only: it observed zero deltas across the seven audited timestamp-authoritative surfaces and is retained as `COUNT_ONLY_OBSERVATION_NON_AUTHORITATIVE`. It no longer defines current post-backup source authority; the promoted bounded ledger below supersedes that source-authority question.

The promoted encrypted off-primary-DB privacy recovery ledger has a newer scheduled runtime proof bound to the current-frontier backup. Production PostgreSQL Privacy Recovery Ledger run `35539838537` completed successfully from repository SHA `5bb5de08ef211f78565d06c1f9c4ff0c0ec8a956`, selected governed backup run `35536655149` and artifact `10612622254`, used cutoff `2026-09-20T20:50:05Z`, executed the read-only export path, and uploaded encrypted artifact `10614412005` (`myeongha-privacy-ledger-20260920T214938Z`) with P30D retention. The ledger remains authoritative only for its exact captured window under `AUTHORITATIVE_CAPTURED_WINDOW_V1`; it is not unbounded or future-safe, and incident references later than coverage remain fail-closed.

The governed account-deletion finalizer, hosted Auth deletion adapter/canary path, completion authority, worker identity, and recovered-state synthetic finalization mechanics are now implemented. PRs #1141 and #1143 extend the recovery drill through exact worker claim, DB finalizer, isolated synthetic Auth ACK, completion ACK, idempotent completion replay, non-resurrection representatives, and revoked P5Y Commerce retention. Post-merge CI on main `00580651fa79c6361a03d09f207b6c27678d2714` is green. However, those finalization mechanics have not yet been exercised by the isolated restore workflow against a fresh governed backup containing the current recovery/finalizer frontier. Therefore authoritative privacy reconciliation remains false.

## Promotion blockers

The privacy/legal-retention policy and bounded captured-window source authority are no longer open decisions. The destructive finalizer mechanics are also implemented, and a governed backup current through migration `1230` now exists. DR remains blocked because the latest isolated restore evidence is still only frontier `1120`; the merged recovered-state finalization drill still needs runtime execution against governed backup `35536655149`, provider-service gaps remain outside full restore equivalence, and numeric RPO/RTO authority is still OPEN.

Canonical authority remains unresolved in the existing source documents:

- `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`: `RPO = OPEN DECISION`, `RTO = OPEN DECISION`, and no DR Ready claim before approved objectives plus achieved evidence.
- `docs/P0_DECISION_REGISTER.md`: parent `P0-PR-01` is `DECIDED`; the current reachable policy baseline is 39 DELETE / 4 ANONYMIZE / 9 RETAIN(P5Y), with P30D encrypted backup handling and bounded captured-window privacy recovery source authority.
- `docs/AUTH_RLS_PRIVACY_SPEC.md`: account deletion keeps personalization erase separate from the approved nine-table `P5Y` Commerce retention baseline; destructive runtime finalization is implemented, while recovered-state authoritative execution evidence remains separately gated.
- `docs/SOURCE_AUTHORITY_GAPS.md`: `SRC-06` remains blocking before the final standalone Birth/Target deletion DDL baseline.
- GitHub issue `#964`: product-owner policy authority and bounded source authority are resolved; closure now depends on fresh recovered-state runtime evidence and the remaining reconciliation boundary.

Therefore restore success must remain classified as mechanics evidence only:

```text
latest governed backup             = yes — run 35536655149
backup current-schema freshness    = yes — backup/deployed/repository frontier 1230
isolated application restore       = yes — run 35331742188, older frontier
application integrity/auth baseline= yes — run 35331742188, supported loopback scope
self-contained evidence envelope   = runtime-proven on older frontier
bounded privacy source authority   = yes — run 35539838537 / AUTHORITATIVE_CAPTURED_WINDOW_V1
account-deletion finalizer runtime = implemented
recovered finalization mechanics   = implemented / post-merge CI green
recovered finalization on current-frontier governed restore = pending
authoritative privacy reconciliation= false
future-safe privacy reconciliation = false
approved RPO                       = no
approved RTO                       = no
DR Ready                           = false
```

## Change rule

Do not flip `dr_ready` to true merely because another restore succeeds or because measured diagnostic values improve.

Promotion requires all of the following authority changes to be reviewed together:

1. The approved `P0-PR-01` finalization policy is implemented as an idempotent, FK-safe destructive finalizer and hosted Auth cleanup path.
2. The applicable deletion/revocation/finalization reconciliation procedure is exercised against an isolated recovered state with non-zero or intentionally constructed authoritative deltas.
3. Numeric RPO and RTO objectives are explicitly approved by the owning product/business authority.
4. Achieved evidence is compared against those approved objectives.
5. The #389 closure contract is updated with the exact evidence and only then may DR readiness be reconsidered.

`scripts/verify-postgres-dr-readiness-authority.mjs` fail-closes repository CI while the canonical authority remains in the current OPEN state.


## Privacy reconciliation replay foundation

A policy-neutral replay planner now exists at:

```text
scripts/build-postgres-privacy-reconciliation-plan.mjs
```

It can deterministically compile post-backup account-deletion-start and revocation events into existing idempotent PostgreSQL command calls. Direct destructive DML remains outside the planner. Account-deletion finalization is executed by the separately governed worker/finalizer authority, and Commerce retention remains governed by the approved P5Y policy rather than by planner inference.

This advances recovery mechanics but does not remove the promotion blockers:

```text
revocation replay plan mechanics     = implemented
bounded post-backup source authority = runtime-proven — run 35539838537
destructive account finalization     = implemented under governed worker authority
recovered-state finalization drill   = implemented / post-merge CI green
fresh governed restore execution     = pending isolated restore from backup 35536655149
commerce legal retention             = decided — approved 9-table P5Y baseline
authoritative privacy reconciliation = not yet proven on fresh recovered state
future-safe privacy reconciliation   = false
DR Ready                             = false
```

The planner output report is identifier-free; the executable SQL contains required resource identifiers and must remain an ephemeral operator artifact rather than uploaded DR evidence.
