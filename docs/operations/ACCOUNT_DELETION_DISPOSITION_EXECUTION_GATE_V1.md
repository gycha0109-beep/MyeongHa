# Account Deletion Disposition Execution Gate v1

> Tracking: #1071 / parent #964 / DR parent #389  
> Historical input authority: `P0-PR-01 = OPEN-P0` candidate  
> Current decision authority: `P0-PR-01 = DECIDED` via `ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json`  
> Status: **HISTORICAL POLICY-NEUTRAL GATE / APPROVED SUCCESSOR EXISTS**

## Purpose

This contract connects the schema-discovered transitive Subject dependency graph to explicit owner-supplied dispositions without choosing any deletion or retention policy.

Canonical candidate:

```text
docs/operations/ACCOUNT_DELETION_DISPOSITION_INPUT_CANDIDATE_V1.json
```

Historical pre-approval candidate state:

```text
reachable FK edges          = 107
reachable tables            = 48
max minimum depth           = 4
all table dispositions      = UNDECIDED
P0-PR-01                    = OPEN-P0
policyAuthority             = NOT_APPROVED
executionAuthorized         = false
authoritative reconciliation= false
drReady                     = false
```

## Bounded disposition vocabulary

The execution gate recognizes only:

```text
UNDECIDED
DELETE
ANONYMIZE
RETAIN
```

These names are slots for an owner-approved policy. Their presence in this contract does not select any value.

## Coverage invariant

`scripts/evaluate-account-deletion-disposition-contract.mjs` derives the expected table set from `TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_V1.json` and requires exact one-to-one coverage.

Therefore:

- every one of the 48 reachable tables must have exactly one disposition entry;
- unknown, duplicate, or omitted tables fail closed;
- every one of the 107 reachable FK edges must map to a covered child table;
- graph identity/count drift fails closed.

## Dependency conflict invariant

When both ends of a reachable FK edge have resolved dispositions and the parent/child dispositions differ, the edge is treated as a conflict unless the exact edge has an explicit `edgeConflictResolutions` entry with both policy authority and execution-strategy references.

This is intentionally conservative. The gate does not infer cascade/nulling/pseudonymization behavior from engineering convenience.

## Authorization invariant

For the preserved historical candidate where `P0-PR-01` was `OPEN-P0`:

```text
executionAuthorized must be false
approval metadata must be null
executionPlanAllowed = false
destructiveSqlAllowed = false
```

`buildAccountDeletionExecutionPlan(...)` refuses the canonical candidate. It can only return a structured non-SQL plan after an approved/authorized contract is supplied and all coverage/conflict checks pass.

## Explicitly absent

This work adds no:

- destructive SQL;
- database migration;
- finalization worker;
- retention duration;
- legal/accounting basis;
- hosted Auth deletion call;
- backup purge rule;
- authoritative privacy reconciliation promotion;
- RPO/RTO value.

Those were intentionally absent from this historical candidate. The approved successor is `ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json`; destructive runtime implementation, authoritative recovery reconciliation, and RPO/RTO remain separate work.
