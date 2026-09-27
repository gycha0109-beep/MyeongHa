# Se-yeon Production Relationship Vertical Slice V1

> Track: character-memory  
> Phase: **O — Se-yeon Production Vertical Slice**  
> Upstream: governed Se-yeon runtime + PHASE M atomic apply + PHASE N reliability

## 1. Purpose

PHASE O connects the governed Se-yeon dialogue runtime to the generic Production Relationship Engine without turning experimental Se-yeon memory/event artifacts into Production truth authority.

The causal loop is:

~~~text
Production relationship projection R
→ Se-yeon turn context pinned to R
→ governed dialogue generation / integrity / disclosure / output guard
→ committed turn
→ experimental post-turn candidate
→ Event Authority ADMIT_EXPERIMENTAL
→ separate Production admission bridge
→ generic Production Relationship Event
→ PHASE M/N persistence
→ Production relationship projection R+n
→ next turn reads R+n
~~~

A relationship Event created by the current turn never changes the context that already generated that turn.

## 2. Authority boundaries

The existing experimental ledger remains experimental.

~~~text
ADMIT_EXPERIMENTAL
!=
Production relationship write authority
~~~

Production admission rechecks:

- allowlisted Se-yeon → generic Production Event mapping;
- exact current committed turn binding;
- exact guarded assistant message binding for Character-output Events;
- verified/server observation authority already admitted by Event Authority;
- source/provenance containment;
- deterministic causal predecessor binding;
- Production V1 Event registry/payload contract.

Only after these checks may an Event carry:

~~~text
authority = authorized_relationship_event_v1
~~~

The bridge still cannot:

- create general durable memory;
- grant Character fact authority;
- override integrity;
- override disclosure.

## 3. Production runtime read

`qry_production_relationship_runtime_v1` exposes only the existing committed Production V1 projection.

It:

- requires the transaction-local canonical Subject;
- returns zero rows when no relationship exists;
- never creates a relationship baseline on read;
- rejects legacy/non-V1 projection material;
- is owned by the existing NOLOGIN/NOBYPASSRLS relationship command owner;
- is executable only through the dedicated API executor, not direct Supabase API roles.

The turn binding pins:

- relationship revision;
- attained stage;
- current candidate stage;
- current condition;
- Production policy version/hash.

Existing governed relationship band projection continues to supply closeness/trust/friction bands. PHASE O does not invent a new score→band threshold policy.

## 4. Production behavior overlay

`SeyeonProductionRelationshipRuntimeOverlayV1` is authoritative only for current relationship behavior state:

- attained stage;
- current condition;
- behavior access;
- exact Production relationship revision/policy identity.

It may override the current relationship state supplied to behavior planning, but cannot:

- override relationship bands;
- unlock disclosure;
- create facts;
- create shared history;
- create another relationship Event;
- mutate relationship state directly;
- append durable memory.

Therefore:

~~~text
S4_SPECIAL != romance confirmation
OPEN_CONFLICT != attained-stage regression
RESOLVED_RECENTLY != immediately STABLE
~~~

## 5. Activation modes

Server-owned activation modes are:

~~~text
OFF
  admission=false
  write=false
  behavior=false

SHADOW
  admission=true
  policy simulation only
  write=false
  behavior=false

WRITE_DARK
  admission=true
  write=true
  behavior=false

BEHAVIOR_SHADOW
  admission=true
  write=true
  Production behavior overlay calculated for comparison only

LIVE
  admission=true
  write=true
  Production behavior overlay supplied to the actual Se-yeon runtime
~~~

Clients/LLMs do not select the mode.

## 6. Generic Production mapping

The existing frozen mapping is reused:

~~~text
PROMISE_MADE                   → COMMITMENT_MADE
PROMISE_KEPT                   → COMMITMENT_KEPT
PROMISE_BROKEN                 → COMMITMENT_BROKEN
USER_REMEMBERED_SEYEON_DETAIL  → CHARACTER_DETAIL_REMEMBERED
SEYEON_ACCEPTED_HELP           → CARE_ACCEPTED_BY_CHARACTER
SEYEON_REQUESTED_HELP          → CARE_REQUESTED_BY_CHARACTER
SEYEON_SELF_DISCLOSED          → CHARACTER_SELF_DISCLOSURE
SEYEON_ADMITTED_WAITING        → CHARACTER_VULNERABILITY_REVEALED
SPECIALNESS_INVALIDATED        → RELATIONAL_EXPECTATION_INVALIDATED
CONFLICT_EVENT                 → CONFLICT_OPENED
RECONCILIATION_EVENT           → RECONCILIATION
RETURNED_AFTER_ABSENCE         → RETURN_AFTER_ABSENCE
~~~

Character-specific cause/expression metadata uses namespaced `characterBehaviorKey`. Generic relationship semantics remain in the Production registry.

## 7. Deterministic semantic keys and causal binding

The LLM/client never chooses Production dedupe/semantic keys.

Production dedupe material is derived from:

- canonical Subject;
- Se-yeon;
- experimental Event kind;
- server-owned experimental dedupe key.

