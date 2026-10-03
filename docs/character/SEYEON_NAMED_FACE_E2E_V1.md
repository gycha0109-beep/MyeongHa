# Seyeon Named Face E2E v1

Status: TOPIC-FACE-005I-C verification contract.

## Purpose

Verify that the first real named Character can traverse the complete production-neutral Face lifecycle without creating new Face semantics.

## Authority used

Character-side authority is real repository authority:

```text
Seyeon reviewed Bible / Runtime
→ Seyeon runtime-authority lane
→ Seyeon named Face authoring source
→ Seyeon named Capability / Perspective / Delivery
```

The E2E does not recreate local copies of Seyeon's Character profiles.

## Face source fixture

The test uses governed synthetic neutral Face observations so semantic preservation can be asserted deterministically.

Representative source values include:

```text
eye.width_height_ratio = 2.14 ratio
nose.alar_width_ratio = 0.31001 ratio
nose.nostril_visibility_angle = 12.3456 degree
mouth.width_and_relative_size = 0.61 ratio
```

These values must survive the Character path without percentage conversion, morphology classification, or traditional/personality inference.

## Full path

```text
named Seyeon authority
→ admitted governed Face grounding
→ Face-bearing Character runtime context
→ named Seyeon Face profiles
→ bounded neutral renderer
→ semantic preservation guard
→ Character output guard
→ final output envelope
→ immutable reading artifact
→ atomic commit
→ receipt verification
→ controlled reveal
```

## Presentation fixture boundary

The E2E needs a renderer allowlist to exercise the existing Character output guard.

The test-only:

```text
emotion = neutral
animationCue = idle
```

allowlist is **not** Character publication authority and does not approve or fabricate Seyeon visual assets, emotion catalogs, animation assets, asset manifests, or full presentation publication.

Those remain governed by the separate per-Character full presentation publication lane.

## Required invariants

- `characterId = seyeon`
- Character content version equals the exact runtime-authority version
- Face voice authority reuses exact Seyeon speech and communication object identity
- source hashes remain unchanged
- source numeric values and units remain unchanged
- semantic widening fails closed before commit
- source qualifier widening fails closed before commit
- fallback is reveal-forbidden
- successful delivery requires atomic commit first
- same turn + same artifact is idempotent
- same turn + different artifact is rejected

## Explicitly forbidden results

The source fact:

```text
mouth.width_and_relative_size = 0.61 ratio
```

must not become:

```text
61%
입이 넓다
사교적이다
재물운이 좋다
연애운이 좋다
```

or any equivalent morphology/personality/fate/wealth/relationship claim.

Refs #1575, #1573.

Watchtower-Track: topic-face