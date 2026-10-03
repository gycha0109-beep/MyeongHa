# Named Character Face Authoring Source v1

Status: TOPIC-FACE-005I-A contract.

## Purpose

Bind a named Character to the Face Character spine without giving Character any Face semantic authority.

The first admitted Character is Seyeon.

## Source chain

```text
reviewed Seyeon Bible / Runtime
→ Character runtime-authority lane
→ deterministic authorityVersion
→ Named Character Face authoring source
```

The Face source resolver does not accept caller-supplied versions or voice objects.

## First binding

```text
characterId: seyeon
contentVersion: exact runtime-authority lane authorityVersion
speech: exact lane speech object
communication: exact lane persona.communication object
questioning: exact lane persona.questioning object
```

Seyeon's current reviewed runtime identity is the action-oriented source admitted by #1568, not the stale calm-reviewer projection.

## Fail-closed behavior

Characters without an admitted runtime-authority lane resolve to no Face authoring source.

At this revision:

```text
seyeon   → admitted
yeoul    → blocked
seorin   → blocked
rahyeon  → blocked
mira     → blocked
taegyeom → blocked
yunho    → blocked
doyun    → blocked
baekheon → blocked
```

Each Character may be admitted later through the same parallel lane contract.

## Semantic boundary

This source contains no:

- morphology classification;
- Face thresholds;
- derived Face claims;
- personality inference;
- fate / wealth / relationship inference;
- traditional Face interpretation;
- arbitrary Face prose;
- Face-specific Character voice.

Those cannot be created by Character authority.

The governed Face source remains the sole Face semantic authority.

## Downstream

005I-B may now author bounded Seyeon:

- Face Capability;
- Face Perspective;
- Face Delivery profile.

Those profiles must pin this exact `characterId + contentVersion` and may only choose from existing code-owned bounded registries.

Refs #1371, #1568.

Watchtower-Track: topic-face