Payload semantic keys are deterministic hashes of governed Event identity.

For commitment outcomes:

~~~text
experimental PROMISE_MADE
→ Production COMMITMENT_MADE(commitmentKey K)

later experimental PROMISE_KEPT/BROKEN
→ resolve active experimental predecessor
→ resolve its active Production Event by deterministic Production dedupe
→ inherit the exact commitmentKey K
→ causalPredecessorEventIds = [Production COMMITMENT_MADE id]
~~~

Missing/ambiguous Production causal predecessor fails closed.

## 8. Current-turn / next-turn causality

The vertical slice reads relationship state once before the committed turn callback.

~~~text
Turn A reads revision 10
→ Turn A is generated/guarded/committed using revision 10
→ post-turn relationship Event commits revision 11

Turn B
→ reads revision 11
~~~

Revision 11 cannot retroactively change Turn A.

The orchestration result records both:

- `relationshipRevisionUsedForTurn`;
- `relationshipRevisionAfterSync`.

## 9. Relationship sync

`syncSeyeonProductionRelationshipEventV1` is the deterministic post-turn core.

SHADOW:
- Production admission;
- deterministic policy evaluation;
- no write.

WRITE_DARK / BEHAVIOR_SHADOW / LIVE:
- Production admission;
- existing PHASE M `applyProductionRelationshipEventV1`;
- PHASE N idempotency/concurrency semantics remain unchanged.

The Production bridge does not create a separate relationship policy engine.

## 10. Durable fallback

The repository already has the generic `outbox_events` queue. PHASE O reuses it.

A narrow admitted-Event outbox contract is added:

~~~text
event_type = SEYEON_PRODUCTION_RELATIONSHIP_SYNC_REQUESTED
schema     = v1
aggregate  = character_relationship / {subject}:seyeon
dedupe     = Production relationship Event dedupeKey
~~~

Only an already-admitted generic Production Relationship Event may enter this request.

Narrow DB wrappers:

- `cmd_enqueue_seyeon_relationship_sync_v1`
- `cmd_claim_seyeon_relationship_sync_v1`
- `cmd_complete_seyeon_relationship_sync_v1`

reuse the existing generic outbox lease/complete semantics and do not introduce a new retry/backoff/dead-letter policy.

The worker transaction is:

~~~text
claim durable admitted Event
→ load latest serialized relationship revision
→ PHASE M apply/replay
→ complete outbox only after successful relationship commit
~~~

If relationship persistence fails before completion, the processing transaction must roll back; the outbox request is not falsely marked processed.

## 11. Existing chat outbox

`cmd_commit_chat_turn_v1` already atomically emits `CHAT_TURN_COMMITTED`. PHASE O does not restore the retired caller-chosen `p_relationship_effect_jsonb` path.

The 1340 retirement remains intact:

~~~text
caller-provided legacy relationship delta/stage
→ fail closed
~~~

Production relationship mutation uses only the PHASE M/N path.

## 12. Runtime behavior

The existing Se-yeon runtime accepts both:

- experimental relationship semantics — never relationship authority;
- Production relationship semantics — authority only for current stage/condition/behavior-access.

Prompts and runtime validation preserve:

~~~text
Fact / Integrity / Disclosure authority
>
relationship behavior semantics
~~~

A Production relationship overlay may explain why Se-yeon is currently cautious/restricted/warm within allowed authored behavior, but cannot invent a concrete past event or private fact.

## 13. Tests

PHASE O covers:

- stable generic mapping;
- exact guarded assistant message binding;
- server observation source for return;
- deterministic dedupe;
- commitment key/predecessor inheritance;
- missing Production predecessor fail-closed;
- Production read without baseline creation;
- exact revision/stage/policy turn pin;
- conflict restricted behavior;
- repair cautious behavior;
- S4 without disclosure/fact authority;
- SHADOW no-write;
- WRITE_DARK write;
- BEHAVIOR_SHADOW write + behavior-only comparison;
- LIVE Production overlay in the real Se-yeon runtime;
- current-turn R / next-turn R+1 causality;
- durable outbox processor completion only after PHASE M success;
- PostgreSQL read/ACL/conflict/durable-sync flow.

## 14. Non-goals

PHASE O does not add:

- a romance engine;
- user-visible relationship scores;
- arbitrary client-selected relationship mode;
- generic rollout to every Character;
- LLM-selected score/stage/dedupe;
- automatic correction generation;
- a new retry/dead-letter policy;
- restoration of the retired legacy chat relationship mutation path.

## 15. Closure condition

PHASE O is complete when:

1. Production relationship state can be pinned for a Se-yeon turn.
2. The actual governed Se-yeon runtime accepts LIVE Production behavior semantics without gaining fact/disclosure authority.
3. An admitted post-turn Se-yeon Event maps to one generic Production Event and applies only after turn commit.
4. Current-turn state cannot self-retroactively change.
5. Next turn consumes the newly committed relationship revision.
6. Durable sync request applies/replays idempotently through PHASE M/N.
7. Direct API roles cannot bypass the narrow runtime/outbox surfaces.
8. Full repository CI/DB/Governance/DR gates pass.
