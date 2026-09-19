# Account Deletion Finalization Policy Candidate v1

> Historical note (2026-09-19): this file is the immutable pre-approval candidate. `P0-PR-01` is now DECIDED; current authority is `ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json` / `.md`. The OPEN-P0 text below is preserved as candidate-state evidence.

> Tracking: #1061 / parent #964 / DR parent #389  
> Decision authority: `P0-PR-01 = OPEN-P0`  
> Status: **POLICY CONTRACT ONLY / EXECUTION NOT AUTHORIZED**

## Purpose

This contract makes the remaining deletion and Commerce-retention decisions explicit and machine-checkable without choosing those policy values.

The current repository may implement adapters, validators, inventories, and fail-closed policy slots while `P0-PR-01` is OPEN-P0. It must not infer destructive deletion, pseudonymization, retention duration, legal authority, or backup deletion timing from engineering convenience.

Canonical candidate:

```text
docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_CANDIDATE_V1.json
```

Current authority:

```text
decisionStatus                     = OPEN-P0
policyAuthority                    = NOT_APPROVED
executionAuthorized                = false
authoritativePostBackupSource      = false
authoritativePrivacyReconciliation = false
futureSafePrivacyReconciliation    = false
drReady                            = false
```

## Destructive finalization decision slots

All current values are `UNDECIDED`.

- subject row final state/action;
- local Auth mapping action;
- hosted Auth user action;
- profile action;
- Guest-session action;
- merge provenance action;
- personalization graph action;
- share/device/notification terminal action;
- backup-retention/deletion handling.

The candidate evaluator fails if any of these values is silently promoted while the parent decision remains OPEN-P0.

## Subject-linked Commerce retention inventory

The current migrated schema contains eight directly subject-linked Commerce tables. Every table is assigned to one policy class, but **no class has a disposition, duration, or legal authority yet**.

| Policy class | Current tables | Disposition | Duration | Authority |
| --- | --- | --- | --- | --- |
| account/provider binding | `commerce_account_links` | UNDECIDED | null | null |
| purchase/payment provenance | `purchase_intents`, `commerce_payment_attempts` | UNDECIDED | null | null |
| verified provider evidence | `commerce_receipts`, `commerce_provider_events` | UNDECIDED | null | null |
| entitlement history/projection | `entitlement_grants`, `entitlement_events`, `entitlements` | UNDECIDED | null | null |

`products`, `product_offers`, and other catalog/reference tables are not in this subject-linked retention inventory because they do not carry a direct subject ownership column.

This classification is **not** a declaration that the rows should be retained. It only identifies the current classes that require an explicit owner decision before account finalization can become executable.

## DB catalog fail-closed rule

`test/db/account_deletion_policy_catalog_guard.sh` queries the fully migrated PostgreSQL catalog for subject-linked Commerce tables using the direct owner columns:

```text
subject_id
resolved_subject_id
```

and the Commerce namespaces:

```text
commerce_*
purchase_intents
entitlement*
```

The live migrated table set must exactly equal the policy candidate inventory.

Therefore, if a future migration adds a new directly subject-linked Commerce table, CI fails until the table is explicitly classified under P0-PR-01. This prevents a new billing/evidence table from being silently omitted from deletion/legal-retention review.

## Policy evaluator

```text
scripts/evaluate-account-deletion-finalization-policy.mjs
```

The evaluator currently requires:

- exact schema `myeongha-account-deletion-finalization-policy-candidate-v1`;
- `decisionId=P0-PR-01`;
- `decisionStatus=OPEN-P0`;
- `policyAuthority=NOT_APPROVED`;
- `executionAuthorized=false`;
- all destructive-finalization slots `UNDECIDED`;
- every Commerce disposition `UNDECIDED`;
- every Commerce retention duration `null`;
- every Commerce authority reference `null`;
- approval metadata `null`;
- all privacy/DR authority flags `false`.

Its output is an identifier-free readiness report and must remain:

```text
policyReady=false
executionAuthorized=false
drReady=false
```

while the parent decision is open.

## Explicitly absent

This work adds **no**:

- destructive `DELETE`/pseudonymization SQL;
- finalization worker;
- hosted Supabase Auth deletion call;
- Commerce record-retention duration;
- legal/accounting basis;
- backup purge schedule;
- authoritative post-backup source promotion;
- RPO/RTO approval.

Those require a future owner-approved P0-PR-01 decision and a separate implementation review.

## Promotion sequence

Before any account-deletion finalizer can be authorized:

1. the owner decides every destructive-finalization slot;
2. the owner decides disposition, retention duration, and authority for every Commerce class;
3. the approved policy is recorded as a new decision artifact/version rather than mutating this OPEN-P0 candidate into authority by accident;
4. implementation maps only that approved policy into idempotent finalization behavior;
5. non-zero durable privacy evidence is replayed on an isolated restored state;
6. the drill proves personalization/access does not resurrect and only policy-approved Commerce evidence survives;
7. #964 and #389 are updated from that exact evidence.

Until then, the only valid state is fail-closed.
