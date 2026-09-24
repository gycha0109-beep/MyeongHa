# PostgreSQL DR Readiness Status v1

> Issue: #389  
> Evidence date: 2026-09-24 KST  
> Purpose: record measured recovery evidence, bounded authoritative privacy reconciliation, approved RPO/RTO comparisons, and the remaining provider-equivalence boundary.

## Current evidence

```yaml
latest_governed_backup_run_id: 35944326928
latest_governed_backup_source_sha: fcab2c63d3f682bd7e89bf048cff9d4d62c404dd
latest_governed_backup_artifact_id: 10786441202
latest_governed_backup_artifact_name: myeongha-postgres-20260924T014551Z
latest_governed_backup_artifact_expires_at: 2026-10-24T01:48:20Z
latest_governed_backup_artifact_digest: sha256:66f17a25a32b71d8737d6d15f7858e8d46f4f331206c9072e525fd2e1b620450
latest_governed_backup_encrypted_sha256: 576847fbcfd07e06c2c8a4d01a22f98887b916a45dd172f6278b2b439bd88848
latest_governed_backup_completed_at_utc: 2026-09-24T01:48:20Z
latest_proven_backup_migration_frontier: 1305
production_schema_latest_deployed_migration: 1305
production_schema_deploy_run_id: 35943553635
production_schema_deploy_head_sha: 2d297bf41a93ba8677aadf35ad3785881dae5f28
current_repository_migration_frontier: 1305
backup_schema_freshness: CURRENT_FOR_DEPLOYED_MIGRATION_1305
backup_refresh_required: false

latest_isolated_restore_run_id: 35947730074
latest_isolated_restore_result: SUCCESS
latest_isolated_restore_target: github-actions-loopback-supabase-postgres
latest_isolated_restore_runtime_head_sha: fcab2c63d3f682bd7e89bf048cff9d4d62c404dd
latest_isolated_restore_backup_run_id: 35944326928
latest_isolated_restore_incident_reference_utc: 2026-09-24T01:49:00Z
latest_isolated_restore_evidence_artifact_id: 10787108939
latest_isolated_restore_evidence_artifact_expires_at: 2026-10-24T02:34:06Z
latest_isolated_restore_evidence_artifact_digest: sha256:2128103fb02e8a11c8bf979c9daebed17356a17aa01e0f283e1aed5e26bf4236
latest_isolated_restore_backup_migration_frontier: 1305
restore_evidence_envelope_runtime: PROVEN_ON_RUN_35947730074
isolated_restore_validation_duration_seconds: 3
manual_drill_workflow_elapsed_seconds: 66
synthetic_data_loss_window_seconds: 40
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
recovered_state_finalization_restored_backup_runtime: PROVEN_ON_RUN_35947730074

authoritative_privacy_reconciliation_run_id: 35659483080
authoritative_privacy_reconciliation_result: SUCCESS
authoritative_privacy_reconciliation_runtime_head_sha: 31746f635ae249811842b8d225c2734e4d1b4c51
authoritative_privacy_reconciliation_backup_run_id: 35643472159
authoritative_privacy_reconciliation_backup_completed_at_utc: 2026-09-21T19:16:17Z
authoritative_privacy_reconciliation_ledger_run_id: 35653303484
authoritative_privacy_reconciliation_canary_run_id: 35653222211
authoritative_privacy_reconciliation_incident_reference_utc: 2026-09-21T20:48:33Z
authoritative_privacy_reconciliation_evidence_artifact_id: 10666580699
authoritative_privacy_reconciliation_evidence_artifact_expires_at: 2026-10-21T21:51:40Z
authoritative_privacy_reconciliation_evidence_artifact_digest: sha256:58d56b54f1b3ffe1d21fd1934bf3c2edce0826bb624bf261fad30b766f127c28
authoritative_privacy_reconciliation: true
authoritative_privacy_reconciliation_scope: BOUNDED_CAPTURED_WINDOW_ONLY
future_safe_privacy_reconciliation: false
privacy_reconciliation: PRODUCTION_NONZERO_AUTHORITATIVE_CAPTURED_WINDOW_PROVEN

full_authoritative_data_loss_window_seconds: 5536
full_authoritative_recovery_duration_seconds: 67
rpo_authority: PRODUCT_OWNER_APPROVED_PT24H
rpo_full_authoritative_comparison: PASS_5536S_LE_PT24H
rto_authority: PRODUCT_OWNER_APPROVED_PT6H
rto_full_authoritative_comparison: PASS_67S_LE_PT6H
dr_ready: false
```

