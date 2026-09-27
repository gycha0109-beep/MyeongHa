# TOPIC-FACE-005F-C — Face Semantic Preservation Guard

Status: implementation contract  
Tracking: #1353  
Watchtower-Track: topic-face

## Goal

Validate a candidate Character Face utterance against the deterministic bounded renderer and fail closed on any structural or semantic widening.

## Validation model

The guard does not interpret free-form language.

It recomputes the expected utterance from the same governed inputs:

```text
active Face runtime
+ full Face grounding
+ capability
+ Perspective
+ delivery profile
    ->
bounded Face renderer
    ->
expected utterance
```

The candidate is accepted only when it matches the deterministic renderer contract.

## Renderer fallback propagation

If the renderer itself returns protected fallback, for example because a selected source unit contains a qualifier with no source-approved visible realization, the guard cannot accept any candidate.

It returns:

```text
protected_fallback
reason = renderer_protected_fallback
```

## Identity checks

The guard exact-checks:

- utterance schema/version;
- Character ID;
- Face topic;
- source bundle hash;
- Reading Plan ref;
- delivery profile ref/hash;
- rendered source unit IDs.

Cross-source, stale-plan, or stale-delivery identity fails closed.

## Segment checks

Segment count, order, and kind must match the deterministic renderer.

### Neutral facts

The guard validates:

- selected source-unit ref;
- exact bounded text;
- displayFactRef;
- capabilityKey;
- Reading Plan purpose.

Changing a number, unit surface, source fact, capability, or bounded wording fails.

### Unavailable / not-present

An unavailable notice must remain the exact deterministic limitation notice.

Changing its status, attention key, text, or segment kind is treated as unavailable promotion.

### Character framing

Reaction and follow-up segments must preserve:

- selected source-unit refs;
- exact code-owned safe framing text;
- framing key;
- follow-up question strategy.

No provider-authored replacement prose is accepted.

## Added claims

Additional segments or unexpected top-level fields are rejected as added output.

This catches personality, fate, wealth, relationship, and traditional Face assertions structurally without requiring an NLP semantic classifier.

## Failure codes

Current guard failure codes include:

- `STRUCTURE_MISMATCH`
- `ADDED_CLAIM`
- `MISSING_SELECTED_UNIT`
- `UNSELECTED_SOURCE_UNIT`
- `SOURCE_IDENTITY_MISMATCH`
- `NEUTRAL_FACT_TEXT_MISMATCH`
- `DISPLAY_FACT_REF_MISMATCH`
- `CAPABILITY_MISMATCH`
- `DROPPED_QUALIFIER`
- `UNAVAILABLE_PROMOTED`
- `UNAUTHORED_CHARACTER_FRAMING`
- `REALIZATION_POLICY_MISMATCH`
- `VOICE_AUTHORITY_MISMATCH`

Some codes reserve explicit vocabulary for later approved realization support; upstream admission/renderer errors may fail before those codes are materialized.

## Accepted evidence

Accepted output returns evidence pinning:

- exact-neutral-fact validation;
- Character;
- Face topic;
- bundle hash;
- Reading Plan ref;
- delivery profile hash;
- validated unit IDs;
- validated display-fact refs;
- validated unavailable attention keys.

## No repair path

A failed candidate is not rewritten or repaired by an LLM.

```text
candidate mismatch
-> protected_fallback
```

Character expression is sacrificed before Face source truth.

## Privacy

The guard does not receive or emit raw image, landmarks, pose matrices, face embeddings, identity templates, Commerce authority, or provider prompts.

## Completion

With TOPIC-FACE-005F-C, the production-neutral Face Character path reaches:

```text
source admission
-> capability
-> Perspective
-> selector
-> Reading Plan
-> bounded renderer
-> Semantic Preservation Guard
```

The next integration slice may connect the accepted/fallback decision to the existing MyeongHa output envelope/runtime without widening Face semantic authority.
