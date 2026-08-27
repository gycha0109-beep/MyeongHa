# Face Reading FR-18 — Provider Release & Laterality Attestation v0.1

> Project: MyeongHa
> Scope: FR-16/FR-17 downstream provider evidence hardening
> Authority state: research-only
> Date: 2026-08-27

## 1. Purpose

FR-16 established provider topology evidence and FR-17 established the neutral derivation registry, but production activation remained blocked for two independent reasons:

1. the inspected upstream MediaPipe topology source was not proven release-exact for the published `@mediapipe/tasks-vision@0.10.35` npm artifact;
2. left/right provider symbol naming was not enough to prove the actual capture/selfie mirror transform used before a neutral observation is emitted.

FR-18 makes those two gaps explicit authority contracts instead of allowing either to be inferred from dependency presence or source naming.

## 2. Evidence split

FR-18 stores four distinct evidence classes:

- `consumer_dependency_pin`
  - exact `K_beauty` repository commit and `package.json` blob
  - establishes only that `@mediapipe/tasks-vision` is pinned to `0.10.35`

- `public_package_metadata`
  - public package metadata for `@mediapipe/tasks-vision@0.10.35`
  - establishes package identity and entry points (`vision_bundle.mjs`, `vision.d.ts`)
  - does **not** establish topology bytes

- `upstream_version_bump`
  - MediaPipe commit `9d38d191b060cbfeaeb0c1aa20e47201f032ea35`
  - changes `MEDIAPIPE_FULL_VERSION` from `0.10.34` to `0.10.35`
  - the version file explicitly describes this as the next/currently-in-development version

- `upstream_topology_snapshot`
  - exact `face_landmarks_connections.ts` blob at the same source snapshot
  - blob SHA: `644de9d8c7cd90880d92b2393b4913fa93ace927`
  - confirms the named left/right eye and eyebrow connection sets observed by FR-16

These evidence classes are not interchangeable.

## 3. Critical correction: version bump != published bundle provenance

The 0.10.35 version-bump commit is useful as a source snapshot but is not sufficient authority for the npm package bytes.

Therefore FR-18 fixes:

```text
upstreamVersionSnapshot.snapshotMeaning
= development_version_source_snapshot

releaseExactForPublishedPackage
= false

publishedBundleTopologyEvidenceRef
= null

releaseExactState
= unresolved
```

Forbidden promotion:

```text
development version source snapshot
→ published npm release-exact topology
```

A future promotion requires an exact artifact/provenance chain, such as a trusted published-bundle digest plus an authoritative build/source linkage or equivalent release provenance.

## 4. Laterality authority

The inspected MediaPipe source exports named symbols:

```text
FACE_LANDMARKS_LEFT_EYE
FACE_LANDMARKS_RIGHT_EYE
FACE_LANDMARKS_LEFT_EYEBROW
FACE_LANDMARKS_RIGHT_EYEBROW
```

FR-18 may preserve these provider-side names and their FR-16 neutral consumer slots.

It may **not** infer anatomical side from image-space position.

Forbidden:

```text
x < 0.5 → left anatomical side
x > 0.5 → right anatomical side
```

because capture pipelines may include:

```text
selfie preview mirroring
camera-source orientation transforms
EXIF/orientation normalization
canvas/video frame transforms
front-end display transforms
```

FR-18 therefore fixes:

```text
captureMirrorContractRef = null
captureTransformState = unresolved
imageSpaceXOrderingMayDefineAnatomicalSide = false
productionLateralityBindingAllowed = false
```

A future capture contract must state the canonical orientation and mirror transform applied before the provider adapter emits a neutral observation.

## 5. Provider activation remains blocked

FR-18 v0.1 has no promotion path to production.

```text
providerActivationAllowed = false
productionReady = false
```

Current blockers:

1. published npm 0.10.35 topology bytes are not provenance-attested to the inspected source snapshot;
2. the source snapshot is a development-version snapshot;
3. capture/selfie mirroring is unresolved;
4. image-space x ordering cannot define anatomical side;
5. current `K_beauty` FaceLab runtime still does not establish MediaPipe neutral geometry as its canonical runtime observation authority.

## 6. What FR-18 does not do

FR-18 does not:

- authorize any FR-17 derivation algorithm;
- create a nose polygon;
- collapse disconnected brow chains;
- derive a brow midpoint;
- bind provider coordinates to traditional physiognomy anchors;
- activate FaceLab geometry ingestion;
- claim that the npm 0.10.35 bundle was built from commit `9d38d191...`;
- claim that provider `left/right` names are equivalent to raw image x-order.

## 7. Tests

FR-18 tests require:

- exact FR-16 dependency continuity;
- package metadata remains separate from topology-byte authority;
- development source snapshot remains non-release-exact;
- exact source commit/blob pins;
- all four left/right eye/brow provider symbols remain mapped to their FR-16 slots;
- image-space side inference remains forbidden;
- unresolved mirroring cannot carry a fabricated contract ref;
- hidden provider index material is rejected;
- provider activation cannot be forged open.

## 8. Next step

The next provider/observation work should split again rather than collapsing concerns:

### FR-19A — Published Artifact Provenance

Obtain release-exact evidence for `@mediapipe/tasks-vision@0.10.35` topology bytes or keep that gate permanently unresolved and choose a separately versioned provider contract owned by MyeongHa/Face Observation Core.

### FR-19B — Capture Orientation Contract

Define canonical image orientation and mirror semantics at intake/adapter boundary with deterministic test vectors.

### FR-19C — Neutral Derivation Research

Only after provider/capture authority is adequate should candidate nose/brow derivation algorithms be researched/calibrated. FR-17 remains at zero authorized algorithms until then.

## 9. Final invariant

```text
package dependency
!= runtime geometry authority

version bump source snapshot
!= published bundle provenance

provider symbol name
!= image-space laterality authority

provider topology
!= traditional physiognomy meaning
```
