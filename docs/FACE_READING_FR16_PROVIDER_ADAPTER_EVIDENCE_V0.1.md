# MyeongHa Face Reading — FR-16 Provider Adapter Evidence v0.2

Status: **Research-only evidence / derivation contract**

## 1. Purpose

FR-16 is the first MyeongHa Face Reading layer allowed to describe provider-specific face topology.

```text
Provider-specific topology evidence
→ FR-16 evidence / derivation contract
→ provider-neutral geometry candidate
→ future production-neutral FaceLab contract
→ FR-15 neutral observation bundle
```

FR-16 is **not** a production FaceLab adapter and is not a physiognomy semantic layer.

Provider landmark indices, mesh topology, provider names, or raw `z` coordinates must not leak into FR-15 neutral output or into traditional anchors such as `山根`, `天倉`, or `奸門`.

## 2. Evidence pins

Observed and pinned on 2026-08-27:

### K_beauty consumer dependency evidence

```text
repository        = gycha0109-beep/K_beauty
commit            = 81c3b4139efdffc785439da005557dc38a6b4873
package.json blob = 4cd6b7f65223857505578fcb8ca27a033e8361b6
dependency        = @mediapipe/tasks-vision@0.10.35
```

The current `@bejewely/face-contracts` public surface still exposes evaluation/synthetic contracts rather than a stable production-neutral runtime observation contract.

Therefore the merged FR-14 state remains correct:

```text
providerContractVersion = null
activationState = blocked
```

### Upstream topology structure witness

```text
repository = google-ai-edge/mediapipe
path       = mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts
latest commit touching that path = 30590fe8d3fdc57e63a0e9c5b2c0ececffb37301
```

This upstream source is used only as a **structure witness**.

It is not evidence that npm release `@mediapipe/tasks-vision@0.10.35` ships byte-identical connection arrays.

```text
upstream master structure witness
!=
release-exact package topology attestation
```

## 3. Structural topology review

The provider connection sets have materially different graph structures.

| Neutral target | Provider symbol | Observed graph class | FR-16 state |
|---|---|---|---|
| left eye region | `FACE_LANDMARKS_LEFT_EYE` | one closed cycle | research candidate only |
| right eye region | `FACE_LANDMARKS_RIGHT_EYE` | one closed cycle | research candidate only |
| nose region | `FACE_LANDMARKS_NOSE` | connected branched graph | blocked |
| left brow curve | `FACE_LANDMARKS_LEFT_EYEBROW` | two disconnected open chains | blocked |
| right brow curve | `FACE_LANDMARKS_RIGHT_EYEBROW` | two disconnected open chains | blocked |
| brow midline point | no direct provider topology contract | derived point | blocked |

Pinned research summaries:

```text
LEFT_EYE / RIGHT_EYE
edgeCount = 16
components = 1
cycleRank = 1
maxDegree = 2

LEFT_EYEBROW / RIGHT_EYEBROW
edgeCount = 8
components = 2
cycleRank = 0
maxDegree = 2

NOSE
edgeCount = 25
components = 1
cycleRank = 2
maxDegree = 3
```

These summaries are research observations of the upstream structure, not a release-attested runtime topology contract.

## 4. Correction from FR-16 draft v0.1

The initial draft allowed:

```text
eye connection vertices
→ convex hull
→ neutral eye region

nose connection vertices
→ convex hull
→ neutral nose region
```

This has been removed.

Reason:

```text
convex hull
= newly invented geometry
```

It can erase concavity and change the provider-observed boundary.

For the nose the problem is stronger: its provider graph is branched and is not itself a single region boundary. Converting that graph into a polygon would require an explicit neutral derivation methodology.

Therefore:

```text
nose
→ blocked_requires_region_derivation_definition
```

## 5. Eye research candidate

The eye connection graphs are structurally different from the brow/nose graphs: they form a single closed cycle.

FR-16 therefore allows one narrow research operation:

```text
release-exact closed-cycle edges
+ normalized provider x/y points
→ deterministic cycle ordering
→ neutral region boundary candidate
```