The latest governed backup is run `35944326928`, source SHA `fcab2c63d3f682bd7e89bf048cff9d4d62c404dd`, artifact `10786441202` (`myeongha-postgres-20260924T014551Z`). Its exact completion cutoff is `2026-09-24T01:48:20Z`. Production deployment run `35943553635` applied the repository migration frontier through `1305_bounded_collection_read_runtime_authority.sql` on head `2d297bf41a93ba8677aadf35ad3785881dae5f28`, and the backup source SHA contains repository migration frontier `1305`. Governed backup freshness and current-frontier isolated restore execution are now both proven; remaining recovery authority is not blocked on backup/restore freshness.

The latest isolated restore runtime evidence is run `35947730074` against governed backup `35944326928`, covering migration frontier `1305`. Artifact `10787108939` contains restore and synthetic privacy-reconciliation evidence; the run passed application-data portability, projected provider COPY handling, Auth identity continuity for the supported loopback scope, synthetic captured-window coverage, governed account-deletion finalization/completion mechanics, idempotency, non-resurrection, revoked P5Y Commerce retention, identifier-free evidence, and the negative terminal-revoke fail-closed case. The isolated restore validation took 3 seconds, the workflow elapsed 66 seconds, and the synthetic incident reference was 40 seconds after the backup cutoff; these remain diagnostics only, not approved RTO/RPO. The separate Production non-zero authoritative privacy reconciliation remains evidenced by run `35659483080` for its exact bounded captured window and is not reclassified as current-frontier evidence by this synthetic refresh.
Approved objective authority: Product Owner approved **RPO `PT24H` (24 hours)** and **RTO `PT6H` (6 hours)** on 2026-09-21 KST under #389. The latest synthetic 40-second data-loss-window diagnostic and 66-second workflow elapsed diagnostic are numerically inside those objectives, but they are not the full authoritative recovery procedure and therefore do not close the comparison gate or promote `dr_ready`.


Historical count-only audit run `35353128407` remains valid evidence for its exact 2026-09-18 observation interval only: it observed zero deltas across the seven audited timestamp-authoritative surfaces and is retained as `COUNT_ONLY_OBSERVATION_NON_AUTHORITATIVE`. It no longer defines current post-backup source authority; the promoted bounded ledger below supersedes that source-authority question.

The promoted encrypted off-primary-DB privacy recovery ledger has a newer scheduled runtime proof bound to the current-frontier backup. Production PostgreSQL Privacy Recovery Ledger run `35539838537` completed successfully from repository SHA `5bb5de08ef211f78565d06c1f9c4ff0c0ec8a956`, selected governed backup run `35536655149` and artifact `10612622254`, used cutoff `2026-09-20T20:50:05Z`, executed the read-only export path, and uploaded encrypted artifact `10614412005` (`myeongha-privacy-ledger-20260920T214938Z`) with P30D retention. The ledger remains authoritative only for its exact captured window under `AUTHORITATIVE_CAPTURED_WINDOW_V1`; it is not unbounded or future-safe, and incident references later than coverage remain fail-closed.

The governed account-deletion finalizer, hosted Auth deletion adapter/canary path, completion authority, worker identity, and recovered-state synthetic finalization mechanics remain runtime-proven on run `35947730074`. The Production non-zero authoritative boundary is now separately runtime-proven by isolated restore run `35659483080`, which bound governed backup `35643472159`, authoritative ledger `35653303484`, and Production canary `35653222211`, replayed the captured-window ledger idempotently, executed DB finalization and completion, preserved revoked P5Y Commerce evidence, and uploaded identifier-free evidence artifact `10666580699`. Authoritative privacy reconciliation is therefore true for that exact captured window only; it is not future-safe or an assertion of full hosted provider recovery equivalence.

