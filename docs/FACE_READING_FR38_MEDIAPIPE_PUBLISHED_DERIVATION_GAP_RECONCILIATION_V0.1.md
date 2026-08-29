# FACE READING FR-38 — Published Derivation Gap Reconciliation v0.1

## Status

**Release-exact eyebrow graph shape attested / neutral derivation algorithms still blocked**

FR-38 reconciles four authority layers that previously described different provider surfaces:

- FR-16: upstream MediaPipe source topology structure witness
- FR-17: neutral brow/nose derivation blockers
- FR-35/FR-36: Three Divisions neutral surfaces and seven vertical-reference contracts
- FR-37: exact published `@mediapipe/tasks-vision@0.10.35` `FaceLandmarker` named runtime surface

The main finding is that these layers are not equivalent.

## 1. Eyebrow topology: published and measurable, but not yet a neutral curve

The exact published runtime exposes:

- `FACE_LANDMARKS_LEFT_EYEBROW`
- `FACE_LANDMARKS_RIGHT_EYEBROW`

FR-38 reflects the actual installed runtime connection arrays and verifies each graph as:

```text
edge count             = 8
vertex count           = 10
connected components   = 2
cycle rank             = 0
max vertex degree      = 2
```

This independently reproduces the FR-16 structural description `disconnected_open_chains` against the exact published package runtime instead of treating the upstream master source witness as release-exact.

It still does **not** authorize:

```text
two disconnected provider chains
→ one neutral eyebrow curve
```

A reviewed deterministic single-curve derivation remains required for both left and right brows. FR-17 therefore remains blocked and `brow_midline` remains dependency-blocked behind those two curves.

## 2. Nose topology: FR-16 witness is upstream-only

FR-16 records `FACE_LANDMARKS_NOSE` from the pinned upstream MediaPipe source witness, but explicitly marks that witness as not release-exact for the installed package.

FR-37 proves that the exact published `FaceLandmarker` static API in `@mediapipe/tasks-vision@0.10.35` does **not** expose `FACE_LANDMARKS_NOSE` as a named topology.

Therefore FR-38 classifies both:

- `shangen`
- `zhuntou`

as:

```text
upstream_master_only_not_release_exact
```

This does not prove that nose geometry is impossible to derive from the complete landmark graph. It proves only that the FR-16 named nose topology cannot be promoted to exact published-package authority.

## 3. FR-35 extension surfaces remain direct named-topology gaps

The following remain without a direct published named topology binding:

- `neutral.face.hairline_boundary`
- `neutral.face.philtrum_region`
- `neutral.face.chin_inferior_contour`

FR-37 candidate surfaces such as face oval, contours, lips, and tessellation remain **search surfaces only**. FR-38 does not select their edges or landmark indices.

## 4. Seven Three Divisions vertical-reference states

| Anchor | Current provider evidence | Current blocker |
| --- | --- | --- |
| hairline | no direct published named surface | reviewed neutral surface extraction absent |
| brow | exact published eyebrow graph shape attested | two disconnected chains; reviewed single-curve derivation absent |
| yintang | derived neutral point | depends on reviewed left/right brow curves and brow-midline derivation |
| shangen | FR-16 upstream-only `FACE_LANDMARKS_NOSE` | no release-exact named nose surface or reviewed nose-region derivation |
| zhuntou | FR-16 upstream-only `FACE_LANDMARKS_NOSE` | no release-exact named nose surface or reviewed nose-region derivation |
| renzhong | no direct published named surface | reviewed philtrum extraction absent |
| dige | no direct published named surface | reviewed inferior-chin extraction absent |

Result:

```text
all seven vertical references executable = false
Three Divisions production metric ready = false
```

## 5. Hard boundary

FR-38 keeps all of these false:

- upstream master topology can be promoted to release-exact evidence
- published named topology equals neutral geometry
- published eyebrow graph equals a single neutral brow curve
- missing named nose topology means extraction is impossible
- provider landmark-index authority
- traditional↔neutral equivalence
- automatic FR-33 source-variant selection
- vertical-reference formula authorization
- production Three Divisions metrics
- production F1/F6

## 6. Verification

The FR-38 test imports the actual installed `FaceLandmarker` from the exact package and:

1. reuses FR-37 exact static-surface reflection;
2. reads the published left/right eyebrow connection arrays;
3. derives graph topology independently;
4. requires the exact 8/10/2/0/2 graph summary for both brows;
5. confirms `FACE_LANDMARKS_NOSE` is not a published named runtime topology;
6. confirms all FR-17 derivation algorithms remain null/blocked;
7. rejects attempted nose or eyebrow authority promotion.

## 7. Next slice

The next implementation should not jump to Three Divisions length measurement.

The nearest tractable dependency is the eyebrow path:

```text
published two-chain brow graph
→ candidate neutral single-curve representation(s)
→ explicit deterministic transformation spec
→ stability/calibration evidence
→ research_candidate only
```

The nose path requires a separate release-exact full-landmark/subgraph study because the published package has no direct named nose topology surface.
