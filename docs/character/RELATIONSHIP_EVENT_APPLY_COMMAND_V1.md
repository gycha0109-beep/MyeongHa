# Relationship Event Apply Command V1

> Track: character-memory  
> Phase: **M — Atomic Relationship Event Apply + PostgreSQL Adapter**  
> Runtime Se-yeon binding: **DISABLED**  
> Upstream: Production Relationship Policy V1 + Relationship Persistence Schema V1

## 1. Purpose

PHASE M introduces the only normal Production mutation path for the frozen Relationship Policy V1.

The authority chain remains:

~~~text
authorized Production Relationship Event
→ deterministic TypeScript Production policy evaluation
→ PostgreSQL serialized commit authority
→ append-only relationship history
→ mutable current projection
~~~

The LLM, renderer, client and experimental Se-yeon Event ledger receive no direct database mutation authority.

## 2. Policy authority split

Production relationship meaning is not reimplemented in PL/pgSQL.

~~~text
packages/domain/src/
  relationship-event-registry-v1.ts
  relationship-policy-artifact-v1.ts
  relationship-policy-evaluator-v1.ts
  relationship-policy-reference-replay-v1.ts

= semantic calculation authority
~~~

PostgreSQL independently enforces:

- canonical Subject scope;
- row serialization;
- active immutable policy identity;
- exact Event registry/family/delta/payload constraints;
- source/provenance referential integrity;
- causal shape;
- append-only history;
- one physical revision per committed history record;
- bounded current projection;
- atomic commit/rollback.

The frozen artifact identity seeded into PostgreSQL is:

~~~text
policy_version = relationship-policy-v1
artifact_schema_version = relationship-policy-definition-v1
content_hash = sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c
~~~

Repository tests compare the migration payload and hash directly with
`PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1`.

## 3. Transaction boundary

PHASE M uses the existing PostgreSQL Subject transaction:

~~~text
BEGIN
→ SET LOCAL ROLE myeongha_api_executor
→ canonical Subject resolution + transaction-local Subject binding
→ relationship lock/load context
→ deterministic TypeScript replay/evaluation
→ atomic relationship commit
→ application verifies DB result == evaluator result
→ COMMIT
~~~

Context and commit ports must use the same PostgreSQL transaction client.

## 4. First relationship baseline

Reads still never invent a relationship row.

The first governed apply command creates or normalizes the zero-revision baseline under the locked Subject:

~~~text
closeness               = 0
trust                   = 0
friction                = 0
relationship_stage      = S0_FIRST_MEETING
attained_stage          = S0_FIRST_MEETING
current_candidate_stage = S0_FIRST_MEETING
current_condition       = STABLE
revision                = 0
policy_version          = relationship-policy-v1
policy_state_schema     = relationship-policy-state-v1
~~~

The baseline itself consumes no relationship revision.

A legacy compatibility row may be normalized only when:

- revision = 0;
- closeness/trust/friction = 0;
- Production policy-state columns are NULL;
- no Production relationship history exists;
- no legacy relationship Event exists.

Anything else fails with explicit migration required.

## 5. Lock/load context

`cmd_lock_relationship_apply_context_v1`:

1. asserts the bound canonical Subject;
2. locks the Subject root;
3. verifies the Character;
4. resolves the currently active immutable policy;
5. validates authoritative Event source/time;
6. creates or normalizes the zero baseline when required;
7. locks `user_character_states`;
8. returns the physical append-only history in deterministic revision order.

The row locks remain held until the outer transaction ends.

## 6. Authoritative occurrence time

Caller-selected arbitrary backdating is not accepted.

### conversation_turn

- sourceRef = canonical committed turn UUID;
- sourceMessageRefs = canonical message UUIDs inside that turn;
- committed Character response must belong to the Event Character;
- `occurred_at` = millisecond-normalized maximum source-message `created_at`;
- `last_interaction_at` candidate = authoritative `chat_turns.committed_at`.

### world_event

- sourceRef = canonical world Event UUID owned by the Subject;
- no message provenance;
- `occurred_at` = world Event occurrence time.

### merge_action

- sourceRef = canonical applied merge-action UUID belonging to the Subject merge;
- no message provenance;
- `occurred_at` = merge-action completion time.

### server_observation

- no message provenance;
- observation timestamp must not be in the future;
- the trusted server observation time is normalized to millisecond precision.

## 7. History replay integrity

The lock/load result is reconstructed as
`ProductionRelationshipHistoryRecordV1[]` and evaluated through:

~~~text
replayProductionRelationshipHistoryV1(history)
~~~

