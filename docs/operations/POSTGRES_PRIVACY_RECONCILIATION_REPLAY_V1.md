# PostgreSQL Privacy Reconciliation Replay Foundation v1

> Issues: #389, #964  
> Scope: post-backup privacy authority replay mechanics only  
> DR Ready: false

## Runtime authority update — 2026-10-28

The foundation-era `Durable-source limitation` and `Promotion path` below describe historical design gaps; they must not override the separately implemented encrypted off-primary-DB `AUTHORITATIVE_CAPTURED_WINDOW_V1` ledger. The concrete [restore 40655447574](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40655447574) used exact backup `40468157715`, privacy ledger `40468500587`, and successful read-only completed-canary proof `40633679630` for original failed parent `40468086758`. The captured-window **one-event** replay, identical replay idempotency, finalization completion, non-resurrection and Commerce P5Y retention passed on isolated PostgreSQL 17. It did not delete another account or turn the failed parent run into SUCCESS.

```ini
authoritative_privacy_reconciliation = true
authoritative_source_scope = captured-window-only
replay_event_count = 1
second_identical_replay = idempotent-pass
completion_replay = idempotent-pass
future_safe_privacy_reconciliation = false
dr_ready = false
```

Read-only Production migration ledger version `20261028011357` was newer than this restored backup's `20261027043527`. Ledger capture ends at `2026-10-27T07:40:33Z`; no event-completeness guarantee beyond that instant has been proven. Any recovery reference later than its authorized captured window must fail closed. See [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887); a fresh backup and complete independent privacy source are still required for a future incident.

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
| `SHARED_MEMORY_NOTE_DELETED` | `internal_replay_shared_memory_note_deletion_v1` (privileged exact-Subject/ID/time, idempotent erasure) |
| `LIFE_FACT_REVOKED` | `cmd_revoke_life_fact_v1` |
| `MEMORY_CHARACTER_GRANT_REVOKED` | `cmd_revoke_memory_character_grant_v1` |
| `LIFE_FACT_CHARACTER_GRANT_REVOKED` | `cmd_revoke_life_fact_character_grant_v1` |
| `CHARACTER_RECORDS_FORGOTTEN` | `cmd_forget_character_records_v1` |

The generated SQL does not issue direct `DELETE`, `TRUNCATE`, `UPDATE public.*`, or `INSERT INTO` statements. It mutates state only through the governed command surfaces. Read-only terminal-state checks are added around deletion-pending subjects so the complete transaction can be replayed safely after a prior successful run.

## Replay idempotency

The entire plan runs in one transaction.

For a subject that also has an `ACCOUNT_DELETION_STARTED` event, earlier standalone revoke commands can only run while that subject is active. After the first successful replay, the subject becomes `deletion_pending`. A second replay therefore validates the already-established terminal revoke state instead of trying to invoke an active-subject-only command again.

The account-deletion-start replay also validates its current v1 postconditions after the idempotent command call:

- subject is `deletion_pending`
- the exact account deletion job is `running`
- the exact `ACCOUNT_DELETION_STARTED` outbox provenance row exists
- no active Share Artifact remains
- no unrevoked Device Installation remains
- no queued/ready Notification remains

A missing terminal state aborts the transaction.

## Deliberately blocked

The following remain outside this foundation and must fail closed:

- destructive account deletion finalization
- auth identity removal or pseudonymization
- physical deletion of retained encrypted/provider provenance
- legal/accounting retention duration
- commerce evidence deletion or retention decisions
- any unrecognized future privacy event

Those decisions remain under `P0-PR-01` / issue #964.

## Restored-database synthetic integration

The same replay drill used by DB CI is now exposed through:

```text
scripts/run-postgres-privacy-reconciliation-synthetic-drill.sh
```

The isolated restore workflow invokes that script **after** the governed backup has been restored and validated. It creates collision-guarded synthetic fixtures only inside the disposable loopback database, compiles a five-event non-zero replay plan (Memory revoke, Life Fact revoke, Device Installation revoke, manual shared-memory note deletion, and account-deletion start), executes it, executes the identical plan a second time to prove idempotency, and verifies a separate malformed terminal-state case fails closed.

