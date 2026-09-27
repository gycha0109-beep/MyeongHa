# TOPIC-FACE-005F-B — Deterministic Bounded Face Renderer

Status: implementation contract  
Tracking: #1351  
Watchtower-Track: topic-face

## Goal

Render the deterministic Face Reading Plan into visible Character output while preserving production-neutral Face source truth.

## Execution order

```text
Face voice invariant
-> delivery compatibility
-> rebuild Face Reading Plan
-> re-admit full Face grounding
-> bounded beat rendering
-> exact selected-unit coverage
-> content-addressed utterance
```

The renderer does not accept provider-authored visible prose.

## Neutral fact realization

A selected Face observation unit is rendered only when:

- it is selected by the deterministic Reading Plan;
- its source realization policy is `bounded_neutral_fact_render_v1`;
- it has no source qualifier requiring an unauthored visible realization;
- its capability key has a code-owned neutral label.

Source numbers and units are rendered exactly with `String(number)`.

The renderer does not:

- round source values;
- convert ratios to percentages;
- classify values as large/small/high/low;
- infer personality, fate, wealth, or relationship meaning.

## Code-owned labels

Current neutral labels are limited to the production Face attention registry:

- eye width-height ratio;
- nose alar width / visible nostril geometry;
- mouth width / relative size;
- chin-lower-face visible width ratio;
- forehead visible width / shape.

Labels are presentation vocabulary, not semantic claims.

## Bounded styles

The admitted Face delivery profile may select only code-owned neutral fact and unavailable styles.

Example neutral fact surfaces:

```text
plain:
입 너비·상대 크기: 0.61 ratio.

soft_observation:
입 너비·상대 크기는 0.61 ratio로 확인돼요.
```

Both expose the same source value and source identity.

## Composite axes

Axes are rendered in source deterministic order:

```text
axis_key=value unit; axis_key=value unit
```

No source axis is reordered, rounded, classified, or inferred.

## Unavailable / not-present

Reading Plan notices become deterministic neutral notices.

Unavailable attention never creates a synthetic source unit.

## Character framing

Reaction and follow-up segments are resolved only from code-owned safe framing keys admitted by the Face delivery profile.

A planned follow-up with no admitted safe framing binding returns protected fallback.

## Qualifiers

The v1 renderer has no source-approved visible qualifier realization registry.

Therefore any selected source unit with one or more qualifiers returns:

```text
protected_fallback:
qualifier_realization_not_authorized
```

This is intentional fail-closed behavior.

## Utterance identity

`CharacterFaceUtteranceV1` pins:

- renderer/schema version;
- Character;
- Face topic;
- source bundle hash;
- Reading Plan ref;
- delivery-profile ref/hash;
- rendered unit IDs in Character order;
- deterministic segments.

The utterance ID is content-addressed from this material.

## Privacy / metadata

The utterance excludes:

- raw image;
- landmarks;
- pose matrix;
- embedding/identity template;
- relationship state payload;
- Commerce fields;
- provider prompt.

## Next

TOPIC-FACE-005F-C recomputes this renderer output and compares an external/candidate utterance against it in the Face Semantic Preservation Guard.
