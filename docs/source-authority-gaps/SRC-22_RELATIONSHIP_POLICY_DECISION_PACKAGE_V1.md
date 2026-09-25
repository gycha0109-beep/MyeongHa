# SRC-22 Relationship Policy Decision Package V1

> Track: character-memory
> Status: **READY FOR SOURCE-OWNER DECISION / SRC-22 REMAINS OPEN**
> Production mutation: **BLOCKED**
> Evidence baseline: Use Case v2 + DB ERD v0.6 + current repository DDL + Se-yeon Persistence Contract V2 + Candidate B1 calibration
> Decision owner: follow the current SRC-22 disposition for the pending relationship-band / numeric policy decision

---

## 0. Purpose

This package narrows SRC-22 into explicit decisions.

It separates four things that must not be conflated:

~~~text
SOURCE-FIXED
= already supported by approved source / current authority

CALIBRATION-SUPPORTED
= tested candidate with useful evidence, but not authority

ERD-EXTENSION-PROPOSAL
= required by the V2 causal-history target, but not present in ERD v0.6

UNRESOLVED
= cannot be implemented authoritatively without an owner decision
~~~

This document does not promote calibration values into production.

---

## 1. Source-fixed decisions

The following do not require new numeric product invention.

### D01 — Relationship is multi-dimensional

**Disposition: SOURCE-FIXED**

Current product/ERD model uses:

~~~text
closeness
trust
friction
relationship_stage
last_interaction_at
~~~

A single affinity score is not the relationship authority.

### D02 — Relationship mutation is server / Relationship Engine authority

**Disposition: SOURCE-FIXED**

The LLM may propose or extract an Event candidate. It does not directly set:

- closeness;
- trust;
- friction;
- relationship stage.

### D03 — Event application is deterministic and idempotent

**Disposition: SOURCE-FIXED**

The same logical user action/event retry must not repeatedly increase relationship state.

The existing production skeleton remains:

~~~text
lock current state
→ dedupe
→ evaluate versioned policy
→ append event
→ update projection revision
~~~

### D04 — Relationship history is append-only and revisioned

**Disposition: SOURCE-FIXED**

Production authority remains:

~~~text
relationship_events
= append-only relationship ledger / WHY

user_character_states
= current relationship projection / NOW
~~~

Event append and projection update are one atomic transaction.

### D05 — Spam farming is forbidden

**Disposition: SOURCE-FIXED PRINCIPLE / EXECUTABLE RULE UNRESOLVED**

The source requires anti-farming.

The exact window, cap, event-family semantics, and equivalent-action identity are not source-defined.

### D06 — Inactivity alone does not degrade the relationship

**Disposition: SOURCE-FIXED**

Long absence or IGNORED_CHARACTER alone must not automatically punish the relationship.

Negative movement requires explicit story/interaction evidence.

### D07 — Relationship policy is versioned

**Disposition: SOURCE-FIXED PRINCIPLE / STORAGE-REPLAY DETAIL UNRESOLVED**

Policy meaning must be versioned and historical Event provenance retained.

The source does not define a policy artifact registry, content hash persistence, or historical policy executable storage.

---

## 2. Stage model decision

Use Case v2 describes this sequence as a **draft**:

~~~text
첫 만남
→ 낯익은 방문객
→ 단골
→ 마음을 연 사이
→ 특별한 인연
~~~

It also says Character-facing labels may differ while the internal relationship model remains common.

### D08 — Five-stage internal progression

**Disposition: CALIBRATION-SUPPORTED PROPOSAL / OWNER DECISION REQUIRED**

Candidate B1 currently uses implementation labels:

~~~text
S0_FIRST_MEETING
S1_FAMILIAR
S2_REGULAR
S3_OPENED
S4_SPECIAL
~~~

These labels are not promoted source authority.

Decision required:

- approve a five-stage common internal model;
- approve final stable internal keys;
- define whether stages may regress;
- define whether stages may skip;
- define whether unresolved conflict blocks qualification, causes regression, or only affects Character behavior.

