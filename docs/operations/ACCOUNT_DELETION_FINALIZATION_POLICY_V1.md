# Account Deletion Finalization Policy v1

> Tracking: #1073 / parent #964 / DR parent #389  
> Decision: `P0-PR-01 = DECIDED`  
> Approved: 2026-09-19 by PRODUCT_OWNER  
> Authority record: https://github.com/gycha0109-beep/MyeongHa/issues/964#issuecomment-5737913582

## Approved policy

The product owner approved the following production policy baseline:

- 35 Subject-reachable service/personalization tables → `DELETE`
- 4 structural/tombstone tables → `ANONYMIZE`
- 8 Commerce evidence/history tables → `RETAIN` for calendar period `P5Y`
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

The eight RETAIN tables are:

```text
commerce_account_links
purchase_intents
commerce_payment_attempts
commerce_receipts
commerce_provider_events
entitlement_grants
entitlement_events
entitlements
```

All remaining reachable tables are DELETE.

## Retention representation

Five calendar years is represented as ISO-8601 calendar period `P5Y`, not as an invented fixed `1825`-day duration. The existing backup lifecycle is represented as `P30D`.

Retained Commerce data is restricted to legal/accounting/dispute evidence use. This policy approval is not represented as external-counsel sign-off.

## Dependency strategies

The schema-discovered graph contains 106 reachable FK edges and 47 reachable tables. The approved 35/4/8 split creates 30 mixed-disposition edges. Each exact edge is explicitly covered in `ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json`.

Strategy references mean:

- `DELETE_CHILD_BEFORE_PARENT_ANONYMIZATION_V1`: the child is deleted before the retained parent row is tombstone-anonymized.
- `RETAIN_CHILD_LINK_TO_ANONYMIZED_PARENT_TOMBSTONE_V1`: retained Commerce evidence may continue referencing only the anonymized Subject tombstone, never live personalization/auth identity.
- `DETACH_OR_REWRITE_CHILD_REFERENCE_BEFORE_PARENT_DELETE_V1`: a retained/anonymized child reference must be made schema-safe before its DELETE parent is removed. This is an implementation requirement, not proof that the required FK rewrite already exists.

## Authorization boundary

The approved disposition contract authorizes generation of the structured 47-step non-SQL plan.

It does **not** authorize or claim that a destructive runtime finalizer already exists:

```text
structuredDispositionPlanningAuthorized = true
destructiveRuntimeAuthorized             = false
destructiveSqlAllowed                    = false
authoritativePrivacyReconciliation       = false
futureSafePrivacyReconciliation          = false
drReady                                  = false
```

The next implementation frontier is therefore the idempotent finalizer / FK-safe mutation layer plus restored-state non-zero reconciliation proof. RPO/RTO remain separate OPEN decisions under #389.
