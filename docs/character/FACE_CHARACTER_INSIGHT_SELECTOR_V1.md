# TOPIC-FACE-005D — Deterministic Production Face Insight Selector

Status: implementation contract  
Tracking: #1340  
Watchtower-Track: topic-face

## 1. Goal

TOPIC-FACE-005D turns already-admitted production-neutral Face grounding into a deterministic Character selection artifact.

The selector decides only:

- which existing source units are used;
- in what Character Perspective order they are presented;
- which source units are omitted;
- why each source unit was selected or omitted;
- how each authored attention key resolved against the active source bundle.

It does not create new Face meaning.

## 2. Required upstream contracts

The selector requires:

- an admitted Character runtime context with Face grounding ref (TOPIC-FACE-005B);
- the full source-owned Face grounding bundle (TOPIC-FACE-005C-A);
- an admitted Character Face capability profile and Face Perspective (TOPIC-FACE-005C-B).

The selector re-admits the grounding bundle against the active Face context and re-evaluates capability inside the selection call.

A caller-provided boolean ALLOW token is not trusted.

## 3. Selection authority

Source authority remains above Character selection authority.

The selector may:

- preserve source unit identities;
- select a source unit;
- omit a source unit;
- order selected units according to authored Character attention;
- report an unavailable or absent attention target.

The selector may not:

- classify morphology;
- infer personality, fate, wealth, or relationship meaning;
- create traditional Face claims;
- strengthen confidence;
- fabricate unavailable capability values;
- mutate source hashes or source facts.

## 4. Deterministic ordering

The source grounding bundle already has a deterministic unit order.

The selector distinguishes:

```text
selectedUnitIds
= selected units in source bundle order

orderedUnitIds
= the same selected set in Character Perspective attention order
```

This lets two Characters order the same source facts differently without changing the source grounding identity.

No randomness, timestamps, request IDs, relationship state, or LLM ranking participate.

## 5. Candidate resolution

Perspective attention keys are traversed in authored order.

For each attention key:

1. Find source units with the same `capabilityKey`.
2. If no source unit exists:
   - source-declared `observation:<attentionKey>` unavailable -> `unavailable`;
   - otherwise -> `not_present`.
3. If source candidates exist but `maxUnits` is exhausted -> omit them with `max_units_exhausted`.
4. Otherwise select the first deterministic source candidate.
5. Additional source units with the same capability key are omitted with `duplicate_capability_omitted`.

Unavailable or not-present attention targets do not consume `maxUnits`.

## 6. Source units not named by Perspective

A source unit whose capability key does not appear in the active Perspective is not auto-selected.

It is omitted with:

```text
not_selected_by_perspective
```

Therefore source-side vocabulary expansion does not automatically widen Character behavior.

## 7. Selection artifact

`CharacterFaceInsightSelectionV1` pins:

- schema version;
- Character ID;
- Face topic key;
- source bundle hash;
- capability version;
- Perspective version;
- full/partial coverage;
- selected source unit IDs;
- Character-ordered unit IDs;
- omitted source unit IDs;
- per-source-unit reasons;
- per-attention-key resolution.

The artifact intentionally does not copy:

- display values;
- qualifiers;
- prohibited extensions;
- semantic claims;
- relationship context;
- Commerce metadata;
- request/session metadata.

Downstream layers resolve selected unit IDs against the already-admitted immutable grounding bundle.

## 8. Selection reasons

Current unit-level reason codes are:

```text
selected_attention_preferred
not_selected_by_perspective
max_units_exhausted
duplicate_capability_omitted
```

Every actual source unit receives exactly one selection-reason record.

## 9. Attention resolutions

Current attention-level statuses are:

```text
selected
omitted_max_units
unavailable
not_present
```

Attention resolution is necessary because a Perspective can name a known capability that has no source unit, especially the currently unavailable forehead capability in the partial extended Face topic.

No synthetic source unit is created for unavailable attention.

## 10. Empty-but-explained selection

An empty selected set is allowed when the Perspective points only to unavailable/not-present source capability keys.

Example:

```text
Perspective:
  forehead.visible_width_shape

Source:
  forehead unavailable

Result:
  selectedUnitIds = []
  attentionResolution = unavailable
```

This is a valid source limitation, not a selector runtime failure.

A later Reading Plan slice owns how that limitation is communicated.

## 11. Capability re-evaluation

Selection fails closed if:

- Face context is missing;
- full grounding fails re-admission;
- capability denies the active source;
- runtime Character/content identity is stale;
- Capability/Perspective authored identities disagree;
- capability contains an unsupported production topic/mode;
- Perspective schema/projection/attention registry is unsupported;
- deterministic selection safeguards are disabled.

A blocked traditional Face topic cannot enter selection.

## 12. Relationship invariance

The selector does not read relationship/world/memory state.

For identical:

- source grounding;
- capability;
- Perspective;
- Character/content identity;

relationship revision changes must produce exactly the same selection artifact.

Relationship projection belongs to later rendering behavior, not truth selection.

## 13. Character differentiation

Two Characters may share the same source grounding and produce different `orderedUnitIds` because their admitted Perspectives differ.

They must still preserve the same:

- sourceResultHash;
- groundingHash;
- bundleHash;
- display values;
- prohibited inference boundaries.

Character individuality changes attention/order, not Face truth.

## 14. Structural invariants

Before returning an artifact, the selector verifies:

```text
selected ∩ omitted = empty
selected ∪ omitted = every source unit
set(orderedUnitIds) = set(selectedUnitIds)
selectionReasons = exactly one record per source unit
attentionResolutions = exactly one record per Perspective attention key
```

Duplicate unit identities in the output fail closed.

## 15. Privacy and metadata

The selector never receives or emits raw Face media/biometric material.

It does not emit:

- raw image;
- raw landmarks;
- pose matrix;
- face embedding;
- identity template.

It also does not emit relationship, price, entitlement, or request metadata.

## 16. Non-scope

TOPIC-FACE-005D does not implement:

- Character Reading Plan;
- final prose;
- bounded renderer;
- LLM prompts;
- semantic preservation guard;
- conversation/follow-up orchestration;
- named-character production authoring;
- DB/API/UI changes.

## 17. Next slice

TOPIC-FACE-005E will consume:

```text
admitted Face grounding bundle
+ CharacterFaceInsightSelectionV1
+ admitted Face Perspective
    ->
Character Face Reading Plan
```

The Reading Plan may structure selected units into beats, but must still not invent Face semantics.
