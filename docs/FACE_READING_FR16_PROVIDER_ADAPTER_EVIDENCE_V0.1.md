# MyeongHa Face Reading — FR-16 Provider Adapter Evidence v0.1

Status: Research-only adapter authority

## Purpose

FR-16 is the first layer where provider-specific topology is allowed.

```text
MediaPipe raw landmarks / connection sets
→ FR-16 provider adapter
→ neutral geometry candidate
→ future FaceLab production-neutral contract
→ FR-15 neutral observation bundle
```

Provider indices are legal only inside this adapter layer. They are not Face Reading semantic anchors and must not appear in FR-15 output.

## Evidence pin

Observed on 2026-08-27:

- `gycha0109-beep/K_beauty` main `81c3b4139efdffc785439da005557dc38a6b4873`
- root dependency `@mediapipe/tasks-vision = 0.10.35`
- `@bejewely/face-contracts` public index still exports synthetic/evaluation-oriented contracts and no production-neutral FaceLab runtime observation schema
- current upstream MediaPipe source exposes named LEFT/RIGHT EYE, LEFT/RIGHT EYEBROW, and NOSE connection sets

The upstream connection-set source checked for FR-16 is a current upstream snapshot, not a release-tag attestation for npm `0.10.35`. Therefore the topology snapshot remains research-only.

## Current mapping state

| Neutral anchor | Provider source | Transform | State |
|---|---|---|---|
| left_eye | FACE_LANDMARKS_LEFT_EYE | convex hull of connection vertices | research_candidate |
| right_eye | FACE_LANDMARKS_RIGHT_EYE | convex hull of connection vertices | research_candidate |
| nose | FACE_LANDMARKS_NOSE | convex hull of connection vertices | research_candidate |
| left_brow | FACE_LANDMARKS_LEFT_EYEBROW | blocked | derivation definition required |
| right_brow | FACE_LANDMARKS_RIGHT_EYEBROW | blocked | derivation definition required |
| brow_midline | both eyebrow sets | blocked | brow dependencies unresolved |

## Brow contract mismatch

MediaPipe's eyebrow connection set contains two disconnected contour chains per eyebrow.
FR-15 currently requires one `curve` per neutral brow.

FR-16 therefore does not invent:

- a centerline,
- a preferred upper/lower contour,
- a bridge between disconnected chains.

A separate neutral brow representation/derivation decision is required.

## Eye and nose research transform

The only executable transform in v0.1 is:

```text
convex_hull_of_connection_vertices
```

It:

1. selects provider vertex indices from the named connection set;
2. consumes normalized provider `x/y`;
3. ignores provider `z` for the static FR-15 2D contract;
4. computes a deterministic convex hull;
5. emits only neutral `region` geometry.

For the nose this is explicitly a neutral envelope. It is not `山根`, `年壽`, `準頭`, `審辨官`, or a fortune claim.

## Determinism

Synthetic numeric adapter vectors verify:

```text
same provider fixture
+ same provider package/topology ref
+ same adapter version
→ same neutral geometry
→ same SHA-256 output fingerprint
```

The fixtures contain only numeric synthetic landmarks; no real face is required.

## Laterality

Current adapter metadata says:

```text
provider_named_left_right_unattested
```

FR-16 preserves MediaPipe's provider naming but has not yet attested anatomical/image laterality against a controlled orientation fixture. Candidate activation remains blocked until that is verified.

## Promotion blockers

The adapter cannot become a production-neutral provider candidate while any of the following remain open:

1. FaceLab production-neutral downstream contract is unpublished.
2. exact `@mediapipe/tasks-vision@0.10.35` topology is not release-attested.
3. provider laterality orientation fixture is not attested.
4. left/right brow neutral derivation is unresolved.
5. brow-midline dependency is unresolved.
6. neutral envelope suitability for downstream measurements is not calibrated.

## Safety boundary

FR-16 adapter definitions may contain provider indices because that is their explicit purpose.
They may not target traditional semantic anchors.

Examples rejected by validation:

```text
mapping anchorRef = shangen
mapping anchorRef = tiancang_pair
mapping anchorRef = left_jianmen
```

The adapter accounts for every FR-14 neutral slot, including blocked slots, so missing support cannot silently look like negative evidence.

## Next

FR-17 should resolve the neutral brow representation mismatch before any FaceLab candidate activation:

```text
provider dual eyebrow contours
→ source-neutral brow representation decision
→ deterministic derivation
→ updated neutral contract or bounded curve derivation
→ test vectors
```

Direct traditional-anchor geometry remains out of scope.