### Recommended direction

Retain five ordered internal stages for the first production policy because it matches the source draft and keeps Character-facing naming independent.

Do **not** make stage a direct function of message count or one numeric score.

---

## 3. Candidate B1 numeric calibration

### D09 — Score range

**Disposition: CALIBRATION-SUPPORTED PROPOSAL**

Candidate B1 uses 0..100 for closeness/trust/friction.

This is convenient for calibration but not source-defined.

### D10 — Positive soft-cap

**Disposition: CALIBRATION-SUPPORTED PROPOSAL**

Candidate B1:

| Current score | Positive credit |
|---|---|
| 0..59 | 100% |
| 60..79 | 50%, rounded up |
| 80..99 | 25%, rounded up |
| 100 | 0 |

Purpose:

- prevent rapid saturation;
- preserve differentiation after long use;
- keep later meaningful Events relevant without unbounded growth.

### D11 — Candidate stage gates

**Disposition: CALIBRATION-SUPPORTED PROPOSAL**

| Stage | Candidate B1 gate |
|---|---|
| S0 | default |
| S1 | closeness >= 8, trust >= 4, 2 positive days, 2 evidence families |
| S2 | closeness >= 20, trust >= 12, 5 positive days, 3 evidence families |
| S3 | closeness >= 42, trust >= 30, 12 positive days, 4 evidence families, no unresolved conflict |
| S4 | closeness >= 75, trust >= 65, 40 positive days, 10 positive weeks, 5 evidence families, 3 milestones, no unresolved conflict |

The 10-positive-week S4 requirement was added after sensitivity analysis showed that the first Candidate-B fixture allowed a neighboring five-events/week route to compress S4 into eight weeks.

It is a candidate anti-binge mechanism, not source authority.

### D12 — Candidate pacing evidence

**Disposition: CALIBRATION EVIDENCE**

Current automated assertions:

- ordinary diverse route: 17 weeks is not S4;
- ordinary diverse route: 20 weeks can reach S4;
- four meaningful events/week: 4 weeks is not S4;
- four meaningful events/week: 10 weeks can reach S4;
- five meaningful events/week: 8 weeks is not S4;
- five meaningful events/week: 10 weeks can reach S4;
- low-frequency route: still below S4 after 26 weeks;
- 100 RETURN_VISIT events alone remain S0 with trust 0;
- duplicate source identity is credited once;
- unresolved conflict blocks S3/S4 in the current fixture;
- explicit reconciliation can clear the fixture's conflict block;
- absence alone causes no degradation;
- S4 can be reached without SHARED_PERSONAL_FACT or SEYEON_SELF_DISCLOSED.

The last point is important: personal disclosure is not made a mandatory payment for intimacy progression.

---

## 4. Event registry decision

Use Case v2 calls these **examples**, not a final registry:

~~~text
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
~~~

Se-yeon V2 experiments additionally use candidate Events such as:

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
~~~

### D13 — Production event allowlist

**Disposition: UNRESOLVED**

No experimental Event name is promoted merely because calibration uses it.

Owner decision required:

1. which Use Case examples become launch-authoritative;
2. which Se-yeon experimental Events become generic relationship Events;
3. whether Character-specific Event types are allowed;
4. whether some V2 concepts remain evidence facets rather than top-level Event types.

### Recommended direction

Prefer a small stable generic registry plus typed payload/evidence facets over an ever-growing Character-specific top-level registry.

Reason:

- shared Relationship Engine remains common across Characters;
- Character-conditioned salience can still differ;
- Character interpretation stays separate from objective Event facts;
- event-type explosion is reduced.

This recommendation is architecture guidance, not source authority.

---

## 5. Anti-farming decision

### D14 — Exact source dedupe

**Disposition: SOURCE-FIXED**

Same logical Event retry applies once.

### D15 — Event-family credit window

