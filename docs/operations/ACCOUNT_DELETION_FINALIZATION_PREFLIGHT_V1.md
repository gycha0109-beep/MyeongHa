# Account Deletion Finalization Preflight v1

> Tracking: #1077 / parent #964 / DR parent #389  
> P0 authority: `P0-PR-01 = DECIDED`  
> Status: **READ-ONLY WORKER HANDOFF PREFLIGHT / DESTRUCTIVE RUNTIME STILL BLOCKED**

## Purpose

`internal_account_deletion_finalization_preflight_v1(subject_id, deletion_job_id, lock_owner)` is the DB-local gate immediately before the destructive PostgreSQL finalizer.

It proves only that the current PostgreSQL state is ready for the DB-finalizer handoff. It does not delete, anonymize, complete a deletion job, or prove that hosted Auth deletion happened.

Canonical authority remains:

```text
P0-PR-01                         = DECIDED
destructiveRuntimeAuthorized     = false
authoritativePrivacyReconciliation = false
drReady                          = false
```

## Returned surface

The function returns booleans and counts only:

```text
subject_found
subject_member
subject_deletion_pending
deletion_job_found
deletion_job_account_running
account_start_outbox_ready
auth_mapping_present
linked_outbox_count
blocking_outbox_count
db_preconditions_met
```

It does not return:

- `auth.users.id` / `subjects.auth_user_id`;
- outbox payloads;
- outbox aggregate ids;
- user content;
- row payloads from deletion targets.

## DB-local handoff contract

`db_preconditions_met=true` requires all of the following:

1. the Subject exists, is a Member, and is `deletion_pending`;
2. the exact deletion job belongs to that Subject, has `scope='account'`, and is `running`;
3. the DB Auth mapping still exists so the server worker can resolve and retain the hosted Auth deletion target without accepting a client-controlled user id;
4. exactly one `ACCOUNT_DELETION_STARTED` outbox event exists for that exact deletion job;
5. that start event is `processing`, its `lock_owner` exactly matches the calling worker, and its lease is unexpired;
6. every other currently discoverable Subject-linked outbox event is terminal (`processed`).

Pending, processed-before-finalization, failed, dead-lettered, foreign-owner processing, expired-lease processing, or unrelated processing Subject-linked work fails closed.

## Current outbox association coverage

The repository currently creates outbox rows from exactly four governed producer migrations:

```text
0220_chat_attempt_commit_commands.sql       -> aggregate_type = chat_turn
0260_reading_transport_commands.sql         -> aggregate_type = reading
0290_account_deletion_start_command.sql      -> aggregate_type = data_deletion_job
1080_entitlement_effect_apply_v1.sql         -> aggregate_type = entitlement
```

The preflight associates those aggregate types back to the canonical Subject through their authoritative tables.

It also treats top-level `payload_jsonb.subjectId` as a fail-closed fallback so a Subject-linked event remains visible even when its aggregate type is not in the current mapping.

`scripts/verify-account-deletion-finalization-preflight.mjs` scans every migration for `INSERT INTO public.outbox_events`. Any producer-set drift fails CI until this association coverage is reviewed.

## Hosted Auth boundary

hosted Auth deletion is external to PostgreSQL.

The intended later worker sequence is:

```text
ACCOUNT_DELETION_STARTED claimed with exact lock_owner + active lease
-> DB read-only preflight using the same lock_owner
-> resolve hosted Auth target server-side
-> DB destructive finalizer
   - re-check under Subject row lock
   - apply approved DELETE / ANONYMIZE work
   - transition subjects.status to deleted
   - keep subjects.auth_user_id until hosted Auth cleanup succeeds
-> hosted Auth admin delete
   - subjects_auth_user_fk ON DELETE SET NULL is now legal because status=deleted
-> DB completion acknowledgement
   - verify Auth mapping is null / cleanup is terminal
   - mark deletion job completed
-> complete ACCOUNT_DELETION_STARTED through the existing outbox success command using the same lock_owner
```

This order is required by the existing `subjects_member_auth_required_check`: a Member in `active` or `deletion_pending` must still have a non-null `auth_user_id`. Deleting hosted Auth first would invoke `ON DELETE SET NULL` while the Subject is still `deletion_pending` and would violate that check.

Keeping `auth_user_id` through the DB-finalizer commit also preserves a durable retry target if the worker crashes before hosted Auth deletion. The final policy state remains `auth_user_id = NULL`; it is reached only after hosted Auth cleanup.

The DB destructive finalizer must **not** trust an earlier preflight result. It must re-check the same invariants under the Subject row lock before any DELETE/ANONYMIZE mutation, because outbox or lifecycle state can change after the read-only check.

## Explicitly absent

This slice adds no:

- DELETE/ANONYMIZE mutation;
- Subject `status='deleted'` transition;
- Auth mapping removal;
- hosted Auth Admin API call;
- deletion-job completion;
- retention-period change;
- backup mutation;
- authoritative recovery-source promotion;
- RPO/RTO value;
- DR Ready claim.

## Next frontier

After this preflight is runtime-proven, the next DB slice is the idempotent FK-safe finalizer. It must account for the approved 35 DELETE / 4 ANONYMIZE / 9 RETAIN policy, the single `guest_sessions -> subject_merge_jobs` detach strategy, DELETE-subgraph cycles, and subject-linked outbox cleanup without weakening the P5Y Commerce tombstone linkage.
