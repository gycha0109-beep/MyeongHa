# Account Deletion Finalizer Catalog Blockers v1

> Tracking: #1084 / parent #964  
> Catalog authority: fully migrated PostgreSQL schema  
> Approved policy: **DELETE 36 / ANONYMIZE 4 / RETAIN P5Y 9**  
> Destructive runtime authority: **false**

## Purpose

This artifact records the catalog blockers that the account-deletion DB finalizer must handle before destructive execution can be exposed.

The executable authority is `test/db/account_deletion_finalizer_catalog_guard.sh`. It derives the surface from `pg_catalog` after all migrations are applied and pins the complete deterministic digest:

```text
29b8c2b235c0ef6c512c50775245d5139775454bb0352d8a3876a5c85fff3f1d
```

Any FK, DELETE-trigger, anonymization-column, or guest-session detach-shape drift changes that digest and fails CI.

## DELETE-trigger blockers

Six current DELETE-trigger catalog rows exist on approved DELETE targets:

```text
birth_profile_revisions
  tr_birth_revision_immutable

episode_progress_events
  tr_episode_progress_events_append_only

reading_execution_attempts
  tr_terminal_reading_execution_immutable

reading_groundings
  tr_reading_grounding_immutable

reading_refs
  ct_reading_finalize_from_ref
  tr_reading_ref_immutable
```

The destructive finalizer therefore cannot be implemented as unrestricted ordinary `DELETE FROM ...` statements. A later execution boundary must preserve the normal immutability contract and permit deletion only inside the trusted account-finalization authority.

## DELETE-subgraph cycles

The migrated catalog currently contains 19 FK edges participating in cycles inside the 36-table DELETE subgraph.

They reduce to these cycle families:

```text
Birth
  birth_profiles <-> birth_profile_revisions

Chat / AI
  chat_turns
  chat_turn_attempts
  ai_execution_logs
  conversation_messages

Life Record
  life_facts -> life_facts

Reading
  reading_sessions
  readings
  reading_execution_attempts
  readings -> readings
```

The finalizer must break nullable back-pointers / committed pointers before ordered deletion and must not depend on accidental FK ordering.

## Approved guest-session detach requirement

Current catalog shape:

```text
subject_merge_jobs.guest_session_id = NOT NULL

FOREIGN KEY (guest_session_id, guest_subject_id)
REFERENCES guest_sessions(id, subject_id)
```

Approved policy requires:

```text
guest_sessions      -> DELETE
subject_merge_jobs  -> ANONYMIZE
```

Therefore the finalizer cannot delete the guest session while preserving the current merge-job row unless the merge-job reference is detached or rewritten first. The approved conflict strategy remains:

```text
DETACH_OR_REWRITE_CHILD_REFERENCE_BEFORE_PARENT_DELETE_V1
```

No detach schema mutation is introduced by this guard.

## Authority boundary

This slice does **not** add or promote:

- destructive DELETE / ANONYMIZE execution;
- a finalizer function or worker;
- hosted Auth deletion;
- account-deletion job completion;
- `destructiveRuntimeAuthorized=true`;
- authoritative privacy reconciliation;
- DR Ready, RPO, or RTO authority.

The next DB implementation must consume this pinned blocker surface rather than inventing a deletion order from prose.
