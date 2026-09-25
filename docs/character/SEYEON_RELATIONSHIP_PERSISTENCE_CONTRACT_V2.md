# Se-yeon Relationship Persistence Contract V2

> Track: character-memory
> Status: **IMPLEMENTATION CONTRACT / PERSISTENCE MUTATION BLOCKED BY SRC-22**
> Scope: Se-yeon V2 vertical slice only
> Source baseline: DB ERD v0.6 + Use Case v2 + current repository DDL + Se-yeon experimental Event/Relationship runtime
> Non-goal: resolving product policy values that source authority has not defined

---

## 0. Decision

The Se-yeon V2 relationship runtime adopts the existing MyeongHa persistence authority instead of creating a parallel production database authority.

~~~text
relationship_events
= production source ledger / WHY

user_character_states
= production current projection / NOW

memory_items + record_access_grants
= durable user-approved recall authority

Se-yeon Event Ledger V2
= experimental runtime evidence model until mapped through an approved persistence policy
~~~

No Se-yeon-private production relationship table is introduced.

The existing production relationship write boundary remains blocked by SRC-22 until the missing relationship policy authority is resolved.

---

## 1. Source-backed invariants

### 1.1 Current projection

user_character_states is the current user-character relationship projection.

Production fields:

~~~text
subject_id
character_id
closeness
trust
friction
relationship_stage
policy_version
revision
last_interaction_at
created_at
updated_at
~~~

Invariants:

- exactly one current row per subject + character;
- scores are server-controlled;
- client/LLM cannot directly mutate score or stage;
- revision >= 0;
- numeric bounds and stage transitions belong to a versioned relationship policy.

### 1.2 Relationship ledger

relationship_events is the append-only ledger that changes the current relationship projection.

Production fields:

~~~text
id
subject_id
character_id
event_type
event_schema_version
event_dedupe_key
source_turn_id
source_world_event_id
source_merge_action_id
delta_closeness
delta_trust
delta_friction
policy_version
state_revision_before
state_revision_after
payload_jsonb
applied_at
~~~

Invariants:

- unique subject + character + event_dedupe_key;
- unique subject + character + state_revision_after;
- state_revision_after = state_revision_before + 1;
- source ownership is constrained by composite FKs where source columns exist;
- historical rows are append-only;
- the state row is locked before applying an event;
- ledger append and projection update commit atomically.

### 1.3 Product behavior

Source already requires:

- relationship is not a single affinity scalar;
- Relationship Engine, not the LLM, deterministically updates relationship state;
- retry of the same user action must not farm score;
- relationship transitions are versioned;
- historical event provenance survives policy changes;
- inactivity alone must not punish/degrade relationship state;
- explicit story/interaction evidence is required for relationship degradation;
- concurrent relationship writes must preserve a linear revision chain.

---

## 2. Se-yeon V2 logical model → current physical schema

| Se-yeon V2 concept | Current production target | Mapping status |
|---|---|---|
| eventId | relationship_events.id | representable |
| subject identity | subject_id | source-backed |
| characterId = seyeon | character_id | source-backed |
| eventKind | event_type | **blocked registry** |
| Event schema version | event_schema_version | representable, exact schemas blocked |
| dedupeKey | event_dedupe_key | source-backed |
| sourceTurnId | source_turn_id | source-backed |
| source world event | source_world_event_id | source-backed where applicable |
| source merge action | source_merge_action_id | source-backed where applicable |
| policy result | delta_closeness/trust/friction | **blocked by SRC-22** |
| policy provenance | policy_version | source-backed field; selection semantics blocked |
| revision chain | state_revision_before/after | source-backed |
| current projection | user_character_states | source-backed |
| Event occurredAt | no dedicated relationship-event column | **physical gap** |
| sourceMessageRefs | no relationship-event message-ref column/table | **physical gap** |
| objective facts | only possible via undefined payload_jsonb schema | **blocked payload schema** |
| characterInterpretation | only possible via undefined payload_jsonb schema | **blocked payload schema** |
| salience/confidence | no dedicated columns | experimental only |
| causalPredecessorEventIds | no FK-backed edge representation | **physical gap** |
| correction/retraction target | no explicit event-link representation | **physical gap** |
| evidence facets | no production columns | experimental derived runtime only |
| conflict/repair facet | no production columns | experimental derived runtime only |