Before applying a new Event, the application requires exact agreement between replay and the stored projection for:

- physical revision;
- closeness/trust/friction;
- attained stage;
- current candidate stage;
- current condition;
- policy version/hash;
- compact policy-state projection.

Mismatch fails closed as `PROJECTION_INTEGRITY_MISMATCH`.

Snapshots are not consulted as truth authority.

## 8. Idempotency order

The command intentionally checks logical retry before stale revision.

~~~text
LOCK
→ find existing event_dedupe_key
   ├─ same semantic Event → replay current result, no write
   └─ changed semantic material → IDEMPOTENCY_CONFLICT
→ only for a new Event: expectedRevision check
~~~

Therefore response-loss retry remains valid even when the first request already advanced the physical revision.

Event identity itself may differ on a retry; semantic retry material excludes `eventId` but includes:

- Subject + Character;
- Event kind/schema;
- behavior key;
- authoritative occurrence time;
- source/provenance;
- causal predecessor set/order;
- objective facts;
- Character interpretation;
- allowlisted payload.

## 9. New Event evaluation

For a genuinely new Event:

~~~text
current active logical Events
+ new authorized Event
→ evaluateProductionRelationshipHistoryV1(
    ...,
    physicalRevision = currentRevision + 1
  )
~~~

The resulting decision supplies:

- relationship family;
- effect disposition;
- credited/suppressed status;
- effective score delta;
- milestone;
- current projection after the Event.

A zero-positive-effect authorized Event still consumes one physical revision.

`SUPPRESSED_POSITIVE_CREDIT` therefore means:

~~~text
Event occurrence retained
revision consumed
positive score gain = 0
positive progression = 0
stage promotion = false
~~~

## 10. Atomic DB commit

`cmd_apply_relationship_event_runtime_v1` atomically:

1. re-enters the locked governed context;
2. resolves the active V1 policy identity;
3. handles exact logical retry before revision conflict;
4. verifies expected revision for new Events;
5. appends `relationship_history_entries`;
6. appends `relationship_event_records`;
7. appends causal predecessor links;
8. appends source-message and authority provenance refs;
9. updates `user_character_states`;
10. forces the relevant deferred relationship constraints to validate;
11. returns the committed projection.

Any failure rolls the entire statement/transaction back.

Ordinary Event apply cannot decrease `attained_stage`. Correction/retraction replay remains the only V1 path that may later derive a lower attained stage, and its mutation command belongs to PHASE N.

## 11. last_interaction_at

Only a successfully committed direct conversation turn can update this field.

~~~text
conversation_turn Event
→ last_interaction_at =
  greatest(previous value, authoritative chat_turns.committed_at)
~~~

World Events, merge actions, server observations, replay and background rebuild do not update it.

An anti-farming-suppressed conversation Event may still update `last_interaction_at` because direct interaction and relationship progression are separate concepts.

## 12. Compact policy state

`policy_state_jsonb` remains a derived compact projection, not a truth ledger.

V1 stores bounded summary material:

- evaluated Event count;
- behavior access;
- fixed-family Episode counts;
- credited/suppressed Episode counts;
- distinct positive day/week/family counts;
- milestone count;
- unresolved conflict count.

It does not duplicate unbounded Event-id history.

## 13. Runtime authority

The command owner is:

~~~text
myeongha_relationship_apply_owner
~~~

It is:

~~~text
NOLOGIN
NOSUPERUSER
NOCREATEDB
NOCREATEROLE
NOINHERIT
NOREPLICATION
NOBYPASSRLS
~~~

`myeongha_api_executor` receives EXECUTE on the two governed functions only.

It receives no direct relationship INSERT/UPDATE privilege.

Direct Supabase API roles retain no EXECUTE permission.

## 14. PHASE M explicit non-goals

PHASE M does not introduce:

- HTTP relationship mutation endpoint;
- LLM/client-selected Event delta or stage;
- experimental Se-yeon Event → Production persistence binding;
- correction/retraction Production commands;
- snapshot cadence/rebuild worker;
- automatic retry/backoff;
- concurrency stress policy beyond the serialized transaction primitive;
- historical policy migration;
- runtime manifest activation.

## 15. Next phase

PHASE N pressure-tests and extends the persistence command with:

~~~text
concurrency races
response-loss retries
idempotency conflict matrices
correction/retraction commands
persisted deterministic replay
snapshot invalidation/rebuild
projection integrity recovery
retry/backoff policy
~~~

Only after PHASE N is closed does PHASE O connect the governed Se-yeon runtime to this Production write path.
