# Account Deletion Finalizer Catalog Blockers v1

> Tracking: #1084 / parent #964  
> Catalog authority: fully migrated PostgreSQL schema  
> Approved policy: **DELETE 36 / ANONYMIZE 4 / RETAIN P5Y 9**  
> Destructive runtime authority: **false**

## Purpose

This artifact records the catalog blockers that the account-deletion DB finalizer must handle before destructive execution can be exposed.

The executable authority is `test/db/account_deletion_finalizer_catalog_guard.sh`. It derives the surface from `pg_catalog` after all migrations are applied and pins the complete deterministic digest:

```text
2e1a47a17ee18d29320e679a4bcfccd7266aaa1740dac48eadc227210cec6362
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
subject_merge_jobs.guest_session_id = NULLABLE

FOREIGN KEY (guest_session_id, guest_subject_id)
REFERENCES guest_sessions(id, subject_id)
```

Approved policy requires:

```text
guest_sessions      -> DELETE
subject_merge_jobs  -> ANONYMIZE
```

Migration 1171 resolves this blocker by making `guest_session_id` nullable; the DB finalizer detaches the merge-job reference before deleting the guest session. The approved conflict strategy remains:

```text
DETACH_OR_REWRITE_CHILD_REFERENCE_BEFORE_PARENT_DELETE_V1
```

The catalog guard now pins the resolved nullable detach shape so later schema drift fails closed.

## Authority boundary

Migration 1171 adds the DB finalizer implementation but keeps runtime invocation closed. This slice does **not** promote:

- EXECUTE for PUBLIC, anon, authenticated, service_role, or myeongha_api_executor;
- hosted Auth deletion;
- account-deletion job completion;
- `destructiveRuntimeAuthorized=true`;
- authoritative privacy reconciliation;
- DR Ready, RPO, or RTO authority.

The next DB implementation must consume this pinned blocker surface rather than inventing a deletion order from prose.
