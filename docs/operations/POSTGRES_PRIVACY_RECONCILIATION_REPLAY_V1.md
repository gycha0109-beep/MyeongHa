# PostgreSQL Privacy Reconciliation Replay Foundation v1

> Issues: #389, #964  
> Scope: post-backup privacy authority replay mechanics only  
> DR Ready: false

## Purpose

A successful logical restore can resurrect state that was revoked after the backup cutoff. This foundation defines a deterministic replay-plan compiler for already-authorized privacy transitions without inventing the unresolved account-finalization or commerce-retention policy.

The compiler is:

```text
scripts/build-postgres-privacy-reconciliation-plan.mjs
```

It accepts a manifest supplied by an external durable authority and emits an ephemeral SQL plan plus a non-PII summary report.

## Manifest boundary

Schema:

```text
myeongha-postgres-privacy-reconciliation-manifest-v1
```

Required top-level authority bindings:

- manifest UUID
- governed backup run id
- exact backup completion timestamp
- incident reference timestamp
- source authority label
- source SHA-256 digest
- ordered privacy events

Every event must:

- have a unique UUID and positive sequence
- occur strictly after the backup completion point
- occur no later than the incident reference
- use one explicitly supported event type
- contain no unknown fields

The compiler sorts by the durable sequence, not by array order.

## Supported replay events

Only existing DB command authority is used:

| Manifest event | PostgreSQL command |
| --- | --- |
| `ACCOUNT_DELETION_STARTED` | `cmd_start_account_deletion_v1` |
| `SHARE_ARTIFACT_REVOKED` | `cmd_revoke_share_artifact_v1` |
| `DEVICE_INSTALLATION_REVOKED` | `cmd_revoke_device_installation_v1` |
| `MEMORY_ITEM_REVOKED` | `cmd_revoke_memory_item_v1` |
| `LIFE_FACT_REVOKED` | `cmd_revoke_life_fact_v1` |
| `MEMORY_CHARACTER_GRANT_REVOKED` | `cmd_revoke_memory_character_grant_v1` |
| `LIFE_FACT_CHARACTER_GRANT_REVOKED` | `cmd_revoke_life_fact_character_grant_v1` |
| `CHARACTER_RECORDS_FORGOTTEN` | `cmd_forget_character_records_v1` |

The generated SQL does not issue direct `DELETE`, `TRUNCATE`, `UPDATE public.*`, or `INSERT INTO` statements. It calls the governed idempotent command surfaces and returns only row counts from those calls.

## Deliberately blocked

The following remain outside this foundation and must fail closed:

- destructive account deletion finalization
- auth identity removal or pseudonymization
- physical deletion of retained encrypted/provider provenance
- legal/accounting retention duration
- commerce evidence deletion or retention decisions
- any unrecognized future privacy event

Those decisions remain under `P0-PR-01` / issue #964.

## Durable-source limitation

This compiler does **not** establish where the post-backup manifest is stored.

`sourceAuthority` and `sourceDigest` carry the upstream source declaration presented to the compiler. The compiler validates their presence and digest shape, but does not independently prove source storage or recompute an external source digest. The repository still lacks an owner-approved authority proving that this source survives primary PostgreSQL loss. Therefore:

```text
durable privacy ledger source = NOT PROVEN
account finalization policy    = OPEN
commerce retention policy      = OPEN
DR Ready                       = false
```

## Evidence policy

The generated report includes counts and policy-state flags only. It does not include event UUIDs, subject UUIDs, resource UUIDs, character identifiers, row payloads, Memory/Life Fact contents, or commerce row contents.

The generated SQL necessarily contains the identifiers required to execute the DB commands. It is an ephemeral operator artifact and must not be uploaded as DR evidence.

## Promotion path

After #964 resolves the policy/source authority:

1. generate a manifest from the approved durable source;
2. compile it with this fail-closed planner;
3. execute the ephemeral plan only against the isolated recovered database;
4. validate revoked access remains unavailable;
5. separately execute the approved account-finalization / commerce-retention procedure;
6. upload only the sanitized evidence report;
7. compare achieved recovery evidence against approved RPO/RTO before any DR Ready claim.