## Promotion blockers

The privacy/legal-retention policy, bounded captured-window source authority, current-frontier governed backup, isolated restore, recovered-state finalization mechanics, Production non-zero authoritative reconciliation, and full-procedure RPO/RTO comparisons are now runtime-proven. DR still remains blocked because provider-managed Auth/Storage full-restore equivalence is not proven; `future_safe_privacy_reconciliation=false` and `dr_ready=false` therefore remain mandatory.

Canonical authority remains unresolved in the existing source documents:

- `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`: Product Owner approved `RPO = PT24H` and `RTO = PT6H` on 2026-09-21; no DR Ready claim is allowed until full authoritative recovery evidence is compared against those objectives.
- `docs/P0_DECISION_REGISTER.md`: parent `P0-PR-01` is `DECIDED`; the current reachable policy baseline is 39 DELETE / 4 ANONYMIZE / 9 RETAIN(P5Y), with P30D encrypted backup handling and bounded captured-window privacy recovery source authority.
- `docs/AUTH_RLS_PRIVACY_SPEC.md`: account deletion keeps personalization erase separate from the approved nine-table `P5Y` Commerce retention baseline; destructive runtime finalization is implemented, while recovered-state authoritative execution evidence remains separately gated.
- `docs/SOURCE_AUTHORITY_GAPS.md`: `SRC-06` remains blocking before the final standalone Birth/Target deletion DDL baseline.
- GitHub issue `#964`: its remaining Production non-zero authoritative reconciliation boundary is now runtime-proven by run `35659483080`; issue closure can consume this evidence without claiming full hosted provider equivalence.

Therefore restore success must remain classified as mechanics evidence only:

```text
latest governed backup             = yes — run 35944326928
backup current-schema freshness    = yes — backup/deployed/repository frontier 1305
isolated application restore       = yes — run 35947730074, frontier 1305
application integrity/auth baseline= yes — run 35947730074, supported loopback scope
self-contained evidence envelope   = runtime-proven on current frontier 1305
bounded privacy source authority   = yes — run 35539838537 / AUTHORITATIVE_CAPTURED_WINDOW_V1
account-deletion finalizer runtime = implemented
recovered finalization mechanics   = implemented / post-merge CI green
recovered finalization on current-frontier governed restore = proven — run 35947730074
authoritative privacy reconciliation= yes — run 35659483080 / bounded captured window only
future-safe privacy reconciliation = false
approved RPO                       = yes — PT24H / full authoritative comparison PASS (5536s)
approved RTO                       = yes — PT6H / full authoritative comparison PASS (67s)
DR Ready                           = false
```

## Change rule

Do not flip `dr_ready` to true merely because another restore succeeds or because measured diagnostic values improve.

Promotion requires all of the following authority changes to be reviewed together:

1. The approved `P0-PR-01` finalization policy is implemented as an idempotent, FK-safe destructive finalizer and hosted Auth cleanup path.
2. The applicable deletion/revocation/finalization reconciliation procedure is exercised against an isolated recovered state with non-zero or intentionally constructed authoritative deltas.
3. Numeric RPO and RTO objectives remain explicitly approved by the owning product/business authority (`PT24H` / `PT6H`).
4. Full authoritative recovery achieved evidence is compared against those approved objectives.
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
fresh governed restore execution     = proven — run 35947730074 / backup 35631594765
commerce legal retention             = decided — approved 9-table P5Y baseline
authoritative privacy reconciliation = proven — run 35659483080 / Production non-zero bounded captured window
future-safe privacy reconciliation   = false
RPO full-procedure comparison        = PASS — 5536s <= PT24H
RTO full-procedure comparison        = PASS — 67s <= PT6H
DR Ready                             = false
```

The planner output report is identifier-free; the executable SQL contains required resource identifiers and must remain an ephemeral operator artifact rather than uploaded DR evidence.