The current schema can represent the legacy relationship ledger/projection skeleton, but it cannot yet persist the full Se-yeon V2 causal Event contract without either an approved payload schema or an ERD extension.

---

## 3. Authority separation

### 3.1 Objective Event facts

Objective facts must be source-grounded. A Character interpretation must never be promoted to an objective user fact.

### 3.2 Character interpretation

Se-yeon's interpretation is Character-owned perspective, not user truth. It may be wrong, revised, or contradicted later without corrupting objective history.

### 3.3 Memory

A relationship Event is not automatically a memory_item.

~~~text
relationship event
→ shared relationship history

memory item
→ durable user-approved recall record
~~~

No automatic Event → Memory Item duplication.

### 3.4 Working Context

Persistence eligibility does not imply prompt inclusion. Retrieval remains bounded and relevance-filtered.

---

## 4. Production write transaction contract

Once SRC-22 is resolved, the authoritative apply command must have this shape:

~~~text
BEGIN

1. validate canonical subject + character
2. lock user_character_states(subject_id, character_id) FOR UPDATE
3. check event identity / dedupe
4. reject same dedupe key with conflicting identity
5. validate event type + schema against approved policy
6. validate source provenance
7. evaluate approved deterministic relationship policy
8. calculate score/stage result server-side
9. append relationship_events at revision N -> N+1
10. persist approved causal/amendment links
11. update user_character_states to revision N+1
12. enqueue approved downstream outbox effects if any

COMMIT
~~~

Event append without projection update, or projection update without Event append, is forbidden. They must both succeed or both roll back.

Caller-supplied delta values, next stage, or relationship score are never authoritative input.

---

## 5. Idempotency and concurrency

### 5.1 Retry

Same logical event identity is scoped by subject + character + event_dedupe_key.

- same key + same canonical event identity → replay existing result / no second mutation;
- same key + conflicting event shape → reject.

### 5.2 Concurrent writers

All authoritative relationship mutations serialize through the current state row lock.

~~~text
revision 14
  writer A -> 15
  writer B waits
  writer B -> 16
~~~

Two different events may never occupy the same state_revision_after.

---

## 6. Causality contract

The Se-yeon V2 runtime requires explicit causal history.

~~~text
PROMISE_MADE
    ↓
PROMISE_KEPT

SPECIALNESS_INVALIDATED
    ↓
RECONCILIATION_EVENT
~~~

The current physical schema has no FK-backed representation for these edges.

### 6.1 Target physical design — PROPOSAL, not yet migration authority

Preferred target:

~~~text
relationship_event_links
- event_id
- predecessor_event_id
- subject_id
- character_id
- link_type
- created_at
~~~

Candidate link_type semantics:

~~~text
causal_predecessor
corrects
retracts
~~~

Required relational invariant:

- both sides belong to the same subject + character;
- a row cannot link an Event to itself;
- duplicate links are rejected;
- links are append-only;
- cross-character private relationship causality is rejected.

This requires an ERD authority change because DB ERD v0.6 fixes a 59-table catalog and does not define this table.

### 6.2 Rejected shortcut

Do not silently store causal IDs only inside unvalidated payload_jsonb. That would lose FK integrity and would invent the payload schema currently blocked by SRC-22.

---

## 7. Correction / retraction contract

Historical Event rows are not updated in place.

Target logical behavior:

~~~text
original Event
   ↓
correction or retraction Event
   ↓
explicit event link
   ↓
active-history view excludes superseded/retracted meaning
~~~

Correction must preserve the original Event, correction source, replacement meaning where applicable, audit chain, and projection impact.

Retraction must preserve the original Event, retraction source/reason, audit chain, and removal from active relationship evidence.

The exact production event types/payload schemas remain blocked by SRC-22.

---

## 8. Replay / rebuild contract

### 8.1 Target invariant

A projection must be auditable from relationship history.

~~~text
active relationship history
+ historical policy provenance
+ authoritative revision-0 baseline
→ deterministic projection rebuild
~~~

### 8.2 Current physical limitation

The current ERD does not define:

- authoritative revision-0 values for closeness/trust/friction/stage;
- stage-before/stage-after on each relationship Event;
- a durable relationship policy artifact/hash registry;
- historical policy replay semantics.

Therefore a claim that the current relationship_events table can fully rebuild user_character_states from scratch would be false.

Current schema supports revision-chain audit, stored score deltas, policy-version labels, and current projection read. It does not yet source-completely support full historical stage replay.

### 8.3 Required authority decision

