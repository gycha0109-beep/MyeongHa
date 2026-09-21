# PostgreSQL DR Readiness Status v1

> Issue: #389  
> Evidence date: 2026-09-21 KST  
> Purpose: record measured restore evidence separately from unresolved privacy/legal-retention and RPO/RTO authority.

## Current evidence

```yaml
latest_governed_backup_run_id: 35610150628
latest_governed_backup_source_sha: 7d4b3b68ce65e254a2f6b1e7b2aa479abbfdaec1
latest_governed_backup_artifact_id: 10643338312
latest_governed_backup_artifact_name: myeongha-postgres-20260921T140850Z
latest_governed_backup_artifact_expires_at: 2026-10-21T14:12:28Z
latest_governed_backup_artifact_digest: sha256:1711f5c22d5cba72675b1bc6e39f6fdc197fbec017e19a908f506d528faecc16
latest_governed_backup_encrypted_sha256: 08b58c5a522e9077ba67724e099d53af34b5c07532b9d7f950bd623003114e11
latest_governed_backup_completed_at_utc: 2026-09-21T14:12:28Z
latest_proven_backup_migration_frontier: 1270
production_schema_latest_deployed_migration: 1270
production_schema_deploy_run_id: 35608999263
production_schema_deploy_head_sha: 7d4b3b68ce65e254a2f6b1e7b2aa479abbfdaec1
current_repository_migration_frontier: 1270
backup_schema_freshness: CURRENT_FOR_DEPLOYED_MIGRATION_1270
backup_refresh_required: false

latest_isolated_restore_run_id: 35610864276
latest_isolated_restore_result: SUCCESS
latest_isolated_restore_target: github-actions-loopback-supabase-postgres
latest_isolated_restore_runtime_head_sha: 7d4b3b68ce65e254a2f6b1e7b2aa479abbfdaec1
latest_isolated_restore_backup_run_id: 35610150628
latest_isolated_restore_incident_reference_utc: 2026-09-21T14:12:34Z
latest_isolated_restore_evidence_artifact_id: 10644116472
latest_isolated_restore_evidence_artifact_expires_at: 2026-10-21T14:16:16Z
latest_isolated_restore_evidence_artifact_digest: sha256:39b4858092083ce05cbffdfe6c4acac7e968dc4c6d4dfc790ac2ec037770502a
latest_isolated_restore_backup_migration_frontier: 1270
restore_evidence_envelope_runtime: PROVEN_ON_RUN_35610864276
isolated_restore_validation_duration_seconds: 5
manual_drill_workflow_elapsed_seconds: 87
synthetic_data_loss_window_seconds: 6
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
recovered_state_finalization_restored_backup_runtime: PROVEN_ON_RUN_35610864276
authoritative_privacy_reconciliation: false
future_safe_privacy_reconciliation: false
privacy_reconciliation: BLOCKED_BY_PRODUCTION_NONZERO_AUTHORITATIVE_DELTA_PROOF
rpo_authority: PRODUCT_OWNER_APPROVED_PT24H
rto_authority: PRODUCT_OWNER_APPROVED_PT6H
dr_ready: false
```

The latest governed backup is run `35610150628`, source SHA `7d4b3b68ce65e254a2f6b1e7b2aa479abbfdaec1`, artifact `10643338312` (`myeongha-postgres-20260921T140850Z`). Its exact completion cutoff is `2026-09-21T14:12:28Z`. Production deployment run `35608999263` applied migration `1270_reader_interpretation_access_bundle_runtime_authority.sql`, and the backup source SHA contains repository migration frontier `1270`. Governed backup freshness and current-frontier isolated restore execution are now both proven; remaining recovery authority is not blocked on backup/restore freshness.

The latest isolated restore runtime evidence is run `35610864276` against governed backup `35610150628`, covering migration frontier `1270`. Artifact `10644116472` contains restore and privacy-reconciliation evidence; the run passed application-data portability, projected provider COPY handling, Auth identity continuity for the supported loopback scope, captured-window coverage, encrypted non-zero synthetic replay, governed account-deletion finalization/completion, idempotency, non-resurrection, revoked P5Y Commerce retention, identifier-free evidence, and the negative terminal-revoke fail-closed case. The isolated restore validation took 5 seconds, the workflow elapsed 87 seconds, and the synthetic incident was 6 seconds after the backup cutoff; these remain diagnostics only, not approved RTO/RPO.
Approved objective authority: Product Owner approved **RPO `PT24H` (24 hours)** and **RTO `PT6H` (6 hours)** on 2026-09-21 KST under #389. The existing synthetic 4-second data-loss-window diagnostic and 55-second workflow elapsed diagnostic are numerically inside those objectives, but they are not the full authoritative recovery procedure and therefore do not close the comparison gate or promote `dr_ready`.