The current implementation only provides the deterministic graph-ordering/test-vector function.

It does **not** execute the upstream master topology against user images because:

1. exact npm `0.10.35` topology is not release-attested;
2. the current FaceLab production-neutral contract is unpublished;
3. provider laterality/orientation has not been verified through a controlled fixture.

No convex hull or smoothing is permitted in this stage.

## 6. Brow mismatch

Each provider eyebrow connection set consists of two disconnected contour chains.

FR-15 currently requires one neutral `curve` per brow.

The adapter is forbidden from inventing:

```text
upper chain selection
lower chain selection
midline averaging
bridge segment
Bezier smoothing
arbitrary centerline
```

Current state:

```text
left_brow
→ blocked_requires_curve_derivation_definition

right_brow
→ blocked_requires_curve_derivation_definition
```

## 7. Brow midline

There is no direct provider topology contract for the neutral `brow_midline` point required by FR-14/FR-15.

It remains:

```text
blocked_requires_midline_derivation_definition
```

It must not be calculated from provider indices by developer intuition.

## 8. Nose region

`FACE_LANDMARKS_NOSE` is a branched graph, not a canonical closed perimeter.

Current state:

```text
nose
→ blocked_requires_region_derivation_definition
```

Explicitly forbidden in FR-16:

```text
convex hull
bounding box
manual subset of nose indices
hand-drawn polygon
```

unless a separately reviewed neutral derivation definition authorizes that transformation.

This also prevents accidental promotion such as:

```text
provider nose graph
→ 山根 / 年壽 / 準頭
```

Those are traditional semantic anchors and require their own methodology/operationalization authority.

## 9. Deterministic test vectors

FR-16 includes provider-neutral synthetic graph tests only.

A synthetic closed cycle is used to verify:

```text
same edge set
+ same x/y point map
→ same ordered boundary
```

The ordering rule is deterministic:

1. every vertex must have degree 2;
2. `E = V`;
3. the graph must be one connected cycle;
4. start at the numerically smallest provider vertex;
5. choose the numerically smaller start neighbor;
6. walk the cycle without reshaping geometry.

Tests reject:

```text
branched graph
disconnected cycles
duplicate undirected edge
out-of-range normalized coordinate
provider-specific `z` field inside neutral point
```

This is verification tooling, not runtime face interpretation authority.

## 10. Readiness

FR-16 is intentionally incapable of reporting production readiness.

```text
productionReady = false
authorityState = research_only
```

Current research candidate slots:

```text
neutral.face.left_eye_region
neutral.face.right_eye_region
```

Current blocked slots:

```text
neutral.face.nose_region
neutral.face.left_brow_region
neutral.face.right_brow_region
neutral.face.brow_midline
```

Global blockers:

1. FR-14 FaceLab provider profile remains blocked and has no `providerContractVersion`.
2. upstream topology evidence is not release-exact evidence for npm `0.10.35`.
3. nose/brow/brow-midline derivation authority is absent.
4. provider geometry cannot become traditional physiognomy semantics in this layer.

## 11. Safety / authority boundary

FR-16 evidence may describe provider topology because that is the layer's explicit research purpose.

It may not create:

```text
traditional anchor equivalence
physiognomy claim
fortune claim
identity template
face embedding
```

Correct flow remains:

```text
provider topology
→ reviewed neutral adapter
→ FR-15 neutral observation
→ separate traditional operationalization
→ Face Reading rule
```

Never:

```text
MediaPipe index
→ 山根
→ fortune claim
```

## 12. Next

FR-17 should not jump directly into traditional region polygons.

The next implementation target is:

```text
Neutral Derivation Registry
├─ nose region derivation
├─ brow curve representation
└─ brow-midline derivation
```

Each derivation must define:

```text
input neutral/provider evidence class
exact deterministic transformation
output geometry kind
quality/pose prerequisites
failure/unavailable semantics
version
review state
```

Only after those definitions and release-exact provider evidence exist should FR-14 be reconsidered for `candidate` activation.
