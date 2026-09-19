# Account Deletion Finalization Policy v1

> Tracking: #1073 / parent #964 / DR parent #389  
> Decision: `P0-PR-01 = DECIDED`  
> Approved: 2026-09-19 by PRODUCT_OWNER  
> Authority record: https://github.com/gycha0109-beep/MyeongHa/issues/964#issuecomment-5737913582

## Approved policy

The product owner approved the following production policy baseline:

- 35 Subject-reachable service/personalization tables → `DELETE`
- 4 structural/tombstone tables → `ANONYMIZE`
- 9 Commerce evidence/history tables → `RETAIN` for calendar period `P5Y`
- Auth mapping and hosted Auth user → `DELETE`
- existing encrypted backup lifecycle → `P30D`; historical backup blobs are not rewritten for each account deletion
- a restored environment must replay/reconcile privacy deletion evidence before it can be treated as serviceable

The four ANONYMIZE tables are:

```text
subjects
data_deletion_jobs
subject_merge_jobs
subject_merge_actions
```

The nine RETAIN tables are:

```text
commerce_account_links
purchase_intents
purchase_intent_reader_selections
commerce_payment_attempts
commerce_receipts
commerce_provider_events
entitlement_grants
entitlement_events
entitlements
```

`purchase_intent_reader_selections` is included because migration 1130 defines it as append-only Reader selection provenance pinned to the Purchase Intent; it is therefore governed with the approved Commerce transaction/supply-evidence class.

All remaining reachable tables are DELETE.

## Retention representation

Five calendar years is represented as ISO-8601 calendar period `P5Y`, not as a fixed `1825`-day approximation. The existing backup lifecycle is represented as `P30D`.

Retained Commerce data is restricted to legal/accounting/dispute evidence use. This product-owner approval is not represented as external-counsel sign-off.

## Graph binding and dependency strategies

Current schema-discovered graph:

```text
reachable edges   = 107
reachable tables  = 48
max depth         = 4
semantic SHA-256  = 3daa7e616da04dabc30a4d8807a842b31bff580f804305eefc17ec7f746bd030
```

The approved policy is bound to that semantic graph fingerprint, so same-count FK identity drift fails closed.

The approved 35/4/9 split creates 30 mixed-disposition edges. Every exact edge is covered in `ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json`.

Strategy references mean:

- `DELETE_CHILD_BEFORE_PARENT_ANONYMIZATION_V1`: delete the child before the retained parent row is tombstone-anonymized.
- `RETAIN_CHILD_LINK_TO_ANONYMIZED_PARENT_TOMBSTONE_V1`: retained Commerce evidence may continue referencing only the anonymized Subject tombstone, never live personalization/auth identity.
- `DETACH_OR_REWRITE_CHILD_REFERENCE_BEFORE_PARENT_DELETE_V1`: make an anonymized child reference schema-safe before deleting its parent. This is an implementation requirement, not proof that the mutation layer already exists.

## Authorization boundary

The approved disposition contract authorizes generation of the structured 48-step non-SQL plan.

It does **not** claim a destructive runtime finalizer already exists:

```text
structuredDispositionPlanningAuthorized = true
destructiveRuntimeAuthorized             = false
destructiveSqlAllowed                    = false
authoritativePrivacyReconciliation       = false
futureSafePrivacyReconciliation          = false
drReady                                  = false
```

The next implementation frontier is the idempotent finalizer / FK-safe mutation layer plus restored-state non-zero reconciliation proof. RPO/RTO remain separate OPEN decisions under #389.
