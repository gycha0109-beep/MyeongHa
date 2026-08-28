# SRC-23 — Character Unlock Condition / World Event Apply Authority

> Status: **OPEN / BLOCKING for authoritative per-user Character Unlock mutation**  
> Domain: Character / World / Content  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`

---

## 1. Gap

UC-14 fixes the product flow at a high level:

```text
Unlock condition satisfied
→ World Event created
→ Hall silhouette state changes
→ first appearance scene
→ CHARACTER_UNLOCKED event recorded
```

It also provides trigger **examples**:

```text
specific relationship stage
first Reading in a specific domain
episode completion
season event
operator reveal
```

UC-24 says character content includes an `unlock condition`, and UC-25 says episode content may include `unlock reward`.

ERD v0.6 defines the durable envelope:

```text
world_events                # append-only user world ledger
character_unlocks           # current locked/unlocked projection
character_unlocks.source_world_event_id
```

But the source does not define the executable condition/effect contract that determines **which character becomes unlocked from which authoritative condition/event and exactly how that result is applied**.

Therefore the relational model can represent an unlock result, but a production-authoritative evaluator/command cannot safely derive that result yet. This is `SRC-23`.

## 2. What source authority already fixes

### 2.1 World Event ledger envelope

`world_events` defines:

```text
id
subject_id
event_type
event_schema_version
event_dedupe_key
source_turn_id
content_bundle_id
payload_jsonb
occurred_at
```

Source fixes:

- owner isolation;
- unique `(subject_id, event_dedupe_key)`;
- append-only history;
- optional source-turn/content-bundle provenance constraints;
- payload is intended to be validated/minimized rather than arbitrary authority.

### 2.2 Character Unlock projection envelope

`character_unlocks` defines:

```text
subject_id
character_id
status = locked | unlocked
revision
source_world_event_id
unlocked_at
created_at / updated_at
```

Source fixes:

- one current projection per `(subject_id, character_id)`;
- owner + character relational integrity;
- causal World Event, when stored, must belong to the same subject;
- unlocked state requires `unlocked_at`;
- locked state requires `unlocked_at IS NULL`;
- nonnegative revision.

### 2.3 Product behavior

Source fixes that:

- locked/future characters may appear as silhouettes/sealed states;
- unlock is server-verified before finalization;
- relationship progression may lead to new dialogue/scenes/episodes and can participate in character reveal;
- a character definition includes an unlock condition;
- an episode may define an unlock reward;
- content/canon is versioned rather than directly rewritten in operational DB state;
- client direct write must not control relationship/unlock/entitlement authority.

These constrain future implementation but do not define the missing evaluator.

## 3. Missing executable condition authority

### 3.1 Unlock condition schema

Source says character content contains an `unlock condition`, but does not define a versioned positive schema/DSL for it.

Missing decisions include how to encode and validate conditions such as:

```text
relationship stage predicate
first completed Reading in domain X
episode Y completed
season/event eligibility
operator reveal
AND / OR composition
threshold/equality semantics
cross-character references
content-bundle/version references
```

The Pack must not claim `unlock condition schema validation` exists merely because authoring requires a condition concept.

### 3.2 World Event registry / payload schemas

Source defines `event_type + event_schema_version + payload_jsonb` storage but does not define the final World Event type registry or payload schema required for character unlock causality.

In particular, source does not state whether `CHARACTER_UNLOCKED` is itself a `world_events.event_type`, an analytics/domain event emitted after projection mutation, or another named event family. The implementation must not collapse these concepts by assumption.

### 3.3 Condition → target mapping

Source does not define the executable mapping from a satisfied condition/world event to:

```text
target character_id
expected prior unlock state/revision
content bundle/canon version whose condition was evaluated
first-appearance scene identity
additional episode/dialogue rewards
```

A caller-supplied `character_id` plus arbitrary `source_world_event_id` is not sufficient authority to prove the source-approved condition was satisfied.

### 3.4 Multi-source / repeat semantics

Source does not define:

- whether several conditions can independently unlock the same character;
- which causal World Event wins `source_world_event_id` if multiple conditions race;
- replay behavior after already unlocked;
- same condition under a later content bundle;
- unlock condition replacement/migration when content releases change;
- whether an unlock is ever reversible outside destructive account/content lifecycle.

### 3.5 Operator / season authority

`season event` and `operator reveal` are trigger examples, but source does not define:

- operator authorization action/API;
- season identity/calendar authority;
- dedupe identity;
- rollout/cohort scope;
- whether operator reveal creates per-subject World Events or another global operational state.

These must not be inferred from general content release controls.

### 3.6 Relationship composition

A relationship-stage trigger additionally depends on `SRC-22` until the relationship policy can authoritatively compute stage changes.

`SRC-23` is distinct:

```text
SRC-22
→ how Relationship Events compute authoritative relationship score/stage

