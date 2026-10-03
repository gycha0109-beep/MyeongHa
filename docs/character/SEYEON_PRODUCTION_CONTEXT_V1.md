# Se-yeon Production Context V1

> Track: character-memory  
> Phase: **P — Se-yeon Production Context Retrieval**  
> Upstream: PHASE O Se-yeon Production relationship vertical slice + PHASE N relationship reliability

## 1. Purpose

PHASE P removes caller-shaped memory and recent-dialogue authority from the Production Se-yeon turn path.

The governed pre-turn flow is:

~~~text
Production relationship projection R
→ pin relationship revision R
→ read server-authoritative context through R
   - current explicit-grant personal records
   - append-only relationship history through R
   - redaction-aware recent committed dialogue
→ deterministic relationship replay
→ admit only effective active relationship Events
→ fail closed on personal-record schemas not approved by source authority
→ assemble Se-yeon runtime context
→ governed Character turn
→ commit turn
→ post-turn relationship sync may create R+n
→ next turn reads R+n
~~~

An Event created by the current turn never enters that turn's context retroactively.

## 2. Authority boundaries

PHASE P is read-only.

It may:

- read current non-revoked Life Facts and Character Memories with an active explicit grant to Se-yeon;
- read append-only Production relationship history through the exact turn-pinned revision;
- replay that history with the existing PHASE N deterministic replay authority;
- read non-redacted recent dialogue from the owned thread;
- construct a bounded working-context snapshot.

It may not:

- create a Life Fact;
- create a Character Memory;
- create or regrant record access;
- define a new Life Fact or Memory type/schema;
- mutate relationship state;
- create a relationship baseline on read;
- use raw legacy relationship_events as effective shared-history authority;
- turn assistant output or a user assertion into durable truth.

## 3. Personal-record admission and SRC-25

SRC-25 remains OPEN for the positive Life Fact / Character Memory type-schema registry.

Therefore stored JSON is not automatically admitted into the model context.

~~~text
stored + explicit grant
!=
schema-authorized for model context
~~~

The Production projector registry is empty until an exact source-approved
record-kind/type/schema contract exists.

Unknown or unresolved type/schema pairs are recorded as:

~~~text
UNSUPPORTED_SCHEMA
~~~

and are not emitted as SeyeonRetrievedMemoryV2.

Tests may inject an exact server-owned projector to verify the boundary. That
test seam is not a Production registry decision.

## 4. Relationship shared-history admission

The legacy Reader relationship-event query reads pre-PHASE-N relationship_events
and cannot represent correction/retraction semantics.

PHASE P instead reads:

~~~text
relationship_history_entries
+ relationship_event_records
+ relationship_event_adjustments
through revision R
~~~

and passes the serialized append-only history to:

~~~text
replayProductionRelationshipHistoryV1
~~~

Only replay activeEvents are projected to Se-yeon as:

~~~text
kind = relationship_event
claimKind = fact
causalAuthority = authorized_shared_history
~~~

A retracted Event disappears from future context. A corrected Event is replaced
by its authorized replacement.

## 5. Recent dialogue

Recent dialogue reuses the existing owner-scoped, redaction-aware server query.

PHASE P additionally excludes the current user message from recentConversation;
the current user turn is a separate runtime input.

Another Character's message in a Se-yeon context fails closed.

## 6. Turn causality

For a turn pinned to relationship revision R:

~~~text
relationship projection = R
relationship history context = R
~~~

The history reader may serve a historical R even if the relationship has already
advanced to R+1 after the pre-turn binding, but it may never serve a revision
newer than the committed current projection.

The context composer independently verifies:

~~~text
replay.physicalRevision == relationshipRevisionUsedForTurn
~~~

before the snapshot is accepted.

## 7. Production DB authority

PHASE P adds:

~~~text
qry_seyeon_production_personal_record_context_v1
qry_production_relationship_history_runtime_v1
~~~

The personal-record query is SECURITY INVOKER under the canonical Subject-bound
API executor and existing RLS.

The relationship-history query is a narrow SECURITY DEFINER function owned by
the existing NOLOGIN/NOBYPASSRLS relationship runtime owner.

Direct anon/authenticated/service_role execution is denied.

## 8. Activation and rollback

PHASE P adds no durable mutation and no destructive schema change.

The new context vertical slice is an additive server composition seam. Rollback
is therefore routing-level: stop invoking the PHASE P wrapper and return to the
PHASE O turn path. Persisted relationship and personal-record truth is unchanged.

## 9. Completion criteria

- caller-shaped recentMessages/retrievedMemories cannot become Production authority;
- explicit-grant/current personal record read is server-owned;
- unsupported personal-record schemas fail closed;
- relationship context comes from PHASE N append-only history;
- correction and retraction affect subsequent context correctly;
- relationship projection and context history use the same pinned revision;
- the current turn cannot observe its own post-turn relationship Event;
- current user message is not duplicated into recent dialogue;
- direct browser/Supabase API roles cannot execute the new authority functions;
- no Memory/Life Fact write or grant-create authority is introduced;
- required repository CI is green.

Watchtower-Track: character-memory
