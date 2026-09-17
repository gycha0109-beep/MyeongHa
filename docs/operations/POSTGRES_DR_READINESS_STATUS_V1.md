# PostgreSQL DR Readiness Status v1

> Issue: #389  
> Evidence date: 2026-09-18 KST  
> Purpose: record measured restore evidence separately from unresolved privacy/legal-retention and RPO/RTO authority.

## Current evidence

```yaml
backup_run_id: 35260191079
restore_run_id: 35280075274
restore_result: SUCCESS
restore_target: github-actions-loopback-supabase-postgres
isolated_restore_validation_duration_seconds: 3
synthetic_data_loss_window_seconds: 82
post_backup_privacy_delta_count: 0
privacy_reconciliation: BLOCKED_BY_P0_PR_01_AND_ISSUE_964
rpo_authority: OPEN_DECISION
rto_authority: OPEN_DECISION
dr_ready: false
```

The successful restore run proves the governed logical backup can be decrypted, integrity-checked, replayed into the isolated Supabase PostgreSQL target, and validated at the application database authorization/integrity boundary. It does not establish full Supabase provider-service recovery or serving-production readiness.

The 3-second value is the measured isolated restore/validation diagnostic from run `35280075274`. The 82-second value is the synthetic data-loss-window diagnostic for the selected incident reference. Neither value is an approved RTO or RPO.

A count-only production audit against the governed backup completion point found zero post-backup privacy state deltas on the timestamp-authoritative surfaces checked for this tested interval. Zero observed deltas means there was nothing to replay for that interval; it does not prove the future-safe deletion/revocation/legal-retention reconciliation procedure.

## Promotion blockers

Canonical authority remains unresolved in the existing source documents:

- `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md`: `RPO = OPEN DECISION`, `RTO = OPEN DECISION`, and no DR Ready claim before approved objectives plus achieved evidence.
- `docs/P0_DECISION_REGISTER.md`: parent `P0-PR-01` retention / backup / legal-retention authority remains `OPEN-P0`.
- `docs/AUTH_RLS_PRIVACY_SPEC.md`: account deletion must keep personalization erase separate from legally retained commerce data, but the legal/accounting/backup retention duration and final Commerce tombstone/pseudonymization/destructive schedule remain under `P0-PR-01`.
- `docs/SOURCE_AUTHORITY_GAPS.md`: `SRC-06` remains blocking before the final standalone Birth/Target deletion DDL baseline.
- GitHub issue `#964`: account-deletion finalization and legal-retention authority remains the explicit policy blocker for future-safe recovery reconciliation.

Therefore restore success must remain classified as mechanics evidence only:

```text
backup proven                      = yes
isolated application restore       = yes
application integrity/auth baseline= yes
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