SRC-23
→ how an authoritative condition/state/event maps to a concrete Character Unlock result
```

Closing one does not close the other.

## 4. Pack overreach

The current `CHARACTER_WORLD_CONTENT_SPEC.md` states that content validation checks an `unlock condition schema`, and its Episode contract treats entry/unlock conditions and reward/unlock as if a bounded executable condition contract already exists.

Primary source requires those **concepts**, but does not define their executable schema.

The Pack may retain authoring slots for unresolved condition/reward data as source-required concepts, but must not:

- invent a condition DSL;
- invent a final World Event registry/payload schema;
- claim arbitrary condition JSON is validated authority;
- implement a generic evaluator whose operator semantics are Pack-created;
- trust caller-supplied unlock target/effect as proof of eligibility.

## 5. What implementation must NOT invent

Until `SRC-23` is resolved, do not promote a production-authoritative command/evaluator that silently chooses:

- character unlock condition schema/DSL;
- World Event registry/payload schema for unlock causality;
- condition→character target mapping;
- first-appearance/reward effect mapping;
- replay/already-unlocked semantics beyond structural no-duplicate state;
- unlock revision/no-op mutation semantics;
- season/operator reveal authority;
- cross-bundle condition migration semantics;
- unlock-specific outbox/event naming semantics.

Do not treat `source_world_event_id` FK validity alone as evidence that the event is authorized to unlock the selected character.

## 6. Current safe boundary

Source-complete and enforceable now:

```text
world_events relational identity / same-owner provenance / append-only envelope
world_events subject-level dedupe uniqueness
character_unlocks one current row per subject-character
locked/unlocked timestamp shape
character_unlocks current projection read
same-subject causal world-event FK
client direct unlock mutation is not authority
content canon includes an unlock-condition concept
UC-14 presentation flow may render stored locked/unlocked state
```

Blocked until `SRC-23`:

```text
character unlock condition evaluator
World Event → concrete character unlock authorization
cmd_unlock_character... as a production-authoritative user-world command
relationship-stage → character unlock mapping
Reading/episode/season/operator → character unlock mapping
first-appearance/reward side-effect evaluator tied to unlock
```

## 7. Required source resolution

Source authority should define at minimum:

1. versioned positive Character Unlock condition schema or another deterministic equivalent;
2. authoritative World Event types/payload schemas used by unlock evaluation;
3. how a condition pins character/content-bundle identity;
4. deterministic condition evaluation semantics, including composition and comparison operators if supported;
5. authoritative condition→character unlock mapping;
6. replay/already-unlocked/concurrent condition behavior and projection revision semantics;
7. content release/bundle migration semantics for existing locked/unlocked users;
8. season/operator reveal authority and subject/cohort scope if those triggers ship;
9. exact relationship-stage composition with `SRC-22`;
10. any first-appearance/reward/outbox event contract required to commit atomically with unlock.

## 8. Verification gate after resolution

At minimum:

- unknown condition schema/operator → no unlock;
- unknown World Event/schema → no unlock;
- forged same-owner but unrelated World Event → no unlock;
- wrong character target → deny;
- wrong/past/future bundle condition according to approved policy → deterministic result;
- unsatisfied condition → projection unchanged;
- satisfied condition → exactly one logical unlock;
- duplicate/replayed trigger → source-approved idempotent result;
- concurrent valid triggers → deterministic one-way projection/revision result;
- relationship-stage trigger uses authoritative `SRC-22` result rather than caller-supplied stage;
- episode/Reading trigger validates authoritative completion provenance;
- operator/season trigger validates approved authority/scope;
- stored unlock state drives Hall silhouette/first-appearance behavior consistently;
- unlock projection + required World/domain/outbox effects commit atomically according to the resolved contract.

## 9. Promotion boundary

```text
World Event / Character Unlock relational schema + stored current read
→ may remain enabled

Character Unlock eligibility/effect mutation
→ BLOCKED by SRC-23

relationship-stage-driven character unlock
→ SRC-22 + SRC-23

episode-driven character unlock
→ SRC-17 where episode transition result is needed + SRC-23
```

The presence of an `unlock condition` authoring concept and a `character_unlocks` projection proves required product shape, not the missing executable authority that connects them.