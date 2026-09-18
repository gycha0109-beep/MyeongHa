# PostgreSQL Privacy Recovery Ledger Candidate v1

> Tracking: #1058 / parent #964 / DR parent #389  
> Status: **CANDIDATE TRANSPORT MECHANICS / NOT AUTHORITATIVE**  
> P0 authority: `P0-PR-01 = OPEN-P0`  
> DR authority: `dr_ready=false`

## Purpose

This mechanism preserves replay-supported post-backup privacy-event evidence outside the primary PostgreSQL failure domain so recovery mechanics can be exercised without inventing the still-open destructive deletion and legal-retention policy.

It is deliberately **not** the final privacy authority.

```text
primary PostgreSQL current state
→ explicit READ ONLY snapshot query
→ replay-supported privacy event rows
→ deterministic reconciliation manifest
→ encrypted artifact
→ GitHub Actions artifact storage

authoritative_post_backup_source = false
authoritative_privacy_reconciliation = false
future_safe_privacy_reconciliation = false
dr_ready = false
```

## Workflow

```text
.github/workflows/production-postgres-privacy-recovery-ledger.yml
```

Triggers:

- hourly at minute 47 UTC;
- manual `workflow_dispatch`, optionally with an exact governed backup run ID.

The hourly cadence is **operational snapshot mechanics only**. It is not an approved RPO and must not be presented as one.

When no manual backup run ID is provided, the workflow resolves the latest successful governed `Production PostgreSQL Logical Backup` run on `main`, validates its exact workflow path/event/source/artifact, and reads the public backup manifest to establish the backup completion cutoff.

## Current replay-supported event set

The candidate exports only event shapes already accepted by `scripts/build-postgres-privacy-reconciliation-plan.mjs`:

```text
ACCOUNT_DELETION_STARTED
SHARE_ARTIFACT_REVOKED
DEVICE_INSTALLATION_REVOKED
MEMORY_ITEM_REVOKED
LIFE_FACT_REVOKED
MEMORY_CHARACTER_GRANT_REVOKED
LIFE_FACT_CHARACTER_GRANT_REVOKED
```

A character-forget operation is represented by the individual grant revocations that constitute its durable access result. The candidate does not invent a new replay semantic.

## Fail-closed unsupported boundary

The export aborts rather than publishing a partial ledger when any currently unsupported post-backup privacy/lifecycle state is observed:

```text
account deletion job without exactly one matching ACCOUNT_DELETION_STARTED outbox event
non-account data_deletion_job after the selected backup cutoff
non-active subject lifecycle change not explained by a post-cutoff account-deletion start
```

This is intentional. The candidate must never imply recovery completeness while the replay planner lacks authority for an observed state transition.

## Data handling

The source query runs inside:

```sql
BEGIN TRANSACTION READ ONLY;
...
ROLLBACK;
```

The plaintext source and reconciliation manifest contain identifiers required to replay revocations. They are ephemeral runner files and are deleted before artifact upload.

The uploaded artifact contains only:

```text
encrypted manifest archive
encrypted archive SHA-256
identifier-free public manifest/summary
```

The encryption passphrase is domain-separated from the existing DR backup passphrase with HMAC-SHA-256 before AES-256-CBC/PBKDF2 encryption. The root secret is still the existing protected recovery secret, so this does **not** create a separate administrative/security domain.

Artifact retention is 30 days as an operational mechanism. It does not decide legal/accounting, product-data, backup, or privacy-retention policy under P0-PR-01.

## Determinism

`scripts/build-postgres-privacy-recovery-ledger-manifest.mjs`:

- validates the backup/capture interval;
- rejects unsupported event types;
- rejects any non-zero unsupported-state count;
- sorts by occurrence time and stable canonical row serialization;
- derives deterministic event IDs from canonical event material;
- derives a deterministic source digest;
- emits `myeongha-postgres-privacy-reconciliation-manifest-v1`;
- re-validates the result through the existing reconciliation planner;
- emits an identifier-free summary.

Repeated construction from identical source rows and metadata must produce an identical manifest.

## What this does not decide

#1058 does not authorize or define:

- destructive account erasure/finalization;
- removal/pseudonymization of `subjects` or Auth mappings;
- Commerce/legal/accounting record classes or retention durations;
- population of `retention_exceptions_jsonb` from operator judgment;
- a future-safe authoritative privacy source;
- approved RPO or RTO;
- production serving from a restored database;
- full Supabase Auth/Storage provider recovery equivalence.

Those remain under P0-PR-01 / #964 / #389.

## Promotion path

A future authority promotion requires, at minimum:

1. owner-approved deletion/finalization and legal-retention decisions;
2. explicit review of whether this off-DB artifact mechanism is accepted as authoritative and whether its cadence/retention/security domain satisfy approved recovery objectives;
3. runtime evidence that non-zero replay-supported events survive primary DB loss and replay idempotently;
4. explicit treatment of any currently unsupported privacy/lifecycle transitions;
5. restored-state verification that deleted/revoked access does not resurrect while only policy-approved Commerce evidence remains;
6. approved RPO/RTO comparison.

Until those gates are met:

```text
candidate_source_authority = true
authoritative_post_backup_source = false
future_safe_privacy_reconciliation = false
dr_ready = false
```
