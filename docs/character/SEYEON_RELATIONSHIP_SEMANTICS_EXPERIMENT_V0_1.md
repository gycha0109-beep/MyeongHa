# Se-yeon Relationship Semantics Experiment v0.1

> Track: character-memory
> Status: **EXPERIMENTAL SHADOW / NOT PRODUCTION AUTHORITY**
> Parent evidence: `SEYEON_RELATIONSHIP_POLICY_SENSITIVITY_V0_2.md`
> SRC-22: **OPEN**
> Production mutation: **BLOCKED**

## 0. Purpose

The previous sensitivity matrix showed that relationship tuning cannot be reduced to changing numeric thresholds.

Three different concepts were being conflated:

~~~text
historical relationship depth
current relationship condition
causal history explaining why the relationship is in that state
~~~

This experiment separates them before any production policy or DB migration.

## 1. Semantic split

### Event Ledger

~~~text
WHAT HAPPENED
~~~

Objective source-backed interaction history remains append-only.

Character interpretation remains separate from objective facts.

### Causal Evidence Episode

~~~text
WHICH EVENTS BELONG TO ONE RELATIONSHIP EXPERIENCE
~~~

Examples:

~~~text
PROMISE_MADE
  -> PROMISE_KEPT

CONFLICT_EVENT
  -> RECONCILIATION_EVENT
~~~

These are not treated as unrelated progression tokens.

### attainedStage

~~~text
DEEPEST EVIDENCE-BACKED RELATIONSHIP DEPTH REACHED
~~~

The shadow does not automatically rewrite historical depth downward because the current relationship is in conflict.

### currentCondition

~~~text
WHAT THE RELATIONSHIP IS GOING THROUGH NOW
~~~

Current shadow values:

~~~text
STABLE
OPEN_CONFLICT
RESOLVED_RECENTLY
~~~

### behaviorAccess

~~~text
HOW CURRENT CONDITION CONSTRAINS CHARACTER BEHAVIOR
~~~

Current shadow values:

~~~text
STAGE_ALIGNED
RESTRICTED_BY_CONFLICT
CAUTIOUS_AFTER_REPAIR
~~~

This is deliberately a behavior overlay, not a production stage mutation rule.

## 2. Episode rules in the shadow

### Commitment episode

~~~text
PROMISE_MADE
  -> PROMISE_KEPT
     = one resolved commitment episode
     = at most one commitment-follow-through milestone opportunity

PROMISE_MADE
  -> PROMISE_BROKEN
     = one open commitment episode
     = conflict-bearing

PROMISE_MADE
  -> PROMISE_BROKEN
  -> RECONCILIATION_EVENT
     = same commitment episode
     = repaired outcome
~~~

### Conflict / repair episode

~~~text
CONFLICT_EVENT
  -> RECONCILIATION_EVENT
  -> RECONCILIATION_EVENT
~~~

remains one causal episode.

Repeated callbacks for the same root conflict therefore do not create multiple independent relationship experiences.

### Fail-closed causal provenance

A causal outcome whose predecessor is missing from supplied active history is rejected by the episode builder.

This prevents a detached `PROMISE_KEPT` or `RECONCILIATION_EVENT` from manufacturing causal meaning.

## 3. Episode-level anti-farming

The shadow combines two different controls.

### Layer 1 — causal folding

Same relationship experience:

~~~text
multiple linked Events
-> one Episode
~~~

### Layer 2 — rolling family window

Different Episodes in the same family:

~~~text
max 2 positive Episode credits
per rolling 7 days
per family
~~~

This preserves the B2-A rolling-window mechanism while moving the credit unit above raw Event count.

The values remain calibration-only.

## 4. Repair milestone semantics

The previous matrix found that repeated repair can inflate milestone count.

The new Episode credit API therefore makes repair milestone credit explicit:

~~~text
default shadow:
repairCountsTowardMilestones = false

comparison shadow:
repairCountsTowardMilestones = true
~~~

This is not a production decision that repair is never meaningful.

It isolates the policy question instead of silently granting every reconciliation an unlimited progression milestone.

## 5. Stage / condition behavior

Example:

~~~text
previous attainedStage = S4_SPECIAL

strong conflict arrives

current candidate score/gate stage = S2_REGULAR
~~~

The semantic shadow becomes:

~~~text
attainedStage = S4_SPECIAL
currentCandidateStage = S2_REGULAR
currentCondition = OPEN_CONFLICT
behaviorAccess = RESTRICTED_BY_CONFLICT
~~~

Meaning:

- the relationship has a deep shared history;
- the relationship is currently damaged;
- normal deep-stage behavior is restricted by the unresolved conflict;
- the historical relationship is not rewritten as if the shared history never happened.

After explicit repair:

~~~text
attainedStage = S4_SPECIAL
currentCondition = RESOLVED_RECENTLY
behaviorAccess = CAUTIOUS_AFTER_REPAIR
~~~

The recent-repair overlay is not cleared by elapsed wall-clock time.

In the current shadow it clears when later meaningful non-conflict relationship evidence becomes the latest Episode.

This avoids both automatic time-based forgiveness and an eternal "recent repair" state.

## 6. B2 route round two

The round-two matrix adds a care-focused route and rechecks:

~~~text
visit-only
shared activity
reliability
reciprocity
care
disclosure-heavy
mixed organic
~~~

The B2 shadow retains two paths:

~~~text
normal diverse route
= prior B1 pacing neighborhood

narrow but meaningful route
= much slower sustained evidence horizon
~~~

The alternate S4 path still requires forty positive weeks in the current calibration fixture.

This remains a candidate number, not authority.

## 7. Saturated-score differentiation

The previous matrix found long-horizon coarse-score saturation.

This experiment therefore checks whether identical coarse state:

~~~text
closeness = 100
trust = 100
~~~

can still preserve different causal relationship profiles.

Example A:

~~~text
many fulfilled commitments
reliability-heavy shared history
~~~

Example B:

~~~text
remembering details
accepting/requesting help
self-disclosure
vulnerability
~~~

The Episode profile preserves:

- family counts;
- outcome counts;
- milestone kinds;
- recent Episode identities;
- unresolved conflict identities.

Therefore score saturation does not automatically imply history collapse.

The remaining product question is whether the runtime uses this causal profile strongly enough to produce materially different Character behavior.

That requires later runtime/model dogfood; this PR does not claim model-level differentiation.

## 8. Explicit non-decisions

This experiment does not authorize:

- final stage keys;
- final stage regression semantics;
- final B2 8/20/40-week gates;
- final 0..100 score semantics;
- repair as or not as a production milestone;
- final Event registry;
- production Episode persistence schema;
- production `relationship_events` mutation;
- production `user_character_states` mutation.

## 9. Next evidence after this experiment

If this semantic split survives CI and deterministic dogfood, the next decision package should compare:

~~~text
A. historical stage regression
B. attained depth + conflict progression lock
C. attained depth + current-condition behavior overlay
~~~

against the same conflict / absence / repair scenarios.

The decision should be made before production persistence is designed around one interpretation of `relationship_stage`.

## 10. Current architecture hypothesis

~~~text
Raw source-backed Events
        |
        v
Causal Evidence Episodes
        |
        +----> relationship evidence / calibration
        |
        v
attainedStage
        +
currentCondition
        |
        v
behaviorAccess
        |
        v
Character Runtime Context
~~~

The intended invariant remains:

> Relationship history explains why the Character behaves differently now; a current conflict does not erase the history that made the relationship deep in the first place.
