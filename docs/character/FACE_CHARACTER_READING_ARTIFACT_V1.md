# TOPIC-FACE-005H-A — Immutable Character Face Reading Artifact

Status: implementation contract  
Tracking: #1360  
Watchtower-Track: topic-face

## Goal

Promote an accepted production-neutral Face final output into an immutable, content-addressed Character Face reading artifact candidate.

## Trust boundary

The artifact builder does not accept a caller-provided final envelope as authority.

It re-runs:

```text
Face candidate utterance
+ final renderer metadata
+ admitted runtime / grounding
+ capability / Perspective / delivery
    ->
finalizeCharacterFaceOutputV1()
```

Only a recomputed accepted final output can produce an artifact candidate.

## Artifact identity

The artifact pins:

- Character ID and content version;
- Face topic;
- sourceResultHash;
- projectionHash;
- groundingHash;
- displayFactsHash;
- bundleHash;
- capability profile ref/hash;
- Perspective profile ref/hash;
- Reading Plan ref;
- delivery profile ref/hash;
- renderer version;
- Semantic Guard version;
- Output Guard version;
- Face finalizer version;
- final output hash;
- accepted final output.

`artifactId` is content-addressed from this complete immutable material.

## Lifecycle state

Every candidate is created as:

```text
commitState = requires_atomic_commit
revealState = forbidden_before_commit
```

A candidate is not user-visible authority.

## Fallback

If the recomputed final output is protected fallback, the artifact builder returns only:

```text
mode = protected_fallback
publicReason = face_output_unavailable
revealState = forbidden
```

No artifact is produced and no internal Guard/renderer failure detail is surfaced.

## Sidecar identity

The Character Face artifact is downstream of the existing Face product result.

It must not alter the original Face result/snapshot identity.

## Privacy

The artifact excludes raw image/video, landmarks, pose matrices, embeddings, identity templates, high-resolution crops, provider/request metadata, Commerce authority, and raw relationship state payloads.

## Next

TOPIC-FACE-005H-B will add the atomic commit port and receipt contract. Reveal remains forbidden until that commit succeeds.
