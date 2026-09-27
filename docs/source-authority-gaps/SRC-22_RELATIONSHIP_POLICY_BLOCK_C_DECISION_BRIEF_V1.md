# SRC-22 Relationship Policy — Block C Production Event Contract Decision Brief V1

> Track: character-memory  
> Status: **DECISION BRIEF ONLY / BLOCK C REMAINS PENDING**  
> Parent worksheet: SRC-22_RELATIONSHIP_POLICY_OWNER_FREEZE_WORKSHEET_V1.md  
> Evidence inputs: Event Authority V1, experimental Event Ledger V2, Relationship Policy Convergence V3  
> Production mutation: **BLOCKED**

## 0. Purpose

Blocks A and B are owner-frozen. Block C must now decide what an authoritative Production Relationship Event is, which event kinds exist, what provenance each event must carry, and what happens to an authorized event that is later suppressed by relationship policy.

This brief does not approve any Production event kind or schema. It separates:

~~~text
current experimental evidence
!=
Production Event authority
~~~

Every recommendation below remains PENDING until explicit source-owner approval.

## 1. Source-fixed / already demonstrated boundary

The following constraints are not reopened here:

- raw LLM extraction is a candidate only;
- Event Authority must admit an occurrence before relationship policy can consume it;
- user assertion alone cannot create shared-event truth;
- Character output can authorize only the guarded Character utterance/behavior actually observed;
- verified outcome events require their stronger Integrity/authority evidence;
- server-observed conditions require server observation authority;
- Character interpretation is not objective Event fact authority;
- the LLM/client/caller cannot choose Production score deltas, stage changes, or durable relationship truth;
- relationship Event application remains deterministic and idempotent.

Current experimental vocabulary is evidence only:

~~~text
PROMISE_MADE
PROMISE_KEPT
PROMISE_BROKEN
USER_REMEMBERED_SEYEON_DETAIL
SEYEON_ACCEPTED_HELP
SEYEON_REQUESTED_HELP
SEYEON_SELF_DISCLOSED
SEYEON_ADMITTED_WAITING
SPECIALNESS_INVALIDATED
CONFLICT_EVENT
RECONCILIATION_EVENT
RETURNED_AFTER_ABSENCE
~~~

None of those names becomes a Production registry entry merely because it exists in the experimental ledger.

## 2. Recommended registry shape — generic relationship semantics + optional Character behavior key

### Recommendation

Do not make the Production Relationship Engine depend on Se-yeon-prefixed event kinds.

Use two orthogonal identifiers:

~~~text
event_kind
= stable generic relationship semantic

character_behavior_key
= optional namespaced Character-specific behavior/meaning that produced the generic event
~~~

Example:

~~~yaml
event_kind: CHARACTER_VULNERABILITY_REVEALED
character_behavior_key: seyeon.admitted_waiting
~~~

This keeps relationship semantics reusable while preserving character-specific causality.

### Candidate mapping from the current experimental vocabulary

| Experimental evidence kind | Production generic candidate | Character behavior key candidate | Decision state |
|---|---|---|---|
| PROMISE_MADE | COMMITMENT_MADE | null | PENDING |
| PROMISE_KEPT | COMMITMENT_KEPT | null | PENDING |
| PROMISE_BROKEN | COMMITMENT_BROKEN | null | PENDING |
| USER_REMEMBERED_SEYEON_DETAIL | CHARACTER_DETAIL_REMEMBERED | seyeon.detail_remembered | PENDING |
| SEYEON_ACCEPTED_HELP | CARE_ACCEPTED_BY_CHARACTER | seyeon.accepted_help | PENDING |
| SEYEON_REQUESTED_HELP | CARE_REQUESTED_BY_CHARACTER | seyeon.requested_help | PENDING |
| SEYEON_SELF_DISCLOSED | CHARACTER_SELF_DISCLOSURE | seyeon.self_disclosed | PENDING |
| SEYEON_ADMITTED_WAITING | CHARACTER_VULNERABILITY_REVEALED | seyeon.admitted_waiting | PENDING |
| SPECIALNESS_INVALIDATED | RELATIONAL_EXPECTATION_INVALIDATED | seyeon.specialness_invalidated | PENDING |
| CONFLICT_EVENT | CONFLICT_OPENED | optional source-specific key | PENDING |
| RECONCILIATION_EVENT | RECONCILIATION | optional source-specific key | PENDING |
| RETURNED_AFTER_ABSENCE | RETURN_AFTER_ABSENCE | null | PENDING |

### Why this shape is recommended

- prevents a new global Event enum for every character-specific expression;
- lets Character Runtime keep expressive semantics without becoming relationship truth authority;
- gives Block B a stable generic family mapping surface;
- allows a Character to reject unsupported generic event kinds even if another Character uses them.

