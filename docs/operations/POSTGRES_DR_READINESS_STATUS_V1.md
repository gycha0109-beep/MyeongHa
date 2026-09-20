# PostgreSQL DR Readiness Status v1

> Issue: #389  
> Evidence date: 2026-09-21 KST  
> Purpose: record measured restore evidence separately from unresolved privacy/legal-retention and RPO/RTO authority.

## Current evidence

```yaml
latest_governed_backup_run_id: 35467974194
latest_governed_backup_source_sha: 89aeedfb18a865b9e1fb62e39d710006427837d9
latest_governed_backup_artifact_id: 10592011138
latest_governed_backup_artifact_name: myeongha-postgres-20260919T203800Z
latest_governed_backup_artifact_expires_at: 2026-10-19T20:40:17Z
latest_governed_backup_artifact_digest: sha256:8c81e2d2e5702010fd70bda2bed6518f060a69c9a98aad47c1f95686df5ec8b7
latest_governed_backup_completed_at_utc: 2026-09-19T20:40:17Z
latest_proven_backup_migration_frontier: 1120
current_repository_migration_frontier: 1230
backup_schema_freshness: STALE_FOR_CURRENT_REPOSITORY_FRONTIER_1230
backup_refresh_required: true

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

privacy_recovery_ledger_workflow: RUNTIME_PROVEN
privacy_recovery_ledger_run_id: 35531005587
privacy_recovery_ledger_result: SUCCESS
privacy_recovery_ledger_runtime_head_sha: 931de80941683b6cdca45f3181b0a6234f153fed
privacy_recovery_ledger_backup_run_id: 35467974194
privacy_recovery_ledger_backup_completed_at_utc: 2026-09-19T20:40:17Z
privacy_recovery_ledger_artifact_id: 10610943814
privacy_recovery_ledger_artifact_name: myeongha-privacy-ledger-20260920T190310Z
privacy_recovery_ledger_artifact_expires_at: 2026-10-20T19:03:10Z
privacy_recovery_ledger_artifact_digest: sha256:cf7628d62153e0bfc2c0977f03f3b5f5f9de52d69740248a789d648eb80b3d99
privacy_recovery_ledger_authority_class: AUTHORITATIVE_CAPTURED_WINDOW_V1
privacy_recovery_ledger_scope: governed_backup_completion_lt_event_lte_captured_at
privacy_recovery_ledger_retention: P30D
authoritative_post_backup_source: true_bounded_captured_window_only

account_deletion_finalizer_runtime: IMPLEMENTED_AND_PROVIDER_MECHANICS_SEPARATELY_PROVEN
recovered_state_finalization_drill: IMPLEMENTED_MERGED_POST_MERGE_CI_GREEN
recovered_state_finalization_restored_backup_runtime: PENDING_FRESH_CURRENT_FRONTIER_BACKUP
authoritative_privacy_reconciliation: false
future_safe_privacy_reconciliation: false
privacy_reconciliation: BLOCKED_BY_FRESH_RESTORE_RUNTIME_AND_APPLICABLE_AUTHORITATIVE_DELTA_PROOF
rpo_authority: OPEN_DECISION
rto_authority: OPEN_DECISION
dr_ready: false
```

The latest governed backup is run `35467974194`, source SHA `89aeedfb18a865b9e1fb62e39d710006427837d9`, artifact `10592011138` (`myeongha-postgres-20260919T203800Z`). Its exact completion cutoff is `2026-09-19T20:40:17Z`. The backup remains valid governed evidence for its captured schema, but it proves migration frontier `1120` while the repository frontier is now `1230`. The DR authority gate therefore correctly classifies current-schema backup freshness as stale and requires a fresh governed backup before a current-frontier restore can be claimed.

The latest isolated restore runtime evidence remains run `35331742188` against the older governed backup frontier. Artifact `10541321355` proves application-data portability, projected provider COPY handling, Auth identity continuity for the supported loopback scope, and the earlier synthetic replay mechanics. Its 2-second isolated restore/validation, 52-second workflow elapsed time, and 4-second synthetic loss window remain diagnostics only. None is an approved RTO or RPO, and none represents a full achieved recovery duration.