The uploaded synthetic evidence is identifier-free and explicitly records:

```text
synthetic_fixture = true
authoritative_post_backup_source = false
replay_result = pass
second_identical_replay = idempotent-pass
negative_terminal_state_guard = fail-closed-pass
dr_ready = false
```

This is a **mechanics exercise only**. It does not turn `synthetic-db-drill` into durable privacy authority and does not satisfy account-finalization or commerce-retention policy. Manual restore run `35325070718` runtime-proved the integration from main head `eddc1c331b6a8c0f47f54c150acd2f6cc5c7c0c2`: all four synthetic event types replayed, the identical second replay was idempotent, the negative terminal-state case failed closed, and the sanitized evidence recorded `authoritative_post_backup_source=false` and `dr_ready=false`.

## Historical foundation-era durable-source limitation (superseded for captured-window source only)

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

## 2026-11-10 — Owner-approved individual manual note delete replay

`SHARED_MEMORY_NOTE_DELETED` contains `sharedMemoryItemId`, `subjectId` and the existing `occurredAt`. The captured-window ledger read-only exporter emits these fields without note text; the encrypted manifest is source-bound by the existing digest and backup/incident guard. The recovery plan issues only a privileged, owner-only function call, not inline direct DELETE. This function physically removes the exact restored owner note, records only identifiers/time, and is idempotent for repeated manifests; a conflicting owner or timestamp aborts the whole transaction. A note created and deleted after the backup is allowed to remain absent. Public report still contains counts only.

This is a Draft implementation. Restored DBs must first have governed migration 2380 applied; an older schema must fail closed. There is no extension to the existing P30D encrypted artifact retention and no claim of continuous future-safe privacy reconciliation or DR Ready.

## 2026-11-10 — Manual shared-note deletion in the existing isolated restore drill

The existing non-zero encrypted captured-window synthetic drill now adds one `SHARED_MEMORY_NOTE_DELETED` event before account-deletion start. Its fixture represents text present in a backed-up database but erased by an independently captured post-backup owner deletion. The existing manifest builder, AES-256-CBC encrypted roundtrip, exact replay planner, disposable PostgreSQL execution, repeated replay, finalizer and sanitized report pipeline all remain in use.

- A preflight requires the real `2380` shared-note recovery table and replay function **before any fixture is inserted**. Older restored schema fails closed; no unilateral Production migration is performed.
- The drill proves the restored note is present before replay, absent after replay, and still absent after an identical second replay. It checks the exact timestamped, identifier-only deletion marker and ensures repeated replay neither changes its clock nor duplicates it.
- The public synthetic proof adds `shared_memory_note_non_resurrection: synthetic-recovered-db-pass`, with a note deletion event type count of one and no note text or identifiers. `dr_ready=false` is unchanged.
- Disposable PostgreSQL 15 execution with a fresh clone of the historical catalog plus migration 2380 succeeded, including the existing four privacy event categories and separate negative terminal-state case; missing-migration rejection succeeded separately. This is **synthetic local isolation**, not a live backed-up Production database, independently captured future source, hosted provider restore, approved deployment, or whole-service DR readiness.

## 2026-11-10 — Verbatim Production SELECT source-path synthetic drill

The `db-authority-core` synthetic test now exercises the actual read-only source SQL embedded in `scripts/operations/export-production-postgres-privacy-recovery-ledger.sh`, not a parallel reimplementation. It snapshots a synthetic shared note in an isolated PostgreSQL clone, runs an owner-authorized DELETE against the source DB, captures the generated `SHARED_MEMORY_NOTE_DELETED` event through the actual production SQL, and feeds that result into the existing bounded ledger manifest and replay plan. A second isolated restored clone proves physical erasure, exact Subject/item metadata, replay idempotency and capture-window exclusion. Plaintext never enters the event payload. All temporary raw sources remain local and are deleted.

This test is a **disposable synthetic source-to-restored-database integration check**, not proof of a live or continuously complete off-DB Production ledger, an actual deployed 2380 migration, real backup artifacts, or whole-service DR. `futureSafePrivacyReconciliation=false` and `drReady=false` remain required.