**Disposition: CALIBRATION-SUPPORTED PROPOSAL**

Candidate B1 uses:

~~~text
max 2 positive credits
per evidence family
per 7-day bucket
~~~

This mechanism is not yet production authority.

### D16 — Evidence diversity

**Disposition: CALIBRATION-SUPPORTED PROPOSAL**

Deep stages require multiple evidence families and milestones.

This directly targets:

~~~text
message volume != intimacy
one repeated action != intimacy
calendar age != intimacy
~~~

### Required owner choice

Approve or replace:

- seven-day bucket semantics;
- two-credit cap;
- family taxonomy;
- milestone taxonomy;
- whether one-time content completions have stronger source-specific dedupe.

---

## 6. Conflict / repair decision

### D17 — Conflict is relationship evidence

**Disposition: SOURCE-FIXED PRINCIPLE**

The source explicitly includes conflict/reconciliation examples and permits relationship degradation only from explicit story/interaction evidence.

### D18 — Unresolved conflict behavior

**Disposition: CALIBRATION-SUPPORTED PROPOSAL / OWNER DECISION REQUIRED**

Candidate B1 blocks S3/S4 qualification while conflict is unresolved.

This must not silently become production stage regression.

Owner must choose among:

A. conflict blocks upward transition but does not lower stored stage;

B. explicit negative Events may lower stage under defined conditions;

C. stage remains stable while friction/conflict state changes Character behavior.

Recommended first-production direction: **A or C**, because stage regression semantics are not currently source-defined and should not be invented from one conflict Event.

---

## 7. last_interaction_at decision

### D19 — Mutation semantics

**Disposition: UNRESOLVED**

The field exists, but source does not say whether it updates on:

- every committed chat turn;
- every accepted relationship Event;
- only meaningful relationship Events;
- world/story Events;
- explicit return/absence Events.

### Recommended direction

Treat conversational activity time and relationship-event time as separate concepts.

Do not use last_interaction_at as an implicit decay trigger.

A production decision should state which authoritative action writes the field.

---

## 8. Causal-history persistence decision

The Se-yeon long-term relationship target requires more than score mutation.

### D20 — Event occurrence time

**Disposition: ERD-EXTENSION-PROPOSAL**

relationship_events currently has applied_at but no occurred_at.

Recommended extension:

~~~text
relationship_events.occurred_at timestamptz
~~~

This separates when the relationship Event happened from when policy application committed.

### D21 — Source-message provenance

**Disposition: ERD-EXTENSION-PROPOSAL**

source_turn_id is insufficient for a causal Event derived from specific messages across a broader interaction.

Recommended normalized relation:

~~~text
relationship_event_message_refs
- event_id
- subject_id
- message_id
- ordinal
~~~

with same-owner provenance constraints.

### D22 — Causal / correction links

**Disposition: ERD-EXTENSION-PROPOSAL**

Recommended normalized relation:

~~~text
relationship_event_links
- event_id
- predecessor_event_id
- subject_id
- character_id
- link_type
- created_at
~~~

Candidate link types:

~~~text
causal_predecessor
corrects
retracts
~~~

Do not hide these IDs only inside arbitrary payload_jsonb as a substitute for referential integrity.

### D23 — Fact versus Character interpretation

**Disposition: V2 ARCHITECTURE REQUIREMENT / PAYLOAD SCHEMA UNRESOLVED**

Objective fact and Character interpretation must remain distinct.

A Character hypothesis must not become canonical user fact.

The exact production payload schema is still unresolved.

---

## 9. Replay / rebuild decision

### D24 — Full projection rebuild

**Disposition: UNRESOLVED**

Current relationship_events can audit revision sequence and stored numeric deltas, but it cannot source-completely rebuild the entire projection from scratch because source does not define:

- authoritative revision-0 baseline;
- per-event stage before/after;
- historical policy artifact availability;
- stage replay semantics.

### Recommended production direction

