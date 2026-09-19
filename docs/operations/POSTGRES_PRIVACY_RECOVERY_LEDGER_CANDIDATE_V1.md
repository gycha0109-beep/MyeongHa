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

## Runtime proof — run 35361080803

The candidate transport has now completed one governed Production runtime from main SHA `c8899478dba523f2ccfe1f6f00cda14a952a0273`.

```text
workflow run                      = 35361080803 / SUCCESS
event                             = workflow_dispatch
head branch                       = main
governed backup run               = 35329018925
backup source SHA                 = e1a6500968f7722666cae2038fd49ddf3f9d3540
backup artifact                   = myeongha-postgres-20260918T092042Z
backup cutoff                     = 2026-09-18T09:23:19.000Z
candidate captured_at             = 2026-09-18T15:13:38.000Z
candidate artifact ID             = 10553934875
candidate artifact                = myeongha-privacy-ledger-20260918T151342Z
candidate artifact expiry         = 2026-10-18T15:13:42Z
GitHub artifact digest            = sha256:dfa03b55d90011ea9b5ce52ec166fb6eb789a91874bafcc8341cd6e4c68543b0
encrypted archive SHA-256         = 91e2ea2fd615385d86d9864d7670b3139752a090fbe49884a8743258ccd938b5
source digest                     = sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
replay-supported event count      = 0
replay planner accepted           = true
unsupported delta guard           = PASS / zero unsupported deltas
candidate source authority        = true
authoritative post-backup source  = false
authoritative reconciliation      = false
future-safe reconciliation        = false
DR Ready                          = false
```

All workflow stages passed, including governed backup/cutoff validation, explicit read-only export, unsupported-state fail-close validation, deterministic existing-planner validation, encryption, and artifact upload.

Artifact inspection found exactly three uploaded files:

```text
myeongha-privacy-ledger-20260918T151342Z.tar.gz.enc
myeongha-privacy-ledger-20260918T151342Z.tar.gz.enc.sha256
myeongha-privacy-ledger-20260918T151342Z.manifest.json
```

No plaintext reconciliation manifest or identifier-bearing source file was uploaded. The encrypted archive SHA-256 matched the uploaded checksum exactly.

The public manifest is identifier-free and records all seven replay-supported event-type counts as zero for this interval. This runtime therefore proves **zero-event candidate transport mechanics**, not non-zero replay survivability and not authoritative recovery semantics.

## Synthetic non-zero transport-to-replay proof

The repository DB drill now exercises the candidate transport with a **non-zero synthetic fixture** before replay:

```text
4 replay-supported synthetic events
→ production ledger manifest builder
→ AES-256-CBC / PBKDF2 / 200000 iterations
→ ephemeral CI-only 256-bit random passphrase
→ encrypted manifest
→ plaintext-identifier absence check on ciphertext
→ decrypt
→ byte-for-byte + SHA-256 parity check
→ existing reconciliation planner
→ migrated PostgreSQL command replay
→ second identical replay idempotency check
→ negative deletion-pending terminal-state fail-close check
```

The four synthetic events are:

```text
MEMORY_ITEM_REVOKED
LIFE_FACT_REVOKED
DEVICE_INSTALLATION_REVOKED
ACCOUNT_DELETION_STARTED
```

This closes a mechanics gap between the previously separate ledger-builder/encryption tests and restored-DB replay tests: a non-zero manifest produced by the production builder must now survive encryption/decryption unchanged and drive the existing DB replay path.

It is **synthetic CI evidence only**. It does not change the production runtime statement above: run `35361080803` observed zero replay-supported events. It also does not prove that a future production non-zero artifact has survived a primary-DB-loss incident.

Authority remains:

```text
P0-PR-01 = OPEN-P0
executionAuthorized = false
authoritative_post_backup_source = false
authoritative_privacy_reconciliation = false
future_safe_privacy_reconciliation = false
dr_ready = false
```

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
3. runtime evidence that non-zero replay-supported events survive primary DB loss and replay idempotently — current run `35361080803` proves only the zero-event export/encryption path;
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