Before production rebuild/replay is implemented, SRC-22 or a successor decision must define one of:

A. versioned revision-0 baseline + historically resolvable policy artifacts; or

B. sufficient per-event before/after projection snapshot fields, including stage; or

C. another explicit source-approved replay contract.

No implementation chooses among A/B/C silently.

---

## 9. last_interaction_at

No production write rule is implemented yet.

The field exists, but source does not define whether it changes on every chat turn, only meaningful relationship Event, only applied Event, world/story events, or explicit return/absence Event.

Until source resolution, Se-yeon V2 must not infer relationship degradation or progression from this timestamp.

---

## 10. Experimental Se-yeon evidence projection

The current experimental V2 reducer has:

~~~text
familiarity
trust
reciprocity
disclosure
agencyRespect
conflictState
repairState
~~~

These are **not** new production DB authority fields.

They are experimental evidence used to test causal retention, conflict persistence, repair behavior, character-specific salience, long-horizon retrieval, and no turn-count intimacy progression.

Current experimental numeric effects are calibration fixtures, not approved mappings to production closeness/trust/friction/stage.

No PostgreSQL adapter may treat them as canonical relationship scores.

---

## 11. Persistence ports

Until SRC-22 closure, the production-safe boundary is:

### Read

Allowed:

~~~text
qry_character_relationship_v1
→ current production projection
~~~

Allowed:

~~~text
approved character record context
→ life_facts / memory_items with active grants
~~~

Experimental-only:

~~~text
Se-yeon Event Ledger V2
→ in-memory/test evidence + retrieval
~~~

### Write

Allowed production relationship mutation from Se-yeon V2: **none** until the approved apply policy exists.

The post-turn V2 runtime may produce a guarded experimental Event candidate, but it must not be bound to a production relationship_events INSERT or user_character_states UPDATE yet.

---

## 12. Migration plan

### Phase P0 — contract freeze

- freeze this mapping;
- keep Se-yeon V2 persistence in-memory/test-only;
- add negative tests preventing accidental production mutation binding;
- retain existing production relationship read.

### Phase P1 — source decision

Resolve SRC-22:

1. normative event registry;
2. event payload schemas;
3. score bounds;
4. deterministic event deltas;
5. stage keys/transitions;
6. anti-farming;
7. last_interaction_at;
8. policy selection/migration;
9. replay/baseline;
10. no-op/blocked-event semantics.

Additionally resolve the V2 physical gaps:

11. source-message provenance;
12. occurred-at semantics;
13. causal/amendment link persistence.

### Phase P2 — DDL

Only after P1:

- apply approved ERD extension;
- add required constraints/FKs/indexes;
- add append-only mutation guards;
- add authoritative apply command;
- add active-history/replay query where approved.

### Phase P3 — PostgreSQL adapter

Replace the in-memory Event Ledger port with a PostgreSQL implementation behind the same post-turn runtime boundary.

### Phase P4 — verification

Required gates:

- duplicate retry applies once;
- conflicting dedupe shape rejects;
- unknown event/schema mutates nothing;
- concurrent writes create a linear revision chain;
- event + projection are atomic;
- LLM cannot supply score/stage authority;
- cross-character causal links reject;
- correction/retraction preserve history;
- inactivity alone does not degrade relationship;
- projection read remains compatible with existing API;
- long-horizon retrieval remains bounded.

---

## 13. Explicit prohibitions

Do not:

1. create a parallel Se-yeon production relationship authority;
2. promote experimental R15 Event names into the canonical DB registry without source approval;
3. map experimental evidence scores directly into production score deltas;
4. trust LLM/caller-supplied deltas or next stage;
5. hide causal IDs inside arbitrary JSON as a substitute for an approved relational contract;
6. mutate old Event rows for correction/retraction;
7. duplicate every relationship Event into memory_items;
8. use turn count as relationship progression;
9. use inactivity as automatic relationship punishment;
10. claim full ledger replay is production-complete before baseline/stage/policy replay authority exists.

---

## 14. Implementation gate

The next safe code change is **not** a relationship mutation migration.

The next safe implementation slice is:

~~~text
Persistence Contract
→ accidental-production-write negative guard/test
→ source decision for SRC-22 + V2 physical gaps
→ DDL
→ atomic apply command
→ PostgreSQL adapter
~~~

This keeps the Se-yeon vertical slice moving without converting experimental relationship semantics into production authority by accident.
