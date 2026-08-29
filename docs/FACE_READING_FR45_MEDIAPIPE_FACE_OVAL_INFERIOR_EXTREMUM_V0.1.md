# FR-45 — MediaPipe FACE_OVAL inferior-extremum probe

## Status

FR-45 establishes a release-exact, provider-neutral extraction candidate for the inferior image-space extremum of the published MediaPipe face oval. It does **not** bind that point to the FR-35 `chin_inferior_contour` surface, to the traditional anchor `地閣`, or to the FR-36 production vertical reference.

## Why dige/chin was selected before the other blocked 三停 anchors

The exact published `@mediapipe/tasks-vision@0.10.35` API exposes `FACE_LANDMARKS_FACE_OVAL`. By contrast:

- hairline has no direct named MediaPipe topology and the face oval must not be silently reinterpreted as a hairline;
- philtrum has no direct named topology;
- the installed published JS API has no named nose topology for `shangen` / `zhuntou`;
- brow/interbrow remain dependent on the separate empirical eyebrow-validation dataset opened by FR-43/FR-44.

Therefore the face oval is the strongest currently available release-exact provider surface for a new neutral-geometry extraction experiment.

## Exact source witness

Repository: `google-ai-edge/mediapipe`

Ref: `v0.10.35`

Path: `mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts`

Blob SHA: `644de9d8c7cd90880d92b2393b4913fa93ace927`

Symbol: `FACE_LANDMARKS_FACE_OVAL`

The source contains 36 ordered connection edges. FR-45 reflects the installed runtime `FaceLandmarker.FACE_LANDMARKS_FACE_OVAL` and requires the runtime edge sequence to match that exact source sequence.

## Structural contract

The exact face oval must remain:

- 36 edges;
- 36 unique vertices;
- one connected component;
- cycle rank 1;
- maximum vertex degree 2;
- a simple cycle.

Provider landmark indices are preserved only as provenance/evidence. Their integer values carry no anatomical or traditional semantic authority.

## Candidate algorithm

`algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0`

Input: exact published `FACE_LANDMARKS_FACE_OVAL` vertices plus normalized image-space landmark coordinates.

Rule: select the vertex having the **maximum normalized image y** among all exact face-oval vertices.

Tie policy: exact numeric ties are returned as `ambiguous_exact_tie`. FR-45 introduces no epsilon, provider-index priority, source-order priority, or hand-selected chin subgraph.

This is intentionally a geometric operation. A synthetic test makes a non-152 face-oval vertex the lower-most point and verifies that the algorithm follows geometry rather than a hardcoded provider index.

## Runtime evidence

The FR-45 browser workflow uses the same pinned real MediaPipe package/model/fixture chain already used by the face-reading runtime gates and runs detection twice on the same fixture. It records whether the face-oval inferior extremum is unique and whether both replays are byte-for-byte deterministic at the probe-result level.

The runtime artifact may record the observed provider landmark index, but the workflow does not assert that any particular index is anatomically the chin or `地閣`.

## Authority boundary

FR-45 does **not** authorize any of the following:

- `FACE_OVAL` = `chin_inferior_contour`;
- a provider landmark index = anatomical landmark identity;
- image-space inferior extremum = mid-sagittal chin point;
- image-space inferior extremum = `地閣`;
- FR-35 provider binding;
- FR-36 dige vertical-reference promotion;
- 三停 source-variant selection;
- production Three Divisions metrics;
- F1 or F6.

## Next evidence required

1. Independent anatomical evidence connecting the neutral inferior facial outline to the intended chin-inferior target without relying on MediaPipe index semantics.
2. Controlled multi-subject capture evidence for uniqueness, pose stability, and repeated-capture repeatability.
3. A reviewed rule determining whether a point extremum can satisfy or be derived from the FR-35 curve surface `neutral.face.chin_inferior_contour`.
4. Separate traditional-neutral equivalence review before any `地閣` or 三停 use.
