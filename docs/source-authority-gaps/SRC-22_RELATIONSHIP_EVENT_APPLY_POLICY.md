# SRC-22 — Relationship Event Apply / Policy Evaluation Authority

> Status: **OPEN / BLOCKING for authoritative Relationship Event score/stage mutation**  
> Domain: Relationship / World  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`

---

## 1. Gap

Primary source defines the Relationship state/ledger shape and an atomic apply **skeleton**:

```text
lock user_character_state
→ dedupe event
→ calculate versioned policy
→ append relationship_event(before=r, after=r+1)
→ update projection r+1
```

It also requires Relationship Engine/server authority rather than LLM/client score mutation, deterministic behavior, duplicate suppression, anti-farming, and reproducible stage unlock behavior.

However the source does **not** define the executable relationship policy needed to calculate the next score/stage projection. Therefore a production-authoritative Relationship Event apply command cannot yet determine its outputs without inventing product semantics or trusting caller-supplied policy results.

This is `SRC-22`.

## 2. What source authority already fixes

### 2.1 Current projection shape

`user_character_states` is the current user-character relationship projection:

```text
subject_id
character_id
closeness
trust
friction
relationship_stage
policy_version
revision
last_interaction_at
created_at / updated_at
```

Source explicitly fixes:

- one current state per `(subject_id, character_id)`;
- scores are server-controlled;
- `revision >= 0`;
- numeric bounds and stage transitions are governed by a versioned relationship policy;
- client cannot write scores directly.

### 2.2 Event ledger shape

`relationship_events` is append-only and defines:

```text
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
```

Structural invariants include:

- unique `(subject_id, character_id, event_dedupe_key)`;
- unique `(subject_id, character_id, state_revision_after)`;
- `state_revision_after = state_revision_before + 1`;
- same-owner/source provenance FKs;
- append-only history;
- event insert and current projection revision update commit atomically under the state-row lock.

### 2.3 Product-level principles

Use Case fixes these behavioral principles:

- Relationship is not one scalar; `closeness`, `trust`, and `friction` are distinct dimensions;
- LLM does not directly change relationship scores;
- Relationship Engine updates state deterministically from events;
- same user action retry must not repeatedly increase scores;
- each Relationship Event has an event identity/idempotency key;
- simple message spam must not farm relationship stages indefinitely;
- transition rules are versioned;
- historical event provenance remains preserved across policy changes;
- inactivity / `IGNORED_CHARACTER` alone must not automatically punish or degrade baseline relationship state;
- relationship degradation requires an explicit story event or actual interaction basis;
- concurrent web/mobile events must preserve a consistent revision chain;
- stage unlock conditions must be reproducible.

The source also lists example event names and a draft relationship-stage sequence. Those examples/drafts are not a complete executable policy table.

## 3. Missing executable policy authority

### 3.1 Normative event registry

Use Case provides **examples** such as:

```text
FIRST_MEETING
RETURN_VISIT
CHOSE_CHARACTER
SHARED_PERSONAL_FACT
COMPLETED_READING
FINISHED_EPISODE
CONFLICT_EVENT
RECONCILIATION_EVENT
IGNORED_CHARACTER
RETURNED_AFTER_ABSENCE
```

It does not define the final normative event allowlist, per-event schema versions, or whether all examples are launch-authoritative event types.

The Pack must not silently convert an example list into a closed product registry.

### 3.2 Event payload schemas

`relationship_events.payload_jsonb` is described as validated, but source does not define a versioned payload schema per event type.

Missing authority includes:

- required/optional payload fields;
- which fields are source facts versus policy-derived values;
- source-turn/world-event/merge-action-specific payload requirements;
- whether a payload-less event is valid for each event type.

### 3.3 Score bounds and event deltas

Source states that numeric bounds are policy-governed, but does not provide exact bounds.

It also does not define the deterministic delta table for each event type:

```text
event_type
→ delta_closeness
→ delta_trust
→ delta_friction
```

Therefore caller-supplied `delta_*` values cannot be treated as authority, and intuitive delta values cannot be hard-coded by implementation.

### 3.4 Stage keys and transition conditions

Use Case labels the stage sequence as a **draft** and allows character-specific presentation names while retaining a common internal model.

Source does not define:

- final internal `relationship_stage` keys;
- exact score/event conditions for each transition;
- whether transitions may skip stages;
- whether negative transitions are allowed and under what explicit events;
- tie/boundary semantics;
- character-specific versus global policy differences;
- whether a stage change may occur without score change or vice versa.

### 3.5 Anti-farming policy

Source requires anti-farming but does not reduce it to an executable rule.

Missing decisions include:

```text
window duration
per-event/per-source caps
cooldown semantics
which events are farmable/non-farmable
whether distinct turns with equivalent actions dedupe
whether episode/reading completion events are one-time per source aggregate
how anti-farming state is derived without inventing new persistence
```

A generic `antiFarmingRuleKey` does not solve this gap unless the source defines the referenced rule semantics.

### 3.6 `last_interaction_at` mutation authority

Source stores `last_interaction_at` but does not define which Relationship Events update it, whether non-relationship chat activity updates it, or whether event `applied_at` is always the correct value.

### 3.7 Policy selection / historical replay authority

Both current state and event rows store `policy_version`, but source does not define:

- how the active policy version is selected for a new event;
- whether an existing state can move to a newer policy version before the next event;
- migration semantics when stage/bounds change;
- whether policy changes can alter current projection without a Relationship Event;
- historical replay behavior when old policy artifacts are unavailable.

## 4. Pack overreach: invented `RelationshipPolicyDefinitionV1`

The current Pack introduced an interface equivalent to:

```text
RelationshipPolicyDefinitionV1
- policyVersion
- contentHash
- scoreBounds
- stages + entryConditions
- events + delta
- antiFarmingRuleKey
```

Primary source does not define this artifact/schema.

More importantly, ERD v0.6 stores only `policy_version` on `user_character_states` and `relationship_events`; it does **not** define a relationship-policy content-hash column or a relationship-policy artifact table.

Therefore requiring `policy_version + contentHash` as durable relationship event provenance would require an ERD/persistence authority not present in source.

The Pack may state the general requirement that policy meaning is versioned and historical provenance must be preserved, but it must not promote a particular policy artifact schema, hash field, registry storage model, or condition DSL as source-backed until source resolves them.

## 5. What implementation must NOT invent

Until `SRC-22` is resolved, do not implement a production-authoritative Relationship Event apply command that silently chooses:

- a final event allowlist from the Use Case example list;
- event payload schemas;
- score bounds;
- event→delta mapping;
- stage keys/thresholds/transition graph;
- anti-farming windows/caps/cooldowns;
- policy selection/migration behavior;
- `last_interaction_at` update semantics;
- relationship-policy content hash persistence;
- caller-supplied `delta_*` or next-stage values as trusted authority.

A database function that accepts already-calculated deltas/stage from the caller would merely relocate the trust boundary; it would not implement the source-required Relationship Engine authority.

## 6. Current safe boundary

Source-complete and enforceable now:

```text
user_character_states relational identity/ownership/revision shape
relationship_events append-only ledger shape
same-owner source provenance FKs
unique event_dedupe_key per user-character
one event per state_revision_after
before/after revision +1 invariant
state-row locking requirement for apply
current relationship projection read
no client direct score mutation
no LLM direct score authority
no inactivity-only automatic degradation
```

Source-complete as an **algorithmic skeleton only**:

```text
lock state
→ dedupe
→ evaluate source-approved versioned policy
→ append event
→ update projection revision
```

Blocked until `SRC-22`:

```text
cmd_apply_relationship_event...
relationship score/stage transition evaluator
relationship anti-farming evaluator
relationship-policy-driven stage unlock decision
```

## 7. Relationship to Character Unlock

UC-13/UC-14 permit relationship progression to unlock dialogue/scenes/episodes/characters, but `SRC-22` only addresses the Relationship Engine side of that decision.

Even after `SRC-22` is resolved, a separate World/Content authority may still be required if the source does not define how a relationship-stage result maps to a concrete unlock target/condition. Implementations must not treat `SRC-22` closure as automatic authority for every Character Unlock condition.

## 8. Required source resolution

Source authority should define at minimum:

1. final relationship event registry and event schema-version rules;
2. versioned payload schema per supported event type;
3. score bounds for closeness/trust/friction;
4. deterministic event→delta rules;
5. internal relationship stage keys and exact transition conditions;
6. anti-farming rules and any required persisted/derived state;
7. `last_interaction_at` update semantics;
8. policy version selection/change/migration semantics;
9. historical policy provenance/replay contract compatible with ERD v0.6, or an explicit ERD change if additional policy artifact/hash persistence is required;
10. deterministic behavior for no-op/blocked events and whether they append ledger rows or return without mutation.

## 9. Verification gate after resolution

At minimum:

- same event retry applies once;
- same key with conflicting event shape is rejected according to the approved identity contract;
- unknown event/schema causes no mutation;
- every supported event computes source-approved deltas;
- score bounds are deterministic at boundaries;
- stage transitions follow the approved versioned rules;
- concurrent same-revision events serialize into one linear revision chain;
- message/action spam cannot farm beyond the approved policy;
- inactivity alone never auto-degrades relationship state;
- explicit negative/conflict events follow approved degradation semantics;
- historical rows retain the policy provenance required by source;
- event ledger + current projection update commit atomically;
- relationship-driven unlock evaluation, where enabled, uses an independently source-approved World/Content condition contract.

## 10. Promotion boundary

```text
Relationship relational schema / current read
→ may remain enabled

Relationship Event authoritative score/stage mutation
→ BLOCKED by SRC-22

relationship-driven downstream unlock
→ SRC-22 + applicable World/Content unlock-condition authority
```

The presence of `relationship_events.delta_*` and `user_character_states` score columns proves representability, not the missing policy function that computes authoritative values.