# Se-yeon Relationship Runtime Overlay v0.1

> Track: character-memory
> Status: EXPERIMENTAL RUNTIME BEHAVIOR OVERLAY
> Source semantics: `seyeon-relationship-state-shadow-v2`
> Production relationship authority: NO
> SRC-22: OPEN
> Production mutation: BLOCKED

## Purpose

This slice lets the governed Se-yeon runtime consume the narrow behavior meaning already produced by the experimental relationship semantics shadow without promoting that shadow into relationship, fact, disclosure, event, or memory authority.

Runtime order remains:

```text
Integrity
→ Disclosure V2
→ Allowed Private Retrieval
→ Experimental Relationship Behavior Overlay
→ Working Context
→ Interpret
→ Action
→ Render
→ Semantic Review
→ Guard
```

The overlay therefore cannot influence private retrieval eligibility.

## Admitted fields

Only these shadow fields enter model-facing runtime context:

- `currentCondition`
  - `STABLE`
  - `OPEN_CONFLICT`
  - `RESOLVED_RECENTLY`
- `behaviorAccess`
  - `STAGE_ALIGNED`
  - `RESTRICTED_BY_CONFLICT`
  - `CAUTIOUS_AFTER_REPAIR`

The runtime overlay carries an explicit authority marker:

```text
experimental_behavior_overlay_not_relationship_authority
```

## Fields deliberately not projected

The following experimental shadow fields do not enter the runtime overlay:

- `attainedStage`
- `currentCandidateStage`
- `unresolvedEpisodeIds`
- `causalEventIds`
- episode counts
- milestone counts
- calibration scores or gates

Raw Episode/Event identifiers are not relationship-history evidence merely because they exist in the experimental shadow.

## Authority invariants

The overlay may shape present behavioral interpretation such as caution, tension, warmth, or distance.

It may not:

- override relationship state or bands;
- unlock Character disclosure;
- create Character facts;
- create shared history;
- create or append relationship Events;
- mutate relationship state;
- append durable Memory.

A relationship baseline must already exist. Experimental semantics cannot create one.

## SRC-22 boundary

This slice does not bind the experimental shadow to a production relationship revision or policy version. No approved freshness/revision-binding policy currently exists for that promotion.

Accordingly this PR does not implement:

- production relationship reducer binding;
- stage promotion/regression policy;
- Candidate B1/B2 promotion;
- anti-farming production numbers;
- production Event registry;
- Event Ledger append;
- durable relationship mutation;
- durable Memory mutation.

The experimental semantics provider remains an internal optional runtime dependency. When absent, the governed Se-yeon runtime behaves without the overlay.

## Next slice

Risk-bearing Action Causality may use the bounded overlay as one input, but must still require authorized current-turn and history evidence. The overlay alone is never sufficient causal proof for jealousy, ownership, pursuit, withdrawal, or private self-disclosure.
