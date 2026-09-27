# TOPIC-FACE-005G — Final Output Guard Integration + Production-Neutral E2E

Status: implementation contract  
Tracking: #1357  
Watchtower-Track: topic-face

## Goal

Connect the governed Face Character semantic path to the existing MyeongHa Character Output Guard without reopening a post-guard prose channel.

## Finalization order

```text
admitted Face runtime
+ full Face grounding
+ capability
+ Perspective
+ delivery profile
+ candidate Face utterance
        ↓
Face Semantic Preservation Guard
        ↓
existing Character Output Guard
        ↓
server-owned Face final material
        ↓
CharacterFaceFinalOutputEnvelopeV1
```

The finalizer recomputes the Semantic Guard decision internally.

A caller cannot submit an already-approved guard verdict.

## Provider-owned final metadata

The Face v1 final renderer draft is deliberately smaller than the generic Character renderer draft.

Allowed:

- `schemaVersion`
- `emotion`
- optional `animationCue`
- `suggestedActions`

Not allowed:

- `framingBefore`
- `framingAfter`
- `memoryProposals`
- `relationshipEventProposals`
- Face prose
- Semantic Guard verdicts

The accepted metadata is still validated by the existing `guardCharacterRendererOutput()`.

Therefore emotion, animation, and action allowlists remain pinned by existing MyeongHa output authority.

## Why Face framing is prohibited here

The bounded Face renderer already owns all visible Face realization, Character reaction, and follow-up question wording before the Semantic Preservation Guard.

Allowing a provider to append generic framing after the Face Guard would create a second unguarded Face-claim channel.

For the production-neutral v1 slice:

```text
post-guard provider prose = prohibited
```

## Side effects

Face morphology must not create durable relationship or memory authority.

Therefore the finalizer mechanically supplies empty arrays for:

- memory proposals;
- relationship-event proposals.

This is not caller-configurable in v1.

## Accepted Face result

When the Semantic Guard accepts the candidate, the final envelope contains only the guard-produced:

- utterance;
- validation evidence;
- guard version.

The candidate is never copied independently.

## Protected fallback

When either the bounded renderer or Semantic Guard falls back, the final output exposes only:

```text
state = protected_fallback
publicReason = face_output_unavailable
```

It does not expose:

- rejected candidate prose;
- internal guard failures;
- renderer fallback reason;
- qualifier details;
- source-authority internals.

## Mixed-product boundary

The first production-neutral slice rejects a runtime carrying both Saju and Face product context.

This prevents accidental cross-domain protected material injection until an explicit governed multi-domain envelope is designed.

## Existing Output Guard invariants

The final dialogue envelope must have:

- no provider framing;
- no memory proposals;
- no relationship-event proposals;
- no protected Saju material;
- no Saju calculation ambiguity.

Suggested actions remain possible only through the existing allowlist.

## Single-Character E2E

The acceptance test closes:

```text
Face grounding bundle
→ runtime grounding admission
→ Face capability
→ Face Perspective
→ deterministic Reading Plan
→ bounded renderer
→ Face Semantic Preservation Guard
→ existing Character Output Guard
→ final Face envelope
```

The E2E also verifies:

- candidate text mutation becomes public fallback;
- rejected candidate prose does not leak;
- post-guard personality/wealth framing is rejected;
- memory/relationship side-effect fields are rejected;
- invalid emotion/animation/action keys are rejected by the existing Output Guard;
- qualifier-driven renderer fallback is sanitized;
- mixed Saju+Face context is rejected;
- biometric/privacy/Commerce/internal-failure payloads are absent;
- identical inputs produce identical final output.

## Next boundary

This slice does not persist the final envelope.

A later slice can add governed Character Face reading artifact persistence / atomic commit / controlled reveal or API/UI transport without changing the semantic authority chain established here.