Historical count-only audit run `35353128407` remains valid evidence for its exact 2026-09-18 observation interval only: it observed zero deltas across the seven audited timestamp-authoritative surfaces and is retained as `COUNT_ONLY_OBSERVATION_NON_AUTHORITATIVE`. It no longer defines current post-backup source authority; the promoted bounded ledger below supersedes that source-authority question.

The promoted encrypted off-primary-DB privacy recovery ledger has a newer scheduled runtime proof bound to the current-frontier backup. Production PostgreSQL Privacy Recovery Ledger run `35539838537` completed successfully from repository SHA `5bb5de08ef211f78565d06c1f9c4ff0c0ec8a956`, selected governed backup run `35536655149` and artifact `10612622254`, used cutoff `2026-09-20T20:50:05Z`, executed the read-only export path, and uploaded encrypted artifact `10614412005` (`myeongha-privacy-ledger-20260920T214938Z`) with P30D retention. The ledger remains authoritative only for its exact captured window under `AUTHORITATIVE_CAPTURED_WINDOW_V1`; it is not unbounded or future-safe, and incident references later than coverage remain fail-closed.

The governed account-deletion finalizer, hosted Auth deletion adapter/canary path, completion authority, worker identity, and recovered-state synthetic finalization mechanics are implemented and now runtime-proven on the current-frontier restored database by run `35610864276`. The drill exercised exact worker claim, DB finalizer, isolated synthetic Auth ACK, completion ACK, idempotent replay/completion, non-resurrection representatives, and revoked P5Y Commerce retention. #1140 is therefore complete. Authoritative privacy reconciliation still remains false because this drill uses an intentionally constructed synthetic non-zero ledger rather than a Production non-zero authoritative ledger.

## Promotion blockers

The privacy/legal-retention policy, bounded captured-window source authority, current-frontier governed backup, isolated restore, and recovered-state finalization mechanics are all runtime-proven. DR remains blocked because Production non-zero authoritative privacy/deletion delta execution is still unproven, provider-service gaps remain outside full restore equivalence, and the approved RPO/RTO objectives still require comparison against the full authoritative recovery procedure.

Canonical authority remains unresolved in the existing source documents:

- `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`: Product Owner approved `RPO = PT24H` and `RTO = PT6H` on 2026-09-21; no DR Ready claim is allowed until full authoritative recovery evidence is compared against those objectives.
- `docs/P0_DECISION_REGISTER.md`: parent `P0-PR-01` is `DECIDED`; the current reachable policy baseline is 39 DELETE / 4 ANONYMIZE / 9 RETAIN(P5Y), with P30D encrypted backup handling and bounded captured-window privacy recovery source authority.
- `docs/AUTH_RLS_PRIVACY_SPEC.md`: account deletion keeps personalization erase separate from the approved nine-table `P5Y` Commerce retention baseline; destructive runtime finalization is implemented, while recovered-state authoritative execution evidence remains separately gated.
- `docs/SOURCE_AUTHORITY_GAPS.md`: `SRC-06` remains blocking before the final standalone Birth/Target deletion DDL baseline.
- GitHub issue `#964`: product-owner policy authority, bounded source authority, and current-frontier recovered-state runtime evidence are resolved; closure now depends on the remaining Production non-zero authoritative reconciliation boundary.

Therefore restore success must remain classified as mechanics evidence only:

```text
latest governed backup             = yes — run 35610150628
backup current-schema freshness    = yes — backup/deployed/repository frontier 1270
isolated application restore       = yes — run 35610864276, frontier 1270
application integrity/auth baseline= yes — run 35610864276, supported loopback scope
self-contained evidence envelope   = runtime-proven on current frontier 1270
bounded privacy source authority   = yes — run 35539838537 / AUTHORITATIVE_CAPTURED_WINDOW_V1
account-deletion finalizer runtime = implemented
recovered finalization mechanics   = implemented / post-merge CI green
recovered finalization on current-frontier governed restore = proven — run 35610864276
authoritative privacy reconciliation= false
future-safe privacy reconciliation = false
approved RPO                       = yes — PT24H
approved RTO                       = yes — PT6H
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
fresh governed restore execution     = proven — run 35610864276 / backup 35610150628
commerce legal retention             = decided — approved 9-table P5Y baseline
authoritative privacy reconciliation = not yet proven with Production non-zero authoritative ledger
future-safe privacy reconciliation   = false
DR Ready                             = false
```

The planner output report is identifier-free; the executable SQL contains required resource identifiers and must remain an ephemeral operator artifact rather than uploaded DR evidence.
