# Seyeon Bible / Runtime v0.2 / v0.1 Authority Decision

Status: **APPROVED FOR SEYEON RUNTIME-AUTHORITY LANE**

Decision date: 2026-10-03

Scope: first Character instance in the parallel Character authority architecture.

## Decision

Seyeon is the first Character whose reviewed Bible and Runtime are admitted into the Character runtime-authority lane.

The repository must use the reviewed Seyeon direction in #1463 and must not continue using the stale main projection that described Seyeon as a calm/balanced reviewer.

This approval does not make the other eight Characters ready. Each Character must enter its own lane independently.

## Exact reviewed source

Reviewed source commit:

```text
a0afd9bda57ae0a3f48396d9b55a651403bbcc41
```

Seyeon Bible:

```text
docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md
blob de6cef1a86d690f7d614967707fe953471792123
```

Seyeon Runtime:

```text
docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md
blob fcaa41f08a04ac66942609a5023fa6f69e9896a0
```

Reviewed typed runtime projection:

```text
packages/character-content/src/runtime-authoring-v1.ts
blob e65806207dd78a0cc817ffcf7f51be8bf4e47ab3
```

## Runtime identity admitted by this decision

The admitted Seyeon runtime direction includes:

- bright, action-oriented, practical companion;
- proactive but user-choice-preserving behavior;
- light teasing / small competitive energy without collapsing into caricature;
- practical care rather than endless emotional analysis;
- explicit evidence and memory boundaries;
- friendly interaction does not imply unlimited private disclosure;
- important boundaries become shorter and more direct;
- Seyeon's reviewed speech, communication, questioning, behavior, and relationship modes remain one shared Character identity across product surfaces.

The exact typed values are the reviewed Seyeon projection from the source commit above. This decision does not paraphrase those values into a second competing runtime source.

## Version rule

The runtime-authority lane does not invent a manually assigned Production content version.

Its `authorityVersion` is deterministically derived from:

```text
lane schema version
+ exact Character id
+ exact source provenance
+ exact typed runtime payload
→ sha256:v1:<64 hex>
```

Any source or runtime payload change therefore produces a different authority version.

## Explicit non-authority

This decision does **not** approve or fabricate:

- unresolved Principle / Calling / oath values;
- unknown World-dependent facts;
- visual asset refs, emotion IDs, animation cue IDs, or asset manifest;
- exact-nine aggregate Character launch readiness;
- relationship state mutation policy;
- Face morphology or Face interpretation semantics;
- Face-specific Character voice;
- Saju semantic authority.

Full presentation publication remains a separate per-Character lane.

## Face boundary

Face may later bind to this Seyeon runtime-authority lane only for Character identity, attention/delivery, speech, communication, and bounded questioning.

Face semantic truth remains owned by the governed Face source.

Refs #1567, #1371, #1463.

Watchtower-Track: topic-face