Prefer **snapshot-assisted Event history** rather than requiring old executable policy code forever.

Candidate extension:

~~~text
relationship_events
+ closeness_before / closeness_after
+ trust_before / trust_after
+ friction_before / friction_after
+ stage_before / stage_after
~~~

The first Event then carries an auditable before-state, while delta columns remain useful for policy output inspection.

This is an ERD proposal, not current authority.

Alternative acceptable resolution:

- source-approved revision-0 baseline;
- historically resolvable versioned policy artifacts;
- deterministic replay contract.

The owner must explicitly choose one replay strategy.

---

## 10. Payload schema decision

### D25 — payload_jsonb

**Disposition: UNRESOLVED**

The ERD says validated/minimized but does not define per-event schemas.

Production policy must define:

- schema version per Event;
- required/optional fields;
- source fact fields;
- Character interpretation fields, if persisted;
- correction/retraction metadata;
- Character-specific evidence facets;
- minimization rules;
- whether a given Event may have null payload.

No caller-defined arbitrary JSON becomes relationship authority.

---

## 11. No-op / blocked Event decision

### D26 — Events rejected by anti-farming or policy

**Disposition: UNRESOLVED**

Need explicit semantics:

A. return no-op and append no relationship Event;

B. append a non-mutating audit Event at a new revision;

C. record rejection in a separate operational/audit channel.

Recommended direction: **A for ordinary duplicate/farming suppression**, with operational observability outside the relationship ledger.

Reason: a ledger row that increments relationship revision despite producing no relationship meaning can itself become farmable/noisy history.

This remains a proposal.

---

## 12. Production policy promotion checklist

SRC-22 may close only when the source owner explicitly approves or replaces all production-critical items below.

| Decision | Current status |
|---|---|
| multi-dimensional relationship | SOURCE-FIXED |
| server/Relationship Engine authority | SOURCE-FIXED |
| idempotent Event apply | SOURCE-FIXED |
| append-only ledger + current projection | SOURCE-FIXED |
| no inactivity-only degradation | SOURCE-FIXED |
| final internal stage keys | UNRESOLVED |
| score bounds | CALIBRATION CANDIDATE |
| event delta table | CALIBRATION CANDIDATE |
| stage thresholds | CALIBRATION CANDIDATE |
| stage regression semantics | UNRESOLVED |
| final event registry | UNRESOLVED |
| payload schemas | UNRESOLVED |
| anti-farming executable rule | CALIBRATION CANDIDATE |
| last_interaction_at writes | UNRESOLVED |
| active policy selection/migration | UNRESOLVED |
| replay/baseline strategy | UNRESOLVED |
| occurred_at extension | ERD PROPOSAL |
| source-message provenance | ERD PROPOSAL |
| causal/correction links | ERD PROPOSAL |
| no-op/blocked-event semantics | UNRESOLVED |

---

## 13. Implementation boundary after this package

Until owner promotion:

~~~text
Se-yeon extraction
→ guarded experimental Event
→ in-memory Event Ledger
→ experimental relationship projection
→ retrieval / behavior dogfood
~~~

is allowed.

This remains forbidden:

~~~text
experimental Event
→ relationship_events INSERT
→ production delta
→ user_character_states mutation
~~~

After owner promotion, implementation order is:

~~~text
approved SRC-22 policy
→ approved ERD extension
→ SQL constraints / append-only guards
→ atomic apply command
→ PostgreSQL adapter
→ replay / correction queries
→ concurrency + retry + anti-farming tests
→ Se-yeon production vertical slice
~~~

---

## 14. Decision request

The source owner should respond to this package by marking D08-D26 as:

~~~text
ACCEPT
ACCEPT_WITH_CHANGE
DEFER
REJECT
~~~

with exact replacement values/contracts where required.

Until then, SRC-22 stays OPEN and the existing experimental_non_production fail-closed guard remains correct.

---

## 15. Sensitivity matrix update

Evidence report:

