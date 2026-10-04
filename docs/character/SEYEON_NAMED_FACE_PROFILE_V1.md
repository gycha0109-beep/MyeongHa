# Seyeon Named Face Profile v1

Status: TOPIC-FACE-005I-B

## Purpose

Bind the first named Character to the existing bounded Face Capability / Perspective / Delivery contracts without giving Character semantic authority over Face.

## Source

```text
Seyeon runtime-authority lane
→ Named Character Face authoring source
→ Named Face Profile Registry
```

The profile set is pinned to the exact Seyeon `contentVersion` resolved from the runtime-authority lane.

## Capability

Allowed:

- `face.discover.structure`
- `face.discover.extended`
- `neutral_fact_realization`
- partial Face grounding

Forbidden:

- Character-initiated Face reading
- traditional Face-reading topics
- semantic widening

## Perspective

No reviewed Seyeon source defines a Face morphology preference.

Therefore Seyeon uses the neutral registry order instead of inventing a Character-specific Face preference:

```text
eye.width_height_ratio
nose.alar_width_and_nostril_geometry
mouth.width_and_relative_size
chin_lower_face.visible_width_ratio
forehead.visible_width_shape
```

Selection is bounded to three units.

Uncertainty is stated directly. It is not filled with interpretation.

## Delivery

Seyeon delivery uses only existing code-owned safe options:

- neutralFactStyle: `soft_observation`
- unavailableStyle: `soft`
- reaction: `face_neutral_boundary_soft_v1`
- `activate_next_step` → `face_question_detail_compact_v1`
- `clarify_boundary` → `face_question_detail_plain_v1`

The follow-up strategies must already exist in Seyeon's reviewed Character questioning source.

No Seyeon-specific arbitrary Face sentence is authored.

## Compatibility

Capability, Perspective and Delivery must share exact:

```text
characterId
contentVersion
faceProfileVersion
```

Delivery follow-up strategies must be a subset of the named Character source's preferred question strategies.

Cross-Character or stale combinations fail closed.

## Semantic boundary

This profile may choose:

- which already-admitted neutral Face units to show first;
- how many to show;
- one bounded neutral realization style;
- one code-owned boundary reaction;
- one code-owned follow-up framing.

It may not create:

- morphology classes;
- thresholds;
- personality claims;
- fate / wealth / relationship claims;
- traditional Face interpretations;
- confidence widening;
- arbitrary prose;
- Face-specific Character voice.

Refs #1572, #1570.

Watchtower-Track: topic-face
