# TOPIC-FACE-005C-B — Production Face Character Capability + Perspective

Status: implementation contract  
Tracking: #1338  
Watchtower-Track: topic-face

## 1. Goal

TOPIC-FACE-005C-B adds the first Character-owned decision layer above the already-admitted production Face source.

The sequence is:

```text
TOPIC-FACE-005B
  admitted Face context/ref
        +
TOPIC-FACE-005C-A
  admitted full Face grounding bundle
        |
        v
TOPIC-FACE-005C-B
  Character Face Capability
        |
        v
  ALLOW / DENY
        |
        v
  Character Face Perspective
```

This slice still does not select grounding units or generate Character prose.

## 2. Source authority remains above Character authority

Character capability answers only:

> May this authored Character consume this already-admitted Face source?

It does not create or widen Face authority.

The source repository remains authoritative for:

- Face readiness;
- admitted observation units;
- display values;
- prohibited inference boundaries;
- unavailable sections;
- grounding and bundle identities.

A Character profile cannot turn a blocked Face topic into an available one.

## 3. Face-specific capability taxonomy

The existing generic-looking Character capability gate is Saju-specific in its domain model.

TOPIC-FACE-005C-B therefore does not add Face to the existing Saju domain taxonomy.

The supported production-neutral Face topic registry is:

```text
face.discover.structure
face.discover.extended
```

The supported realization mode is:

```text
neutral_fact_realization
```

`face.reading.three_divisions` is not a supported Character Face capability topic while source authority remains blocked.

## 4. Capability source and profile

The source-backed authoring contract pins:

- capability version;
- characterId;
- Character content version;
- Face profile version;
- allowed production-neutral topic keys;
- allowed realization modes;
- partial-result policy;
- initiation policy.

The runtime capability profile mirrors those authored values.

Candidate admission is exact: Character identity, content/profile versions, topic set/order, mode set/order, partial policy, and initiation policy must match the source authoring.

## 5. Capability runtime decision

Capability is evaluated only after:

- an admitted `CharacterFaceRuntimeContextV1` exists;
- an admitted `CharacterFaceGroundingBundleViewV1` exists;
- the context/ref/bundle identities remain correlated.

Possible denial reasons include:

```text
NO_ADMITTED_FACE_CONTEXT
NO_ADMITTED_FACE_GROUNDING
CHARACTER_ID_MISMATCH
CONTENT_VERSION_MISMATCH
GROUNDING_CONTEXT_MISMATCH
TOPIC_NOT_ALLOWED
MODE_NOT_ALLOWED
PARTIAL_NOT_ALLOWED
```

Commercial entitlement is deliberately not part of semantic capability.

## 6. Perspective is attention, not interpretation

The production Face Perspective contract controls only authored attention order over source capability keys.

The attention registry is:

```text
eye.width_height_ratio
nose.alar_width_and_nostril_geometry
mouth.width_and_relative_size
chin_lower_face.visible_width_ratio
forehead.visible_width_shape
```

Perspective does not contain:

- threshold rules;
- large/small classification;
- personality mapping;
- fate/fortune mapping;
- wealth mapping;
- relationship meaning;
- advice semantics;
- traditional Face promotion.

## 7. Perspective source and profile

The source-backed Perspective authoring pins:

- perspective version;
- characterId;
- Character content version;
- Face profile version;
- attention order;
- max unit count;
- uncertainty handling.

The admitted Perspective additionally pins:

- source grounding projection version;
- Character Face attention registry version;
- deterministic selector safeguards;
- fixed delivery authority references.

The first-slice `maxUnits` contract is 1 through 4.

## 8. Unavailable capabilities

Perspective may contain an authored preference for a known source capability that is currently unavailable, such as the current forehead capability in the partial extended topic.

That preference does not fabricate source availability.

A later selector must skip absent units while preserving the source limitation.

## 9. Deterministic selector safeguards

Perspective requires:

```text
avoidDuplicateCapability = true
preserveSourceOrderForTies = true
```

These are structural safeguards for the next deterministic selector slice.

They do not authorize semantic rewriting.

## 10. Delivery authority

Perspective may reference only existing Character delivery authorities:

```text
speech = published_character_speech
communication = published_character_persona_communication
relationship = active_relationship_projection
```

Relationship state may later change phrasing/delivery, but not Face source truth or Perspective semantic meaning.

## 11. Research-only Face isolation

The existing research Face presentation contract uses modes such as:

```text
strongest_first
contrast_first
detail_first
```

Those research presentation modes are not valid production-neutral Perspective input.

TOPIC-FACE-005C-B keeps:

```text
research Face presentation
!=
production Face Perspective
```

## 12. No named-character production authoring yet

The current working roster includes the Launch display name `세연`, but the working-roster authority explicitly does not establish canonical Character IDs or immutable detailed Character canon.

Therefore this slice intentionally adds:

- generic contracts;
- admission validators;
- engineering fixtures;

and does not create a production `SEYEON_FACE_PERSPECTIVE` or other named-character Face profile.

Named-character Face authoring requires a separately governed Character source.

## 13. Completion criteria

TOPIC-FACE-005C-B is complete when tests prove:

- valid generic Face capability source/profile admits;
- structure yields full capability coverage;
- partial extended yields partial coverage only when authored policy allows it;
- missing/mismatched source context or grounding denies;
- stale Character content/profile identity denies;
- blocked traditional topic cannot enter capability authoring;
- semantic/relationship/Commerce widening rejects;
- valid source-backed Perspective admits;
- alternate authored attention order changes Perspective only;
- unknown/duplicate/empty attention keys reject;
- invalid maxUnits rejects;
- stale Character/Face profile versions reject;
- registry/projection drift rejects;
- semantic/threshold/research presentation widening rejects;
- Capability and Perspective must share the same Character/content/Face profile identity.

## 14. Next slice

TOPIC-FACE-005D owns deterministic selection:

```text
admitted Face context
+ admitted full grounding bundle
+ ALLOW capability decision
+ admitted Face Perspective
        |
        v
deterministic source-unit selection
```

005D may choose/order existing source units. It still must not create new Face semantics.