`docs/character/SEYEON_RELATIONSHIP_POLICY_SENSITIVITY_V0_2.md`

The expanded B1 matrix found:

- **MAJOR:** narrow but meaningful routes dead-end under the five-family deep-stage gate;
- **MAJOR:** fixed seven-day family buckets allow boundary credit amplification;
- **MAJOR / authority gap:** B1 recompute can drop an established S4 to S2 on one unresolved strong conflict;
- **WARNING:** reconciliation can become the fifth family that unlocks S4;
- **WARNING:** repeated reconciliation inflates milestone count even when trust/friction prevent farming;
- **WARNING:** one-year mixed use can saturate closeness/trust at 100.

Two isolated shadow candidates now exist:

~~~text
B2-A
B1 + rolling seven-day family-credit window

B2-B
B1 + slow sustained narrow-route qualification

Combined B2
B2-A + B2-B for comparison only
~~~

B2-A removes the tested Day-7/Day-8 boundary amplification while preserving normally spaced credit.

B2-B lets shared-activity, reliability, reciprocity, and disclosure-heavy routes qualify over a much longer evidence horizon without allowing visit-only interaction to qualify.

These findings do not resolve:

- production stage regression semantics;
- repair/milestone semantics;
- score saturation semantics;
- final Event registry or payload schemas.

SRC-22 remains OPEN.

---

## 16. Relationship semantics experiment

Evidence report:

`docs/character/SEYEON_RELATIONSHIP_SEMANTICS_EXPERIMENT_V0_1.md`

The second sensitivity slice separates concepts that Candidate B1 previously conflated:

~~~text
Event Ledger
= source-backed WHAT happened

Causal Evidence Episode
= which Events belong to one relationship experience

attainedStage
= deepest evidence-backed relationship depth reached

currentCondition
= current conflict / repair condition

behaviorAccess
= Character behavior constraint derived from current condition
~~~

### D27 — Stage depth versus current condition

**Disposition: EXPERIMENTAL SHADOW / OWNER DECISION REQUIRED**

The shadow preserves attained relationship depth while representing unresolved conflict separately.

Example:

~~~text
previous attainedStage = S4_SPECIAL
current numeric/gate candidate = S2_REGULAR
unresolved explicit conflict exists

shadow result:
attainedStage = S4_SPECIAL
currentCondition = OPEN_CONFLICT
behaviorAccess = RESTRICTED_BY_CONFLICT
~~~

This avoids silently rewriting shared relationship history.

It does not authorize permanent non-regression in production.

### D28 — Causal Episode as anti-farming unit

**Disposition: EXPERIMENTAL SHADOW**

Promise creation/outcome and conflict/repair chains are folded into one causal Episode before positive-credit evaluation.

The Episode shadow then applies the rolling seven-day family-credit limit.

This separates:

~~~text
same causal experience repeated/retried
from
different experiences in the same evidence family
~~~

### D29 — Repair milestone semantics

**Disposition: UNRESOLVED / NOW EXPLICITLY TESTABLE**

Repair milestone credit is now an explicit policy option.

The default shadow excludes repair from progression milestones; a comparison mode enables it.

This does not decide that repair is never relationship-significant.

It prevents the experimental harness from silently assuming every reconciliation is an unlimited progression milestone.

### D30 — Saturated coarse scores

**Disposition: EXPERIMENTAL EVIDENCE**

Episode profiles preserve causal differences even when a coarse projection is identical, including family/outcome composition and conflict history.

This weakens the assumption that 100/100 score saturation necessarily destroys all personalization.

Model/runtime dogfood is still required to prove that the Character actually behaves differently from those causal profiles.

### Remaining owner decisions

The experiment does not close:

- stage regression versus attained-depth semantics;
- final current-condition vocabulary;
- B2 8/20/40-week alternate gates;
- repair milestone policy;
- score saturation policy;
- production Episode persistence;
- production Event registry.

SRC-22 remains OPEN.