The promoted encrypted off-primary-DB privacy recovery ledger now has post-merge scheduled runtime proof. Production PostgreSQL Privacy Recovery Ledger run `35531005587` completed successfully from repository SHA `931de80941683b6cdca45f3181b0a6234f153fed`, bound itself to governed backup run `35467974194` and cutoff `2026-09-19T20:40:17Z`, executed the read-only export path, and uploaded encrypted artifact `10610943814` (`myeongha-privacy-ledger-20260920T190310Z`) with P30D retention. This closes the former candidate-only source gap: the ledger is authoritative for its exact captured window under `AUTHORITATIVE_CAPTURED_WINDOW_V1`. It is not an unbounded/future-safe source; an incident reference later than the ledger coverage point remains fail-closed.

The governed account-deletion finalizer, hosted Auth deletion adapter/canary path, completion authority, worker identity, and recovered-state synthetic finalization mechanics are now implemented. PRs #1141 and #1143 extend the recovery drill through exact worker claim, DB finalizer, isolated synthetic Auth ACK, completion ACK, idempotent completion replay, non-resurrection representatives, and revoked P5Y Commerce retention. Post-merge CI on main `00580651fa79c6361a03d09f207b6c27678d2714` is green. However, those finalization mechanics have not yet been exercised by the isolated restore workflow against a fresh governed backup containing the current recovery/finalizer frontier. Therefore authoritative privacy reconciliation remains false.

## Promotion blockers

The privacy/legal-retention policy and bounded captured-window source authority are no longer open decisions. The destructive finalizer mechanics are also implemented. DR remains blocked because the latest governed backup/restore evidence is stale relative to repository migration frontier `1230`, the merged recovered-state finalization drill still needs runtime execution against a fresh governed recovered state, provider-service gaps remain outside full restore equivalence, and numeric RPO/RTO authority is still OPEN.

Canonical authority remains unresolved in the existing source documents:

- `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`: `RPO = OPEN DECISION`, `RTO = OPEN DECISION`, and no DR Ready claim before approved objectives plus achieved evidence.
- `docs/P0_DECISION_REGISTER.md`: parent `P0-PR-01` is `DECIDED`; the current reachable policy baseline is 39 DELETE / 4 ANONYMIZE / 9 RETAIN(P5Y), with P30D encrypted backup handling and bounded captured-window privacy recovery source authority.
- `docs/AUTH_RLS_PRIVACY_SPEC.md`: account deletion keeps personalization erase separate from the approved nine-table `P5Y` Commerce retention baseline; destructive runtime finalization is implemented, while recovered-state authoritative execution evidence remains separately gated.
- `docs/SOURCE_AUTHORITY_GAPS.md`: `SRC-06` remains blocking before the final standalone Birth/Target deletion DDL baseline.
- GitHub issue `#964`: product-owner policy authority and bounded source authority are resolved; closure now depends on fresh recovered-state runtime evidence and the remaining reconciliation boundary.

Therefore restore success must remain classified as mechanics evidence only:

```text
latest governed backup             = yes — run 35467974194
backup current-schema freshness    = no — proven frontier 1120; repository frontier 1230
isolated application restore       = yes — run 35331742188, older frontier
application integrity/auth baseline= yes — run 35331742188, supported loopback scope
self-contained evidence envelope   = runtime-proven on older frontier
bounded privacy source authority   = yes — run 35531005587 / AUTHORITATIVE_CAPTURED_WINDOW_V1
account-deletion finalizer runtime = implemented
recovered finalization mechanics   = implemented / post-merge CI green
recovered finalization on fresh governed restore = pending
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
bounded post-backup source authority = runtime-proven — run 35531005587
destructive account finalization     = implemented under governed worker authority
recovered-state finalization drill   = implemented / post-merge CI green
fresh governed restore execution     = pending current-frontier backup
commerce legal retention             = decided — approved 9-table P5Y baseline
authoritative privacy reconciliation = not yet proven on fresh recovered state
future-safe privacy reconciliation   = false
DR Ready                             = false
```

The planner output report is identifier-free; the executable SQL contains required resource identifiers and must remain an ephemeral operator artifact rather than uploaded DR evidence.