## 3. D13 — Production Event allowlist recommendation

### Recommended contract

The Production registry should be a positive allowlist keyed by:

~~~text
(event_kind, event_schema_version)
~~~

Each registry entry must define:

~~~yaml
event_kind: stable semantic key
schema_version: positive version key
allowed_authority_evidence: explicit rule
relationship_family: Block B family binding
polarity: positive | negative | neutral | repair
causal_episode_rule: explicit folding rule
milestone_eligibility: explicit boolean/rule
score_effect_policy_ref: server-owned deterministic policy reference
allowed_character_behavior_keys: optional allowlist/predicate
payload_schema_ref: D25 schema
~~~

Unknown event kind or unknown schema version:

~~~text
FAIL CLOSED
→ no Production relationship Event append
→ no relationship-state mutation
~~~

### Generic versus Character-specific boundary

Recommended rule:

~~~text
Generic Event
= meaning can be stated without relying on one Character's personality or prose.

Character behavior key
= Character-specific cause/expression used to establish or interpret the generic occurrence.
~~~

Example:

~~~text
세연이 기다렸다고 인정했다
→ Character-specific behavior

캐릭터가 취약성을 드러냈다
→ generic relationship semantic candidate
~~~

A Character behavior key may constrain admission but may not create fact authority by itself.

## 4. D19 — last_interaction_at recommendation

### Recommended meaning

last_interaction_at should mean:

> the latest server-committed direct user↔character conversational interaction time.

It should **not** mean:

- latest positive relationship Event;
- latest relationship mutation;
- latest background job;
- latest replay/correction;
- latest notification;
- latest time the client claims to have interacted.

### Recommended write triggers

~~~text
successful server-committed user→character turn
or
successful server-committed character→user response belonging to that turn
~~~

Use one deterministic turn-completion timestamp rule in Phase K.

### Non-triggers

~~~text
policy replay
correction/retraction rebuild
anti-farming suppression processing
background projection rebuild
notification delivery
calendar passage
~~~

last_interaction_at must never become an inactivity decay authority.

## 5. D20 — occurred_at recommendation

Production must preserve:

~~~text
occurred_at
!=
applied_at
~~~

Recommended authority:

| Occurrence source | occurred_at authority |
|---|---|
| current conversation event | server timestamp bound to authoritative turn/message |
| guarded Character output | server timestamp of the committed guarded output |
| server-observed condition | server observation timestamp |
| world event | authoritative world-event timestamp |
| correction/retraction command | separate adjustment recorded_at; target event occurred_at is not rewritten |

Caller-provided arbitrary backdating is forbidden.

If future import/migration requires historical occurrence time, that requires a separate explicit import authority.

## 6. D21 — source provenance recommendation

Do not make arbitrary JSON the only provenance.

Recommended logical envelope:

~~~yaml
source:
  source_kind: conversation_turn | world_event | merge_action | server_observation
  source_ref: canonical server-owned identifier
  source_message_refs: []
  authority_refs: []
~~~

Rules:

- source_ref must resolve to an authoritative server-owned source;
- message refs must belong to the bound turn/conversation and correct subject/character;
- authority refs must come from prior authority decisions, not caller strings;
- provenance must survive Event correction/retraction history;
- foreign subject/character provenance is rejected.

Whether this is represented by columns or normalized link rows is an ERD decision, but referential integrity is required.

## 7. D22 — causal / correction / retraction link recommendation

Recommended link vocabulary:

~~~text
CAUSAL_PREDECESSOR
CORRECTS
RETRACTS
~~~

Recommended structural rules:

- no self-link;
- target must exist;
- target must belong to the same subject + character relationship boundary;
- causal predecessor must temporally precede or be part of the same authorized compound occurrence;
- correction target must be active at correction time;
- retraction target must be active at retraction time;
- historical target rows are never rewritten;
- a replacement Event receives a new Event ID;
- correction/retraction operations are themselves idempotent.

Recommended persistence shape:

~~~text
relationship_event_links
(event_id, linked_event_id, link_type)
~~~

or an equivalent referentially constrained representation.

Do not store causal/correction/retraction identity only inside free-form payload JSON.

## 8. D23 — objective facts versus Character interpretation

Recommended Production Event envelope keeps them structurally separate.

~~~yaml
facts:
  # source-backed, schema-validated event facts
  ...

character_interpretation:
  # optional Character-owned interpretation of those facts
  ...
~~~

Authority rule:

~~~text
facts
→ may participate in Event occurrence authority

character_interpretation
→ may affect Character behavior/expression
→ may not authorize or overwrite objective Event facts
~~~

A Character interpretation can be historically meaningful while still being wrong about the objective world.

## 9. D25 — per-Event payload schema recommendation

Do not persist:

~~~text
event_type + arbitrary JSON
~~~

