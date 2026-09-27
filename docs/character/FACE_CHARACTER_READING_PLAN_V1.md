# TOPIC-FACE-005E — Production Face Character Reading Plan

Status: implementation contract  
Tracking: #1342  
Watchtower-Track: topic-face

## 1. Goal

TOPIC-FACE-005E converts the deterministic Face insight selection into a deterministic Character Reading Plan.

The plan is structural. It decides:

- which selected source unit is realized first;
- which selected source unit expands the reading;
- which authored attention targets must surface as unavailable/not-present notices;
- whether a non-semantic Character reaction beat exists;
- whether an authored general Character follow-up strategy can be scheduled.

It does not generate final prose or new Face meaning.

## 2. Alignment with the Saju Character architecture

The Saju path already uses:

```text
Perspective
-> deterministic selector
-> Reading Plan
-> bounded renderer
-> Semantic Guard
```

Face follows the same authority layering.

The Face Plan Builder, like the Saju Plan Builder, re-runs upstream deterministic selection rather than trusting a caller-authored selection artifact.

The main difference is semantic scope:

- Saju grounding may contain canonical meanings, narrative roles, ambiguity, required companions, and protected disclosures.
- Current production Face grounding contains neutral observation units and source display facts only.

Therefore the Face Reading Plan is intentionally narrower.

## 3. Required upstream inputs

The builder requires:

- admitted Character runtime context with Face grounding identity;
- full source-owned Face grounding bundle;
- Character content version;
- admitted Face capability profile;
- admitted Face Perspective profile.

The builder calls `selectCharacterFaceInsightsV1()` internally, which itself:

- re-admits the full grounding bundle;
- binds selection to the active runtime content version;
- re-evaluates Face capability;
- validates Capability/Perspective compatibility.

## 4. Runtime content-version binding

TOPIC-FACE-005E hardens the 005D selector so:

```text
context.contentVersion
==
characterContentVersion
```

must hold before selection.

A stale or externally substituted Character content version cannot drive a Face plan.

## 5. Reading beat types

Current Face beats are:

```text
neutral_fact_realization
unavailable_notice
character_reaction
follow_up_question
```

### neutral_fact_realization

References exactly one already-selected source unit.

Purpose is deterministic:

- first selected unit -> `lead`;
- later selected units -> `expand`.

No display value or final text is copied into the plan.

### unavailable_notice

Preserves selector attention resolution for:

- `unavailable`;
- `not_present`.

No synthetic source unit is created.

### character_reaction

May be scheduled only when at least one source unit is selected.

It references only the ordered selected source-unit set and carries no text.

### follow_up_question

May be scheduled only when:

- at least one source unit is selected; and
- the active published Character persona has a non-empty preferred question strategy.

The plan records the authored strategy key only. It does not generate question text.

## 6. Beat order

Beat order is deterministic:

```text
1. neutral_fact_realization beats in Character selection order
2. unavailable/not-present notices in Perspective attention order
3. character_reaction when selected units exist
4. follow_up_question when an authored strategy exists
```

## 7. Empty-but-explained plan

A Perspective may point only to a currently unavailable capability.

Example:

```text
Perspective:
  forehead.visible_width_shape

Source:
  forehead unavailable
```

The valid plan is:

```text
selectedUnitIds = []
beats =
  unavailable_notice(forehead, unavailable)
```

No reaction or follow-up beat is scheduled because there is no selected source unit.

## 8. Plan identity

`CharacterFaceReadingPlanV1` pins:

- Character ID;
- Face topic;
- source bundle hash;
- Face capability profile ref + hash;
- Face Perspective profile ref + hash;
- relationship projection ref + hash;
- insight-selection schema version;
- deterministic beats.

The plan ID is content-addressed from this material.

## 9. Relationship authority

Relationship state does not influence source selection.

For the same source/capability/Perspective:

```text
selection = identical
beats = identical
```

when only relationship revision changes.

However the plan identity pins the active relationship projection, so the later renderer can prove under which relationship state the Character delivery was produced.

Therefore relationship can affect downstream delivery but cannot rewrite Face truth.

## 10. Capability and Perspective provenance

The plan stores refs for both Face-specific Character layers because Face has a separate capability contract.

Capability ref pins:

- characterId;
- capabilityVersion;
- sourceContentVersion;
- sourceFaceProfileVersion;
- profileHash.

Perspective ref pins:

- characterId;
- perspectiveVersion;
- sourceContentVersion;
- sourceFaceProfileVersion;
- profileHash.

## 11. Structural invariants

Before return, the builder verifies:

- semantic beat unit order exactly equals `selection.orderedUnitIds`;
- every semantic beat references an admitted selected source unit;
- unavailable/not-present notices exactly preserve selector attention resolution order;
- no unselected source unit is promoted into a semantic beat.

## 12. No semantic widening

The plan does not contain:

- displayValue;
- morphology classification;
- thresholds;
- canonical Face meaning;
- personality inference;
- fate/fortune inference;
- wealth inference;
- relationship interpretation;
- traditional Face promotion;
- final text.

The plan is orchestration, not interpretation.

## 13. No raw biometric payload

The plan does not contain:

- raw image;
- raw landmarks;
- pose matrix;
- face embedding;
- identity template.

Only source-unit and source-bundle identities cross the Character planning boundary.

## 14. Character differentiation

Two Characters can use the same source Face bundle and have:

- identical source bundle hash;
- identical selected source set;
- different `orderedUnitIds`;
- therefore different semantic beat order.

This is Character attention differentiation, not Face semantic mutation.

## 15. Non-scope

TOPIC-FACE-005E does not implement:

- final text realization;
- Face morphology interpretation;
- Character Face bounded renderer;
- Semantic Preservation Guard;
- LLM generation;
- follow-up source re-selection orchestration;
- named-character Face profile authoring;
- DB/API/UI changes.

## 16. Next slice

TOPIC-FACE-005F owns:

```text
Face Reading Plan
+ admitted Face grounding
+ published Character delivery authority
+ active relationship projection
    ->
bounded Face Character utterance
    ->
Face Semantic Preservation Guard
```

005F must still preserve source-neutral Face facts and must fail closed on added classification, traditional promotion, dropped limitation, or unauthored Character framing.
