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
authoritative_post_backup_delta_audit_for_current_backup: SUCCESSFUL_COUNT_ONLY_OBSERVATION
post_backup_privacy_delta_count_audit_workflow: RUNTIME_PROVEN
post_backup_privacy_delta_count_audit_last_run_id: 35353128407
post_backup_privacy_delta_count_audit_last_run_result: SUCCESS
post_backup_privacy_delta_count_audit_runtime_head_sha: 532a92e061506bfac8f9485e84ebbab8d756f1db
post_backup_privacy_delta_count_audit_artifact_id: 10550013004
post_backup_privacy_delta_count_audit_artifact_name: postgres-privacy-delta-count-audit-35353128407
post_backup_privacy_delta_count_audit_artifact_expires_at: 2026-10-18T13:56:23Z
post_backup_privacy_delta_count_audit_artifact_digest: sha256:87010c5c12b2ac319f1b6ef71b0829ab713c13a70189d294a8af720e9a2d6374
post_backup_privacy_delta_count_audit_backup_completed_at_utc: 2026-09-18T09:23:19Z
post_backup_privacy_delta_count_audit_completed_at_utc: 2026-09-18T13:56:22Z
privacy_delta_audit_query_mode: READ_ONLY_COUNT_ONLY
privacy_delta_audit_data_deletion_jobs_requested_at: 0
privacy_delta_audit_share_artifacts_revoked_at: 0
privacy_delta_audit_device_installations_revoked_at: 0
privacy_delta_audit_life_facts_revoked_at: 0
privacy_delta_audit_memory_items_revoked_at: 0
privacy_delta_audit_record_access_grants_revoked_at: 0
privacy_delta_audit_subjects_non_active_updated_at: 0
privacy_delta_audit_observed_delta_total: 0
privacy_delta_audit_observed_deltas: false
privacy_recovery_ledger_candidate_workflow: RUNTIME_PROVEN
privacy_recovery_ledger_candidate_run_id: 35361080803
privacy_recovery_ledger_candidate_result: SUCCESS
privacy_recovery_ledger_candidate_runtime_head_sha: c8899478dba523f2ccfe1f6f00cda14a952a0273
privacy_recovery_ledger_candidate_backup_run_id: 35329018925
privacy_recovery_ledger_candidate_backup_completed_at_utc: 2026-09-18T09:23:19.000Z
privacy_recovery_ledger_candidate_captured_at_utc: 2026-09-18T15:13:38.000Z
privacy_recovery_ledger_candidate_artifact_id: 10553934875
privacy_recovery_ledger_candidate_artifact_name: myeongha-privacy-ledger-20260918T151342Z
privacy_recovery_ledger_candidate_artifact_expires_at: 2026-10-18T15:13:42Z
privacy_recovery_ledger_candidate_artifact_digest: sha256:dfa03b55d90011ea9b5ce52ec166fb6eb789a91874bafcc8341cd6e4c68543b0
privacy_recovery_ledger_candidate_encrypted_sha256: 91e2ea2fd615385d86d9864d7670b3139752a090fbe49884a8743258ccd938b5
privacy_recovery_ledger_candidate_source_digest: sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
privacy_recovery_ledger_candidate_event_count: 0
privacy_recovery_ledger_candidate_replay_planner_accepted: true
privacy_recovery_ledger_candidate_unsupported_delta_guard: PASS_ZERO_UNSUPPORTED
privacy_recovery_ledger_candidate_artifact_plaintext_identifier_payload_uploaded: false
privacy_recovery_ledger_candidate_source_authority: CANDIDATE_NON_AUTHORITATIVE
privacy_reconciliation: BLOCKED_BY_FINALIZER_AND_AUTHORITATIVE_NONZERO_RECOVERY_PROOF
rpo_authority: OPEN_DECISION
rto_authority: OPEN_DECISION
dr_ready: false
```

Manual restore run `35331742188` completed successfully from current main head `f736381f21171a1480292988e97c61ca68a5e62b` using fresh production backup run `35329018925`. The backup source SHA is `e1a6500968f7722666cae2038fd49ddf3f9d3540`, taken after production migration `1120` was deployed. A fresh comparison from that backup source to the restore head found **zero** changes under `supabase/migrations/`. Current-production-schema backup freshness and restore portability are therefore proven through deployed migration `1120`.

Artifact `10541321355` (`postgres-isolated-restore-drill-35331742188`) contains both `restore-evidence.json` and `privacy-reconciliation-evidence.json`. The restore evidence records envelope version `myeongha-postgres-isolated-restore-evidence-envelope-v1`, exact backup/source bindings, 2-second restore/validation, 3 projected provider COPY blocks, 27 skipped provider COPY blocks, `provider_managed_data_full_restore=false`, Auth identity continuity PASS, and `dr_ready=false`. The privacy evidence records four synthetic replay events, identical second-replay idempotency PASS, negative terminal-state fail-closed PASS, `authoritative_post_backup_source=false`, and `dr_ready=false`.

The 2-second value is the measured isolated restore/validation diagnostic from run `35331742188`. The 52-second value is GitHub workflow dispatch-to-completion elapsed time for that manual drill. The 4-second value is the synthetic data-loss-window diagnostic for the selected incident reference. None is an approved RTO or RPO, and the 52-second workflow elapsed time is not a full achieved recovery duration because authoritative privacy/legal-retention reconciliation remains outside the run.

A successful count-only production audit has now been executed against current governed backup `35329018925`. Run `35353128407` queried the seven timestamp-authoritative surfaces after cutoff `2026-09-18T09:23:19Z` and observed zero recorded deltas on every surface: `data_deletion_jobs.requested_at=0`, `share_artifacts.revoked_at=0`, `device_installations.revoked_at=0`, `life_facts.revoked_at=0`, `memory_items.revoked_at=0`, `record_access_grants.revoked_at=0`, and non-active `subjects.updated_at=0`. The observed delta total is `0` and `observed_deltas=false`. This is a read-only count observation of the current primary database, not a durable post-backup privacy authority, so authoritative privacy reconciliation remains blocked.

The manual runtime path at `.github/workflows/production-postgres-privacy-delta-audit.yml` is now runtime-proven. Run `35347028765` failed before count evidence while relying on a pooler startup read-only assertion. Run `35349036742` then reached the explicit `BEGIN TRANSACTION READ ONLY` path but failed before evidence because `psql -c "$sql"` did not perform psql variable substitution for `:'cutoff'`. Run `35353128407`, from exact main SHA `532a92e061506bfac8f9485e84ebbab8d756f1db`, used the corrected stdin execution path and completed successfully: governed backup/provenance validation PASS, read-only count query PASS, and evidence upload PASS. Artifact `10550013004` (`postgres-privacy-delta-count-audit-35353128407`, expiring `2026-10-18T13:56:23Z`) records schema `myeongha-postgres-privacy-delta-count-audit-v1`, `query_mode=read_only_count_only`, the seven zero counts, `observed_delta_total=0`, `observed_deltas=false`, `authoritative_post_backup_source=false`, `authoritative_privacy_reconciliation=false`, `future_safe_privacy_reconciliation=false`, and `dr_ready=false`.

The encrypted off-primary-DB privacy recovery ledger candidate is also runtime-proven as transport mechanics. Manual run `35361080803` executed from exact main SHA `c8899478dba523f2ccfe1f6f00cda14a952a0273` against governed backup `35329018925` and cutoff `2026-09-18T09:23:19.000Z`. Backup provenance validation, the explicit read-only export, unsupported-delta fail-closed guard, deterministic replay-planner validation, encryption, and artifact upload all passed. Artifact `10553934875` (`myeongha-privacy-ledger-20260918T151342Z`, expiring `2026-10-18T15:13:42Z`) contains exactly an encrypted archive, its SHA-256 file, and an identifier-free public manifest. The encrypted archive SHA-256 `91e2ea2fd615385d86d9864d7670b3139752a090fbe49884a8743258ccd938b5` matches the uploaded checksum. The public manifest records `eventCount=0`, all seven replay-supported event-type counts as zero, `replayPlannerAccepted=true`, `candidateSourceAuthority=true`, `authoritativePostBackupSource=false`, `authoritativePrivacyReconciliation=false`, `futureSafePrivacyReconciliation=false`, and `drReady=false`. This proves the candidate export/encryption/off-DB transport path for the observed zero-event interval only; it does not promote the candidate into the durable authoritative privacy source required for recovered-state privacy reconciliation.

## Promotion blockers

Current-schema recovery freshness is evidenced through deployed migration `1120` by backup run `35329018925` and restore run `35331742188`. `P0-PR-01` is now DECIDED as of 2026-09-19, so privacy/legal-retention policy is no longer the blocker. DR remains blocked by the not-yet-implemented destructive finalizer, lack of authoritative non-zero recovered-state reconciliation, provider-service gaps, and OPEN RPO/RTO authority.

Canonical authority remains unresolved in the existing source documents:

- `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`: `RPO = OPEN DECISION`, `RTO = OPEN DECISION`, and no DR Ready claim before approved objectives plus achieved evidence.
- `docs/P0_DECISION_REGISTER.md`: parent `P0-PR-01` is `DECIDED`; its approved 35 DELETE / 4 ANONYMIZE / 9 RETAIN(P5Y) baseline and P30D backup handling are recorded.
- `docs/AUTH_RLS_PRIVACY_SPEC.md`: account deletion keeps personalization erase separate from the approved nine-table `P5Y` Commerce retention baseline; destructive runtime execution remains gated until the finalizer is implemented and verified.
- `docs/SOURCE_AUTHORITY_GAPS.md`: `SRC-06` remains blocking before the final standalone Birth/Target deletion DDL baseline.
- GitHub issue `#964`: product-owner policy authority is resolved; implementation/closure now depends on the approved finalizer contract being realized and verified.

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
current-backup privacy delta audit = successful count-only observation — run 35353128407; seven checked surfaces all zero
count-only audit workflow          = runtime-proven — run 35353128407
off-DB privacy ledger candidate    = runtime-proven transport — run 35361080803; observed event count 0; non-authoritative
future-safe privacy reconciliation = blocked pending finalizer + authoritative non-zero recovery proof
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

It can deterministically compile post-backup account-deletion-start and revocation events into existing idempotent PostgreSQL command calls. Direct destructive DML, account deletion finalization, and commerce retention decisions are outside the planner and fail closed.

This advances recovery mechanics but does not remove the promotion blockers:

```text
revocation replay plan mechanics   = implemented
restored-DB synthetic replay path  = runtime-proven — latest run 35331742188
off-DB candidate transport mechanics = runtime-proven — run 35361080803 / event count 0 / non-authoritative
durable post-backup source authority = not proven
destructive account finalization   = policy decided / runtime not yet implemented
commerce legal retention           = decided — approved 9-table P5Y baseline
authoritative privacy reconciliation= not yet executed against restored DB
DR Ready                           = false
```

The planner output report is identifier-free; the executable SQL contains required resource identifiers and must remain an ephemeral operator artifact rather than uploaded DR evidence.