as Production authority.

Recommended registry contract:

~~~text
(event_kind, event_schema_version)
→ exact positive validator
~~~

Each schema defines:

- required/optional fields;
- scalar bounds;
- allowed identifiers;
- allowed provenance references;
- causal-link requirements;
- whether Character interpretation is permitted;
- whether an authority proof type is mandatory;
- canonical dedupe material.

Unknown field handling should be fail-closed for authority-bearing fields. Unknown event kind/schema version is rejected.

The payload validator runs before any Production Event append.

## 10. D26 — authorized but anti-farming-suppressed occurrence

This decision has a real tradeoff.

### Option A — append to relationship_events with zero positive progression effect

~~~text
authorized occurrence
→ relationship_events append
→ effect_disposition = SUPPRESSED_POSITIVE_CREDIT
→ positive score delta = 0
→ no stage advancement
→ history retained
~~~

Advantages:

- one append-only relationship history;
- replay sees that the occurrence really happened;
- Block B Episode Profile can preserve qualitative history.

Cost:

- current source envelope increments relationship revision per applied Event;
- schema needs an explicit effect/suppression disposition.

### Option B — separate authorized occurrence/audit ledger

~~~text
authorized occurrence
→ occurrence/audit ledger

only effectful relationship Event
→ relationship_events
~~~

Advantages:

- relationship_events stays strictly state-effect-oriented.

Costs:

- two ledgers must remain synchronized;
- replay and corrections span both ledgers;
- larger ERD/runtime surface.

### Option C — do not durably record suppressed occurrences

Advantages:

- simplest schema.

Costs:

- loses meaningful occurrence history;
- weakens deterministic replay/audit;
- makes Episode Profile less faithful.

### Recommendation

**Option A** is the preferred candidate.

Reason:

The event really occurred; anti-farming decides its **progression effect**, not its truth. Preserve the occurrence in one append-only history but record the effect disposition explicitly and apply zero positive progression effect.

This recommendation is still PENDING because it changes the Production Event schema/revision semantics and needs source-owner approval.

## 11. Candidate Production Event envelope

If D13/D20/D21/D22/D23/D25/D26 are approved along the recommended line, the logical Production Event contract becomes approximately:

~~~yaml
relationship_event:
  event_id: server_owned
  subject_id: canonical
  character_id: canonical

  event_kind: allowlisted
  event_schema_version: allowlisted
  character_behavior_key: optional_namespaced_key

  occurred_at: authority_bound_occurrence_time
  applied_at: server_commit_time

  source:
    source_kind: allowlisted
    source_ref: canonical
    source_message_refs: referentially_validated
    authority_refs: server_owned

  facts: event_schema_validated
  character_interpretation: optional_separate_projection

  links:
    causal_predecessors: referentially_validated
    correction_target: optional
    retraction_target: optional

  relationship_family: registry_derived_not_caller_supplied
  effect_disposition: APPLIED | SUPPRESSED_POSITIVE_CREDIT | NON_PROGRESSION | NEGATIVE
  score_deltas: deterministic_policy_output_not_caller_supplied
  stage_effect: deterministic_policy_output_not_caller_supplied

  policy_version: server_selected
  dedupe_key: server_derived
  state_revision_before: server_owned
  state_revision_after: server_owned
~~~

The caller/LLM never supplies authoritative:

~~~text
relationship_family
effect_disposition
score_deltas
stage_effect
policy_version
state revision
dedupe authority
~~~

## 12. Block C decision set to present to source owner

For an easy owner decision, Block C can be reduced to six choices:

### C-A — Registry shape

Recommended:

~~~text
generic event_kind
+ optional character_behavior_key
~~~

### C-B — last_interaction_at

Recommended:

~~~text
latest real server-committed direct user↔character turn
not a relationship progression signal
~~~

### C-C — Time/provenance

Recommended:

~~~text
server-authoritative occurred_at
+ referential source/provenance
~~~

### C-D — Event lineage

Recommended:

~~~text
append-only causal/correct/retract links
no historical rewrite
~~~

### C-E — Payload authority

Recommended:

~~~text
versioned positive schema per Event kind
facts separate from Character interpretation
unknown type/schema = fail closed
~~~

### C-F — Suppressed occurrence

Recommended:

~~~text
keep occurrence in relationship_events
effect_disposition = SUPPRESSED_POSITIVE_CREDIT
positive progression effect = 0
~~~

All six remain PENDING until the source owner explicitly accepts, changes, defers, or rejects them.

## 13. Production hold remains

Even if this brief is technically complete:

~~~text
no Production Event registry activation
no relationship_events Production INSERT
no user_character_states mutation
no DB migration
no Production payload validator binding
no SRC-22 closure
~~~

until the source-owner decision is recorded in the parent worksheet.
