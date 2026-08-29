# FACE READING FR-40 — Exact Eyebrow Source / Runtime Semantic Gap v0.1

## Status

**Exact v0.10.35 source ↔ installed runtime edges attested / component semantics absent / no neutral candidate admitted**

FR-39 measured each published eyebrow topology as two disconnected 4-edge open paths. FR-40 answers the next question:

> Does the exact MediaPipe `v0.10.35` source assign separate anatomical or semantic roles to those two provider components?

Result: **no such component-level role is supplied by the reviewed Web FaceLandmarker source surface.**

## Exact source witnesses

Reviewed directly at `google-ai-edge/mediapipe` tag `v0.10.35`:

1. `mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts`
   - blob: `644de9d8c7cd90880d92b2393b4913fa93ace927`
2. `mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts`
   - blob: `6d9b2f713345fb576301f40c3d520829ab5f23be`

The connection source labels the complete eight-edge sets only as:

```text
Landmarks for left eyebrow
Landmarks for right eyebrow
```

The public static API similarly describes each complete set only as connections for drawing the left/right eyebrow.

It does not expose separate public symbols or comments for either disconnected component.

## Exact source ↔ installed runtime agreement

FR-40 pins the exact tag-source edge order and compares it against the installed `@mediapipe/tasks-vision@0.10.35` runtime.

Left:

```text
276-283-282-295-285
300-293-334-296-336
```

Right:

```text
46-53-52-65-55
70-63-105-66-107
```

The test requires exact edge-sequence agreement between the tagged source and `FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW` / `RIGHT_EYEBROW`.

These indices are provider source/runtime evidence only. They are not neutral-observation landmark authority.

## Semantic gap

The reviewed exact source establishes only:

```text
the full eight-edge set = eyebrow drawing connections
```

It does not establish:

```text
first path = upper brow
second path = lower brow
first path = inner brow
second path = outer brow
first path = preferred neutral brow curve
second path = preferred neutral brow curve
source order = component priority
```

Nor does it establish that the two paths are paired boundaries with pointwise correspondence.

## Candidate admission matrix

FR-40 defines three bounded future candidate classes, all still blocked:

### A. Single provider component curve

Blocked because MediaPipe source does not assign a neutral/anatomical role to either provider component.

Required before admission includes external neutral/anatomical mapping, left/right reproducibility, pose/expression stability, repeated-capture evidence, and calibration fixtures.

Forbidden shortcut:

```text
first_chain_only
second_chain_only
```

### B. Paired provider components as a region

Blocked because there is no authority that the paths are paired region boundaries, no endpoint correspondence authority, and no reviewed closure rule.

Forbidden shortcut:

```text
bridge_disconnected_chains
hand_drawn_polygon
```

### C. Correspondence-derived centerline

Blocked because no cross-component correspondence has been established and no centerline formula is reviewed.

Forbidden shortcut:

```text
pointwise_average_without_correspondence_authority
bezier_smoothing
```

All three candidates remain:

```text
algorithmRef = null
researchCandidateAdmitted = false
reviewed = false
```

## Authority boundary

FR-40 keeps all of the following false:

- exact provider edge pair implies neutral landmark authority
- source order implies component priority
- first/second four edges imply preferred curve
- disconnected paths imply upper/lower boundaries
- disconnected paths imply inner/outer boundaries
- indexwise cross-component correspondence
- endpoint bridging
- candidate admission without external neutral evidence
- neutral brow curve algorithm authorization
- brow-midline algorithm authorization
- production Three Divisions metric / F1 / F6

## Next slice

The MediaPipe provider-source path is now exhausted for eyebrow component semantics.

The next valid evidence must come from outside that provider API surface and must answer a neutral geometry question, not a traditional physiognomy question:

```text
what reproducible geometric representation of the visible eyebrow should MyeongHa's neutral observation contract expose?
```

Only after external neutral/anatomical rationale plus stability/calibration evidence exists may one of the bounded candidates become `research_candidate` in FR-17.
